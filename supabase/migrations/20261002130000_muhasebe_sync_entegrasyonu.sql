-- "Muhasebe Sync" ayarları (klinikteki klinik_muhasebe_entegrasyonu'nun fitness karşılığı): işletme başına Paraşüt API kimlik bilgileri.
--  * Ayrı tabloda tutulur; client_secret YALAN OKUNMAZ: authenticated rolüne kolon bazlı SELECT verilir (secret hariç),
--    "secret tanımlı mı" bilgisi türetilmiş boolean kolonla görünür. Yazma yalnız SECURITY DEFINER fonksiyonla.
--  * Secret alanı boş bırakılırsa mevcut değer korunur.
--  * Audit tetikleyicisi BİLEREK yok (audit_kaydet secret'ı log'a taşırdı).
-- Paraşüt API çağrısı henüz yazılmadı: "bağlandı" yalnız üç bilginin de girildiği anlamına gelir (klinikteki gibi).
-- (UYGULANMADI.) İdempotent tek blok.

CREATE TABLE IF NOT EXISTS public.isletme_muhasebe_entegrasyonu (
  isletme_id uuid PRIMARY KEY REFERENCES public.isletme(id) ON DELETE CASCADE,
  parasut_client_id text,
  parasut_client_secret text,
  parasut_company_id text,
  secret_tanimli boolean GENERATED ALWAYS AS (parasut_client_secret IS NOT NULL) STORED,
  baglanti_durumu text NOT NULL DEFAULT 'bekliyor' CHECK (baglanti_durumu IN ('bekliyor', 'baglandi')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_muhasebe_entegrasyonu_updated_at ON public.isletme_muhasebe_entegrasyonu;
CREATE TRIGGER trg_muhasebe_entegrasyonu_updated_at BEFORE UPDATE ON public.isletme_muhasebe_entegrasyonu FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.isletme_muhasebe_entegrasyonu ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.isletme_muhasebe_entegrasyonu FROM anon, authenticated;
GRANT SELECT (isletme_id, parasut_client_id, parasut_company_id, secret_tanimli, baglanti_durumu, updated_at) ON public.isletme_muhasebe_entegrasyonu TO authenticated;
DROP POLICY IF EXISTS "muhasebe_entegrasyonu_select" ON public.isletme_muhasebe_entegrasyonu;
CREATE POLICY "muhasebe_entegrasyonu_select" ON public.isletme_muhasebe_entegrasyonu FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'muhasebe'))
    OR (SELECT public.is_super_admin())
  );
-- Yazma yetkisi YOK — yalnız aşağıdaki SECURITY DEFINER fonksiyon.

CREATE OR REPLACE FUNCTION public.muhasebe_entegrasyonu_kaydet(p_client_id text, p_client_secret text, p_company_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  v_client text := nullif(btrim(p_client_id), '');
  v_company text := nullif(btrim(p_company_id), '');
  v_secret text := nullif(btrim(p_client_secret), '');
  v_mevcut text;
  v_durum text;
BEGIN
  IF v_client IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'muhasebe_bilgi_eksik';
  END IF;
  SELECT parasut_client_secret INTO v_mevcut FROM public.isletme_muhasebe_entegrasyonu WHERE isletme_id = v_isletme;
  v_secret := coalesce(v_secret, v_mevcut);
  v_durum := CASE WHEN v_secret IS NOT NULL THEN 'baglandi' ELSE 'bekliyor' END;
  INSERT INTO public.isletme_muhasebe_entegrasyonu (isletme_id, parasut_client_id, parasut_client_secret, parasut_company_id, baglanti_durumu)
  VALUES (v_isletme, v_client, v_secret, v_company, v_durum)
  ON CONFLICT (isletme_id) DO UPDATE
    SET parasut_client_id = excluded.parasut_client_id,
        parasut_client_secret = excluded.parasut_client_secret,
        parasut_company_id = excluded.parasut_company_id,
        baglanti_durumu = excluded.baglanti_durumu;
  RETURN v_durum;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.muhasebe_entegrasyonu_kaydet(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.muhasebe_entegrasyonu_kaydet(text, text, text) TO authenticated;

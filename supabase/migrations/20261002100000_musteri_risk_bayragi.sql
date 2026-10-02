-- Müşteri risk bayrakları (klinikteki hasta "Risk Bandı"nın fitness karşılığı): sağlık/sakatlık/güvenlik uyarıları
-- tip + seviye (yüksek/orta/düşük) + kısa açıklama ile tutulur; müşteri kartının üstünde bant olarak görünür.
--  * Bayrak silinmez: "kaldırıldı" işaretlenir (kim/ne zaman kayıtlıdır), geçmiş korunur.
--  * Sağlık verisi özel nitelikli KVKK verisidir: yalnız işletme yöneticisi ve resepsiyon okur/yazar; muhasebe ve antrenör GÖRMEZ.
--  * Yazma yalnız SECURITY DEFINER fonksiyonlarla; işletme/müşteri bağlamı oturumdan ve müşteri kaydından türetilir.
-- (UYGULANMADI — önce 20260930110000 uygulanmış olmalı.) İdempotent tek blok.

CREATE TABLE IF NOT EXISTS public.musteri_risk_bayragi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL,
  tip text NOT NULL CHECK (tip IN ('kalp_tansiyon', 'diyabet', 'astim', 'alerji', 'hamilelik', 'epilepsi', 'kalp_pili', 'metal_implant', 'sakatlik', 'diger')),
  seviye text NOT NULL CHECK (seviye IN ('yuksek', 'orta', 'dusuk')),
  aciklama text CHECK (aciklama IS NULL OR char_length(aciklama) <= 200),
  aktif boolean NOT NULL DEFAULT true,
  kaldiran_kullanici_id uuid REFERENCES public.kullanici(id) ON DELETE SET NULL,
  kaldirma_tarihi timestamptz,
  olusturan_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (musteri_id, isletme_id) REFERENCES public.musteri (id, isletme_id) ON DELETE CASCADE,
  CONSTRAINT risk_kaldirma_kurali CHECK (aktif = (kaldirma_tarihi IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_risk_musteri ON public.musteri_risk_bayragi (musteri_id) WHERE aktif;

DROP TRIGGER IF EXISTS trg_risk_updated_at ON public.musteri_risk_bayragi;
CREATE TRIGGER trg_risk_updated_at BEFORE UPDATE ON public.musteri_risk_bayragi FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_risk ON public.musteri_risk_bayragi;
CREATE TRIGGER trg_audit_risk AFTER INSERT OR UPDATE ON public.musteri_risk_bayragi FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.musteri_risk_bayragi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.musteri_risk_bayragi FROM anon, authenticated;
GRANT SELECT ON public.musteri_risk_bayragi TO authenticated;
DROP POLICY IF EXISTS "risk_select" ON public.musteri_risk_bayragi;
CREATE POLICY "risk_select" ON public.musteri_risk_bayragi FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'))
    OR (SELECT public.is_super_admin())
  );
-- Yazma yetkisi YOK — yalnız aşağıdaki SECURITY DEFINER fonksiyonlar.

CREATE OR REPLACE FUNCTION public.risk_bayragi_ekle(p_musteri_id uuid, p_tip text, p_seviye text, p_aciklama text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon']);
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.musteri WHERE id = p_musteri_id AND isletme_id = v_isletme) THEN
    RAISE EXCEPTION 'musteri_bulunamadi';
  END IF;
  -- Aynı tipte AKTİF bayrak tekrar eklenmez (önce kaldırılır/güncellenir).
  IF EXISTS (SELECT 1 FROM public.musteri_risk_bayragi WHERE musteri_id = p_musteri_id AND tip = p_tip AND aktif) THEN
    RAISE EXCEPTION 'risk_zaten_var';
  END IF;
  INSERT INTO public.musteri_risk_bayragi (isletme_id, musteri_id, tip, seviye, aciklama)
  VALUES (v_isletme, p_musteri_id, p_tip, p_seviye, nullif(btrim(p_aciklama), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.risk_bayragi_ekle(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.risk_bayragi_ekle(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.risk_bayragi_kaldir(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon']);
BEGIN
  UPDATE public.musteri_risk_bayragi
     SET aktif = false, kaldirma_tarihi = now(), kaldiran_kullanici_id = auth.uid()
   WHERE id = p_id AND isletme_id = v_isletme AND aktif;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'risk_bulunamadi';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.risk_bayragi_kaldir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.risk_bayragi_kaldir(uuid) TO authenticated;

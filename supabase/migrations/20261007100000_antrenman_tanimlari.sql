-- Yönetim > Antrenman Tanımları (klinikteki Tedavi Tanımları + İşlem Tanımlama yapısının fitness uyarlaması).
-- * egzersiz_kutuphanesi: işletme bazlı tekrar kullanılabilir hareket kataloğu (ad, ekipman, varsayılan süre). Antrenman adımları
--   buradan seçilip ön doldurulur; adıma FK YOK (kütüphane sonradan değişse/silinse mevcut antrenman tanımları etkilenmez).
-- * antrenman_program_sablonu: bir antrenman tanımı (ad, açıklama); toplam süre adımların toplamıdır, trigger'la güncel tutulur.
-- * antrenman_program_sablonu_adimi: tanımın sıralı adımları (hareket, ekipman, set, tekrar, süre).
-- Okuma: işletmenin tüm rolleri (antrenör programı görür). Yazma: yalnız isletme_admin; şablon+adım yazımı tek RPC'dedir. Idempotent.

-- 1) Egzersiz kütüphanesi ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.egzersiz_kutuphanesi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  ad text NOT NULL CHECK (char_length(btrim(ad)) >= 2),
  ekipman text CHECK (ekipman IS NULL OR char_length(btrim(ekipman)) BETWEEN 2 AND 100),
  sure_dakika integer CHECK (sure_dakika IS NULL OR sure_dakika BETWEEN 1 AND 480),
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (isletme_id, ad)
);

DROP TRIGGER IF EXISTS trg_egzersiz_kutuphanesi_updated_at ON public.egzersiz_kutuphanesi;
CREATE TRIGGER trg_egzersiz_kutuphanesi_updated_at
  BEFORE UPDATE ON public.egzersiz_kutuphanesi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.egzersiz_kutuphanesi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.egzersiz_kutuphanesi FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.egzersiz_kutuphanesi TO authenticated;

DROP POLICY IF EXISTS "egzersiz_select" ON public.egzersiz_kutuphanesi;
CREATE POLICY "egzersiz_select" ON public.egzersiz_kutuphanesi FOR SELECT TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) OR (SELECT public.is_super_admin()));
DROP POLICY IF EXISTS "egzersiz_insert" ON public.egzersiz_kutuphanesi;
CREATE POLICY "egzersiz_insert" ON public.egzersiz_kutuphanesi FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');
DROP POLICY IF EXISTS "egzersiz_update" ON public.egzersiz_kutuphanesi;
CREATE POLICY "egzersiz_update" ON public.egzersiz_kutuphanesi FOR UPDATE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');

-- 2) Antrenman tanımı (şablon) ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.antrenman_program_sablonu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  ad text NOT NULL CHECK (char_length(btrim(ad)) >= 2),
  aciklama text CHECK (aciklama IS NULL OR char_length(aciklama) <= 500),
  sure_dakika integer,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, isletme_id),
  UNIQUE (isletme_id, ad)
);

DROP TRIGGER IF EXISTS trg_antrenman_sablonu_updated_at ON public.antrenman_program_sablonu;
CREATE TRIGGER trg_antrenman_sablonu_updated_at
  BEFORE UPDATE ON public.antrenman_program_sablonu
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.antrenman_program_sablonu ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.antrenman_program_sablonu FROM anon, authenticated;
-- Oluşturma/düzenleme yalnız RPC'den; doğrudan yalnız aktiflik değişir (toplam süre trigger'a aittir).
GRANT SELECT ON public.antrenman_program_sablonu TO authenticated;
GRANT UPDATE (aktif) ON public.antrenman_program_sablonu TO authenticated;

DROP POLICY IF EXISTS "antrenman_sablonu_select" ON public.antrenman_program_sablonu;
CREATE POLICY "antrenman_sablonu_select" ON public.antrenman_program_sablonu FOR SELECT TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) OR (SELECT public.is_super_admin()));
DROP POLICY IF EXISTS "antrenman_sablonu_update" ON public.antrenman_program_sablonu;
CREATE POLICY "antrenman_sablonu_update" ON public.antrenman_program_sablonu FOR UPDATE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');

-- 3) Antrenman adımları ----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.antrenman_program_sablonu_adimi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL,
  sablon_id uuid NOT NULL,
  ad text NOT NULL CHECK (char_length(btrim(ad)) >= 2),
  ekipman text CHECK (ekipman IS NULL OR char_length(btrim(ekipman)) BETWEEN 2 AND 100),
  set_sayisi integer CHECK (set_sayisi IS NULL OR set_sayisi BETWEEN 1 AND 50),
  tekrar text CHECK (tekrar IS NULL OR char_length(btrim(tekrar)) BETWEEN 1 AND 20),
  sure_dakika integer CHECK (sure_dakika IS NULL OR sure_dakika BETWEEN 1 AND 480),
  sira integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (sablon_id, isletme_id) REFERENCES public.antrenman_program_sablonu (id, isletme_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_antrenman_adimi_sablon ON public.antrenman_program_sablonu_adimi (sablon_id, sira);

DROP TRIGGER IF EXISTS trg_antrenman_adimi_updated_at ON public.antrenman_program_sablonu_adimi;
CREATE TRIGGER trg_antrenman_adimi_updated_at
  BEFORE UPDATE ON public.antrenman_program_sablonu_adimi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.antrenman_program_sablonu_adimi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.antrenman_program_sablonu_adimi FROM anon, authenticated;
GRANT SELECT ON public.antrenman_program_sablonu_adimi TO authenticated;

DROP POLICY IF EXISTS "antrenman_adimi_select" ON public.antrenman_program_sablonu_adimi;
CREATE POLICY "antrenman_adimi_select" ON public.antrenman_program_sablonu_adimi FOR SELECT TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) OR (SELECT public.is_super_admin()));

-- 4) Toplam süre denormalizasyonu ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.antrenman_toplam_sure_guncelle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sablon uuid := coalesce(NEW.sablon_id, OLD.sablon_id);
BEGIN
  UPDATE public.antrenman_program_sablonu
     SET sure_dakika = (SELECT sum(sure_dakika)::integer FROM public.antrenman_program_sablonu_adimi WHERE sablon_id = v_sablon)
   WHERE id = v_sablon;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.antrenman_toplam_sure_guncelle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_antrenman_adimi_toplam_sure ON public.antrenman_program_sablonu_adimi;
CREATE TRIGGER trg_antrenman_adimi_toplam_sure
  AFTER INSERT OR UPDATE OR DELETE ON public.antrenman_program_sablonu_adimi
  FOR EACH ROW EXECUTE FUNCTION public.antrenman_toplam_sure_guncelle();

-- 5) Atomik kaydetme RPC'si ------------------------------------------------------------------------------------
-- Tek çağrıda tanım + adım listesi: gönderilen id'ler UPDATE, id'siz olanlar INSERT, gönderilmeyen mevcut adımlar DELETE.
CREATE OR REPLACE FUNCTION public.antrenman_tanimi_kaydet(
  p_id uuid,
  p_ad text,
  p_aciklama text,
  p_adimlar jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  v_sablon uuid;
  v_adim jsonb;
  v_sira integer := 0;
  v_gonderilen uuid[] := '{}';
  v_adim_id uuid;
BEGIN
  IF p_ad IS NULL OR char_length(btrim(p_ad)) < 2 THEN
    RAISE EXCEPTION 'adim_gecersiz';
  END IF;
  IF p_adimlar IS NULL OR jsonb_typeof(p_adimlar) <> 'array' OR jsonb_array_length(p_adimlar) = 0 THEN
    RAISE EXCEPTION 'adim_gerekli';
  END IF;

  BEGIN
    IF p_id IS NULL THEN
      INSERT INTO public.antrenman_program_sablonu (isletme_id, ad, aciklama)
      VALUES (v_isletme, btrim(p_ad), nullif(btrim(p_aciklama), ''))
      RETURNING id INTO v_sablon;
    ELSE
      UPDATE public.antrenman_program_sablonu
         SET ad = btrim(p_ad), aciklama = nullif(btrim(p_aciklama), '')
       WHERE id = p_id AND isletme_id = v_isletme
      RETURNING id INTO v_sablon;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'antrenman_bulunamadi';
      END IF;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'antrenman_adi_mevcut';
  END;

  FOR v_adim IN SELECT * FROM jsonb_array_elements(p_adimlar)
  LOOP
    v_sira := v_sira + 1;
    IF char_length(btrim(coalesce(v_adim->>'ad', ''))) < 2 THEN
      RAISE EXCEPTION 'adim_gecersiz';
    END IF;

    IF nullif(v_adim->>'id', '') IS NOT NULL THEN
      UPDATE public.antrenman_program_sablonu_adimi SET
        ad = btrim(v_adim->>'ad'),
        ekipman = nullif(btrim(coalesce(v_adim->>'ekipman', '')), ''),
        set_sayisi = nullif(v_adim->>'set_sayisi', '')::integer,
        tekrar = nullif(btrim(coalesce(v_adim->>'tekrar', '')), ''),
        sure_dakika = nullif(v_adim->>'sure_dakika', '')::integer,
        sira = v_sira
      WHERE id = (v_adim->>'id')::uuid AND sablon_id = v_sablon AND isletme_id = v_isletme
      RETURNING id INTO v_adim_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'adim_bulunamadi';
      END IF;
    ELSE
      INSERT INTO public.antrenman_program_sablonu_adimi (isletme_id, sablon_id, ad, ekipman, set_sayisi, tekrar, sure_dakika, sira)
      VALUES (
        v_isletme, v_sablon, btrim(v_adim->>'ad'),
        nullif(btrim(coalesce(v_adim->>'ekipman', '')), ''),
        nullif(v_adim->>'set_sayisi', '')::integer,
        nullif(btrim(coalesce(v_adim->>'tekrar', '')), ''),
        nullif(v_adim->>'sure_dakika', '')::integer,
        v_sira
      )
      RETURNING id INTO v_adim_id;
    END IF;
    v_gonderilen := v_gonderilen || v_adim_id;
  END LOOP;

  DELETE FROM public.antrenman_program_sablonu_adimi
   WHERE sablon_id = v_sablon AND NOT (id = ANY (v_gonderilen));

  RETURN v_sablon;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.antrenman_tanimi_kaydet(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.antrenman_tanimi_kaydet(uuid, text, text, jsonb) TO authenticated;

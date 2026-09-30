-- F10: Şirket bilgileri (klinikteki "Şirket Bilgileri" karşılığı): kurumsal profil, adres, vergi, yetkili kişi, çalışma saatleri,
-- logo (açık/koyu tema) ve banka hesapları. (UYGULANMADI — önce 20260930180000 uygulanmış olmalı.)
--
--  * Bilgiler isletme satırında tutulur; yalnız işletme yöneticisi değiştirir (mevcut isletme_update_admin politikası).
--  * Banka hesapları: yalnız işletme yöneticisi ve muhasebe görür/yönetir. IBAN doğrulaması (TR + mod 97) veritabanında da yapılır.
--  * Logo: 'isletme-logo' herkese açık okunan bir depolama kovasıdır; yazma yalnız kendi işletme klasörüne ve yalnız yöneticiye açıktır
--    (yol: <isletme_id>/logo.<uzanti>). Depolama şeması yoksa (test ortamı) bu adım atlanır.
--  * audit_log yalnız değişen alan adlarını tutar.

-- 1) İşletme alanları ---------------------------------------------------------------------------------------------
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS unvan text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS il text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS ilce text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS mahalle text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS adres text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS vergi_dairesi text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS vergi_no text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS telefon text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS whatsapp_no text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS eposta text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS yetkili_kisi text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS yetkili_telefon text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS yetkili_eposta text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS logo_url_koyu text;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS hafta_ici_baslangic time;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS hafta_ici_bitis time;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS cumartesi_baslangic time;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS cumartesi_bitis time;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS pazar_baslangic time;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS pazar_bitis time;

ALTER TABLE public.isletme DROP CONSTRAINT IF EXISTS isletme_vergi_no_kurali;
ALTER TABLE public.isletme ADD CONSTRAINT isletme_vergi_no_kurali CHECK (vergi_no IS NULL OR vergi_no ~ '^[0-9]{10,11}$');
ALTER TABLE public.isletme DROP CONSTRAINT IF EXISTS isletme_eposta_kurali;
ALTER TABLE public.isletme ADD CONSTRAINT isletme_eposta_kurali CHECK (
  (eposta IS NULL OR eposta ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') AND (yetkili_eposta IS NULL OR yetkili_eposta ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
ALTER TABLE public.isletme DROP CONSTRAINT IF EXISTS isletme_telefon_kurali;
ALTER TABLE public.isletme ADD CONSTRAINT isletme_telefon_kurali CHECK (
  (telefon IS NULL OR telefon ~ '^\+90[0-9]{10}$') AND (whatsapp_no IS NULL OR whatsapp_no ~ '^\+90[0-9]{10}$') AND (yetkili_telefon IS NULL OR yetkili_telefon ~ '^\+90[0-9]{10}$')
);
-- Çalışma saatleri: bir günün başlangıç ve bitişi ya ikisi de dolu ya da ikisi de boş (kapalı gün) olur.
-- NULL tuzağı: çiftler açıkça IS NULL / IS NOT NULL ile sınanır.
ALTER TABLE public.isletme DROP CONSTRAINT IF EXISTS isletme_saat_kurali;
ALTER TABLE public.isletme ADD CONSTRAINT isletme_saat_kurali CHECK (
  ((hafta_ici_baslangic IS NULL) = (hafta_ici_bitis IS NULL))
  AND ((cumartesi_baslangic IS NULL) = (cumartesi_bitis IS NULL))
  AND ((pazar_baslangic IS NULL) = (pazar_bitis IS NULL))
  AND (hafta_ici_baslangic IS NULL OR hafta_ici_baslangic <> hafta_ici_bitis)
  AND (cumartesi_baslangic IS NULL OR cumartesi_baslangic <> cumartesi_bitis)
  AND (pazar_baslangic IS NULL OR pazar_baslangic <> pazar_bitis)
);

-- 2) IBAN doğrulama (TR + 24 hane, mod 97) ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iban_gecerli(p_iban text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_iban text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  v_duzen text;
  v_kalan bigint := 0;
  v_harf text;
  v_parca text;
BEGIN
  IF v_iban !~ '^TR[0-9]{24}$' THEN
    RETURN false;
  END IF;
  -- İlk 4 karakter sona taşınır, harfler sayıya (A=10..Z=35) çevrilir, parça parça mod 97 alınır.
  v_duzen := substr(v_iban, 5) || substr(v_iban, 1, 4);
  v_parca := '';
  FOREACH v_harf IN ARRAY regexp_split_to_array(v_duzen, '') LOOP
    v_parca := v_parca || CASE WHEN v_harf ~ '[A-Z]' THEN (ascii(v_harf) - 55)::text ELSE v_harf END;
    IF length(v_parca) >= 9 THEN
      v_kalan := (v_kalan::text || v_parca)::bigint % 97;
      v_parca := '';
    END IF;
  END LOOP;
  IF v_parca <> '' THEN
    v_kalan := (v_kalan::text || v_parca)::bigint % 97;
  END IF;
  RETURN v_kalan = 1;
END;
$$;

-- 3) Banka hesapları -------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.isletme_banka_hesabi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  banka_adi text NOT NULL CHECK (char_length(btrim(banka_adi)) >= 2),
  sube text,
  hesap_sahibi text NOT NULL CHECK (char_length(btrim(hesap_sahibi)) >= 2),
  iban text NOT NULL CHECK (public.iban_gecerli(iban)),
  hesap_tipi text NOT NULL DEFAULT 'isletme' CHECK (hesap_tipi IN ('isletme', 'sahis')),
  sira integer NOT NULL DEFAULT 0,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, isletme_id),
  UNIQUE (isletme_id, iban)
);

-- IBAN boşluksuz büyük harfle saklanır (aynı hesabın iki biçimle eklenmesini önler).
CREATE OR REPLACE FUNCTION public.iban_duzenle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.iban := upper(regexp_replace(NEW.iban, '\s', '', 'g'));
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.iban_duzenle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_banka_iban_duzenle ON public.isletme_banka_hesabi;
CREATE TRIGGER trg_banka_iban_duzenle
  BEFORE INSERT OR UPDATE ON public.isletme_banka_hesabi
  FOR EACH ROW EXECUTE FUNCTION public.iban_duzenle();
DROP TRIGGER IF EXISTS trg_banka_updated_at ON public.isletme_banka_hesabi;
CREATE TRIGGER trg_banka_updated_at
  BEFORE UPDATE ON public.isletme_banka_hesabi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_banka ON public.isletme_banka_hesabi;
CREATE TRIGGER trg_audit_banka
  AFTER INSERT OR UPDATE ON public.isletme_banka_hesabi
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.isletme_banka_hesabi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.isletme_banka_hesabi FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.isletme_banka_hesabi TO authenticated;

DROP POLICY IF EXISTS "banka_select" ON public.isletme_banka_hesabi;
CREATE POLICY "banka_select" ON public.isletme_banka_hesabi FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'muhasebe'))
    OR (SELECT public.is_super_admin())
  );
DROP POLICY IF EXISTS "banka_insert" ON public.isletme_banka_hesabi;
CREATE POLICY "banka_insert" ON public.isletme_banka_hesabi FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'muhasebe'));
DROP POLICY IF EXISTS "banka_update" ON public.isletme_banka_hesabi;
CREATE POLICY "banka_update" ON public.isletme_banka_hesabi FOR UPDATE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'muhasebe'))
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'muhasebe'));
-- Silme yok: hesap "aktif = false" ile pasife alınır (geçmiş kayıtlar ve ödeme bilgileri bozulmaz).

-- 4) Logo depolama kovası (Supabase Storage; test ortamında yoksa atlanır) ------------------------------------------------
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $q$INSERT INTO storage.buckets (id, name, public) VALUES ('isletme-logo', 'isletme-logo', true) ON CONFLICT (id) DO NOTHING$q$;

    EXECUTE 'DROP POLICY IF EXISTS "isletme_logo_yukle" ON storage.objects';
    EXECUTE $q$CREATE POLICY "isletme_logo_yukle" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'isletme-logo' AND (storage.foldername(name))[1] = (SELECT public.current_isletme_id())::text AND (SELECT public.current_rol()) = 'isletme_admin')$q$;

    EXECUTE 'DROP POLICY IF EXISTS "isletme_logo_guncelle" ON storage.objects';
    EXECUTE $q$CREATE POLICY "isletme_logo_guncelle" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'isletme-logo' AND (storage.foldername(name))[1] = (SELECT public.current_isletme_id())::text AND (SELECT public.current_rol()) = 'isletme_admin')$q$;

    EXECUTE 'DROP POLICY IF EXISTS "isletme_logo_sil" ON storage.objects';
    EXECUTE $q$CREATE POLICY "isletme_logo_sil" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'isletme-logo' AND (storage.foldername(name))[1] = (SELECT public.current_isletme_id())::text AND (SELECT public.current_rol()) = 'isletme_admin')$q$;
  END IF;
END $$;

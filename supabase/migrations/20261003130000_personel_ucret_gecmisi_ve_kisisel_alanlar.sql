-- Personel kartı (klinik düzeni): ücret geçmişi + kişisel bilgi alanları. İdempotent tek blok.
--
--  A) personel_ucret_gecmisi: maaş veya ders başı prim HER değiştiğinde yeni satır (eski satır asla ezilmez). personel_profil üzerindeki bir
--     tetikleyici yazar; uygulama kodu değişmez. Hakediş hesabı bu tabloyu KULLANMAZ (formül aynı kalır): yalnız "hangi tarihte hangi ücret"
--     izlenebilirliği içindir. Maaş bilgisi yalnız yönetici ve muhasebe okur (kişi kendi satırlarını görür); audit_log'a değer yazılmaz.
--  B) personel_kisisel: doğum yeri, cinsiyet, pasaport no, SGK sicil no, çalışma tipi. Aynı gizlilik: yalnız yönetici (ve kişinin kendisi) okur,
--     yazma yalnız personel_kisisel_kaydet (yeni imza; eski imza DROP edilir).

-- A) Ücret geçmişi ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personel_ucret_gecmisi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL,
  kullanici_id uuid NOT NULL,
  maas_kurus bigint NOT NULL CHECK (maas_kurus >= 0),
  ders_prim_kurus bigint NOT NULL CHECK (ders_prim_kurus >= 0),
  gecerlilik_tarihi date NOT NULL DEFAULT public.bugun_istanbul(),
  kaydeden_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (kullanici_id, isletme_id) REFERENCES public.kullanici (id, isletme_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ucret_gecmisi_kisi ON public.personel_ucret_gecmisi (kullanici_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_ucret_gecmisi_degismez ON public.personel_ucret_gecmisi;
CREATE TRIGGER trg_ucret_gecmisi_degismez
  BEFORE UPDATE ON public.personel_ucret_gecmisi
  FOR EACH ROW EXECUTE FUNCTION public.personel_defter_koru();

ALTER TABLE public.personel_ucret_gecmisi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personel_ucret_gecmisi FROM anon, authenticated;
GRANT SELECT ON public.personel_ucret_gecmisi TO authenticated;
DROP POLICY IF EXISTS "ucret_gecmisi_select" ON public.personel_ucret_gecmisi;
CREATE POLICY "ucret_gecmisi_select" ON public.personel_ucret_gecmisi FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'muhasebe'))
    OR kullanici_id = (SELECT auth.uid())
    OR (SELECT public.is_super_admin())
  );
-- Yazma yetkisi YOK — yalnız aşağıdaki tetikleyici fonksiyonu.

CREATE OR REPLACE FUNCTION public.personel_ucret_gecmisi_yaz()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.maas_kurus = 0 AND NEW.ders_prim_kurus = 0 THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.maas_kurus IS NOT DISTINCT FROM OLD.maas_kurus AND NEW.ders_prim_kurus IS NOT DISTINCT FROM OLD.ders_prim_kurus THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.personel_ucret_gecmisi (isletme_id, kullanici_id, maas_kurus, ders_prim_kurus)
  VALUES (NEW.isletme_id, NEW.kullanici_id, NEW.maas_kurus, NEW.ders_prim_kurus);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_ucret_gecmisi_yaz() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_personel_ucret_gecmisi ON public.personel_profil;
CREATE TRIGGER trg_personel_ucret_gecmisi
  AFTER INSERT OR UPDATE ON public.personel_profil
  FOR EACH ROW EXECUTE FUNCTION public.personel_ucret_gecmisi_yaz();

-- Mevcut ücretler ilk satır olarak kaydedilir (yalnız hiç geçmişi olmayan, ücreti tanımlı personel).
INSERT INTO public.personel_ucret_gecmisi (isletme_id, kullanici_id, maas_kurus, ders_prim_kurus, gecerlilik_tarihi, kaydeden_kullanici_id)
SELECT p.isletme_id, p.kullanici_id, p.maas_kurus, p.ders_prim_kurus, (p.created_at AT TIME ZONE 'Europe/Istanbul')::date, NULL
  FROM public.personel_profil p
 WHERE (p.maas_kurus > 0 OR p.ders_prim_kurus > 0)
   AND NOT EXISTS (SELECT 1 FROM public.personel_ucret_gecmisi g WHERE g.kullanici_id = p.kullanici_id);

-- B) Kişisel bilgi alanları -----------------------------------------------------------------------------------------------------
ALTER TABLE public.personel_kisisel ADD COLUMN IF NOT EXISTS dogum_yeri text CHECK (dogum_yeri IS NULL OR char_length(dogum_yeri) <= 100);
ALTER TABLE public.personel_kisisel ADD COLUMN IF NOT EXISTS cinsiyet text CHECK (cinsiyet IS NULL OR cinsiyet IN ('kadin', 'erkek', 'belirtilmemis'));
ALTER TABLE public.personel_kisisel ADD COLUMN IF NOT EXISTS pasaport_no text CHECK (pasaport_no IS NULL OR pasaport_no ~ '^[A-Za-z0-9]{5,20}$');
ALTER TABLE public.personel_kisisel ADD COLUMN IF NOT EXISTS sgk_sicil_no text CHECK (sgk_sicil_no IS NULL OR sgk_sicil_no ~ '^[0-9A-Za-z-]{4,30}$');
ALTER TABLE public.personel_kisisel ADD COLUMN IF NOT EXISTS calisma_tipi text CHECK (calisma_tipi IS NULL OR calisma_tipi IN ('tam_zamanli', 'yari_zamanli', 'vardiyali', 'prim_usulu'));

DROP FUNCTION IF EXISTS public.personel_kisisel_kaydet(uuid, text, date, text, text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.personel_kisisel_kaydet(
  p_kullanici_id uuid,
  p_telefon text DEFAULT NULL,
  p_dogum_tarihi date DEFAULT NULL,
  p_tc text DEFAULT NULL,
  p_il text DEFAULT NULL,
  p_ilce text DEFAULT NULL,
  p_mahalle text DEFAULT NULL,
  p_adres_detay text DEFAULT NULL,
  p_acil_ad text DEFAULT NULL,
  p_acil_telefon text DEFAULT NULL,
  p_dogum_yeri text DEFAULT NULL,
  p_cinsiyet text DEFAULT NULL,
  p_pasaport text DEFAULT NULL,
  p_sgk_sicil text DEFAULT NULL,
  p_calisma_tipi text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  v_tc text := nullif(btrim(coalesce(p_tc, '')), '');
  v_pasaport text := nullif(btrim(coalesce(p_pasaport, '')), '');
  v_sgk text := nullif(btrim(coalesce(p_sgk_sicil, '')), '');
  v_cinsiyet text := nullif(btrim(coalesce(p_cinsiyet, '')), '');
  v_calisma text := nullif(btrim(coalesce(p_calisma_tipi, '')), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.kullanici WHERE id = p_kullanici_id AND isletme_id = v_isletme AND rol <> 'super_admin') THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;
  IF p_dogum_tarihi IS NOT NULL AND (p_dogum_tarihi > public.bugun_istanbul() OR p_dogum_tarihi < DATE '1900-01-01') THEN
    RAISE EXCEPTION 'dogum_tarihi_gecersiz';
  END IF;
  IF v_tc IS NOT NULL AND NOT public.tc_kimlik_gecerli(v_tc) THEN
    RAISE EXCEPTION 'tc_gecersiz';
  END IF;
  IF v_pasaport IS NOT NULL AND v_pasaport !~ '^[A-Za-z0-9]{5,20}$' THEN
    RAISE EXCEPTION 'pasaport_gecersiz';
  END IF;
  IF v_sgk IS NOT NULL AND v_sgk !~ '^[0-9A-Za-z-]{4,30}$' THEN
    RAISE EXCEPTION 'sgk_sicil_gecersiz';
  END IF;
  IF v_cinsiyet IS NOT NULL AND v_cinsiyet NOT IN ('kadin', 'erkek', 'belirtilmemis') THEN
    RAISE EXCEPTION 'cinsiyet_gecersiz';
  END IF;
  IF v_calisma IS NOT NULL AND v_calisma NOT IN ('tam_zamanli', 'yari_zamanli', 'vardiyali', 'prim_usulu') THEN
    RAISE EXCEPTION 'calisma_tipi_gecersiz';
  END IF;
  IF (nullif(btrim(coalesce(p_acil_ad, '')), '') IS NULL) <> (nullif(btrim(coalesce(p_acil_telefon, '')), '') IS NULL) THEN
    RAISE EXCEPTION 'acil_kisi_eksik';
  END IF;

  -- Form tüm alanları gönderir: boş alan "temizle" demektir.
  INSERT INTO public.personel_kisisel (kullanici_id, isletme_id, telefon, dogum_tarihi, tc_kimlik_no, il, ilce, mahalle, adres_detay, acil_durum_ad_soyad, acil_durum_telefon,
                                       dogum_yeri, cinsiyet, pasaport_no, sgk_sicil_no, calisma_tipi)
  VALUES (p_kullanici_id, v_isletme, nullif(btrim(coalesce(p_telefon, '')), ''), p_dogum_tarihi, v_tc, nullif(btrim(coalesce(p_il, '')), ''), nullif(btrim(coalesce(p_ilce, '')), ''),
          nullif(btrim(coalesce(p_mahalle, '')), ''), nullif(btrim(coalesce(p_adres_detay, '')), ''), nullif(btrim(coalesce(p_acil_ad, '')), ''), nullif(btrim(coalesce(p_acil_telefon, '')), ''),
          nullif(btrim(coalesce(p_dogum_yeri, '')), ''), v_cinsiyet, v_pasaport, v_sgk, v_calisma)
  ON CONFLICT (kullanici_id) DO UPDATE SET
    telefon = EXCLUDED.telefon, dogum_tarihi = EXCLUDED.dogum_tarihi, tc_kimlik_no = EXCLUDED.tc_kimlik_no, il = EXCLUDED.il, ilce = EXCLUDED.ilce,
    mahalle = EXCLUDED.mahalle, adres_detay = EXCLUDED.adres_detay, acil_durum_ad_soyad = EXCLUDED.acil_durum_ad_soyad, acil_durum_telefon = EXCLUDED.acil_durum_telefon,
    dogum_yeri = EXCLUDED.dogum_yeri, cinsiyet = EXCLUDED.cinsiyet, pasaport_no = EXCLUDED.pasaport_no, sgk_sicil_no = EXCLUDED.sgk_sicil_no, calisma_tipi = EXCLUDED.calisma_tipi;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_kisisel_kaydet(uuid, text, date, text, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personel_kisisel_kaydet(uuid, text, date, text, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;

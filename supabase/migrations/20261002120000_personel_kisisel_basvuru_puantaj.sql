-- Personel bölümü (klinik düzeni): kişisel bilgiler + belgeler, iş başvuruları, puantaj.
-- (UYGULANMADI — önce 20260930180000 (izin) ve 20260930210000 (QR) uygulanmış olmalı.) İdempotent tek blok.
--
--  A) personel_kisisel: telefon, doğum tarihi, T.C. kimlik no, adres, acil durum kişisi. ÖZEL/KİŞİSEL VERİ: yalnız işletme yöneticisi
--     (ve kişinin kendisi) okur; muhasebe ve resepsiyon GÖRMEZ. Yazma yalnız yönetici, SECURITY DEFINER fonksiyonla.
--     personel_belge: antrenör sertifikası, ilk yardım, sağlık raporu, sözleşme gibi belgelerin KAYDI (tür, kurum, geçerlilik bitişi);
--     dosya yükleme bu sürümde YOK. Kaldırılan belge silinmez (aktif = false).
--     Yıllık izin hakkı: doğum tarihi biliniyorsa 50 yaş ve üzeri için en az 20 gün (İş Kanunu m.53) — izin_hak_gun güncellendi.
--  B) is_basvurusu: herkese açık iş başvuru formundan gelen adaylar. Ekleme yalnız service_role (form sunucuda doğrulanır, hız sınırlı);
--     yönetici olumlu/olumsuz sonuçlandırır; olumlu başvuru, oluşturulan personel hesabına bağlanabilir. qr_kod_ayar'a 'is_basvurusu' tipi eklendi.
--  C) personel_puantaj: günlük devam kaydı (geldi / gelmedi / raporlu / yarım gün) + giriş-çıkış saati + fazla mesai (dk). Puantaj bu sürümde
--     KAYIT amaçlıdır; maaş hakedişini otomatik değiştirmez. Onaylı izin ve resmi tatil/Pazar satır yazılmadan cetvelde türetilir.
--     Hakediş kapatılmış (deftere yazılmış) aya puantaj yazılamaz/silinemez.

-- A) Kişisel bilgiler ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personel_kisisel (
  kullanici_id uuid PRIMARY KEY REFERENCES public.kullanici(id) ON DELETE CASCADE,
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  telefon text CHECK (telefon IS NULL OR telefon ~ '^\+90[0-9]{10}$'),
  dogum_tarihi date CHECK (dogum_tarihi IS NULL OR dogum_tarihi >= DATE '1900-01-01'),
  tc_kimlik_no text CHECK (tc_kimlik_no IS NULL OR public.tc_kimlik_gecerli(tc_kimlik_no)),
  il text,
  ilce text,
  mahalle text,
  adres_detay text,
  acil_durum_ad_soyad text,
  acil_durum_telefon text CHECK (acil_durum_telefon IS NULL OR acil_durum_telefon ~ '^\+90[0-9]{10}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (kullanici_id, isletme_id) REFERENCES public.kullanici (id, isletme_id) ON DELETE CASCADE
);
DROP TRIGGER IF EXISTS trg_personel_kisisel_updated_at ON public.personel_kisisel;
CREATE TRIGGER trg_personel_kisisel_updated_at BEFORE UPDATE ON public.personel_kisisel FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_personel_kisisel ON public.personel_kisisel;
CREATE TRIGGER trg_audit_personel_kisisel AFTER INSERT OR UPDATE OR DELETE ON public.personel_kisisel FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.personel_kisisel ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personel_kisisel FROM anon, authenticated;
GRANT SELECT ON public.personel_kisisel TO authenticated;
DROP POLICY IF EXISTS "personel_kisisel_select" ON public.personel_kisisel;
CREATE POLICY "personel_kisisel_select" ON public.personel_kisisel FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND ((SELECT public.current_rol()) = 'isletme_admin' OR kullanici_id = (SELECT auth.uid())))
    OR (SELECT public.is_super_admin())
  );
-- Yazma yetkisi YOK — yalnız aşağıdaki SECURITY DEFINER fonksiyon.

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
  p_acil_telefon text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  v_tc text := nullif(btrim(coalesce(p_tc, '')), '');
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
  IF (nullif(btrim(coalesce(p_acil_ad, '')), '') IS NULL) <> (nullif(btrim(coalesce(p_acil_telefon, '')), '') IS NULL) THEN
    RAISE EXCEPTION 'acil_kisi_eksik';
  END IF;

  -- Form tüm alanları gönderir: boş alan "temizle" demektir (fatura bilgisi tamamlamadan farklı olarak).
  INSERT INTO public.personel_kisisel (kullanici_id, isletme_id, telefon, dogum_tarihi, tc_kimlik_no, il, ilce, mahalle, adres_detay, acil_durum_ad_soyad, acil_durum_telefon)
  VALUES (p_kullanici_id, v_isletme, nullif(btrim(coalesce(p_telefon, '')), ''), p_dogum_tarihi, v_tc, nullif(btrim(coalesce(p_il, '')), ''), nullif(btrim(coalesce(p_ilce, '')), ''),
          nullif(btrim(coalesce(p_mahalle, '')), ''), nullif(btrim(coalesce(p_adres_detay, '')), ''), nullif(btrim(coalesce(p_acil_ad, '')), ''), nullif(btrim(coalesce(p_acil_telefon, '')), ''))
  ON CONFLICT (kullanici_id) DO UPDATE SET
    telefon = EXCLUDED.telefon, dogum_tarihi = EXCLUDED.dogum_tarihi, tc_kimlik_no = EXCLUDED.tc_kimlik_no, il = EXCLUDED.il, ilce = EXCLUDED.ilce,
    mahalle = EXCLUDED.mahalle, adres_detay = EXCLUDED.adres_detay, acil_durum_ad_soyad = EXCLUDED.acil_durum_ad_soyad, acil_durum_telefon = EXCLUDED.acil_durum_telefon;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_kisisel_kaydet(uuid, text, date, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personel_kisisel_kaydet(uuid, text, date, text, text, text, text, text, text, text) TO authenticated;

-- Belgeler (kayıt; dosya yok) -----------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personel_belge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  kullanici_id uuid NOT NULL,
  tur text NOT NULL CHECK (tur IN ('sertifika', 'ilk_yardim', 'saglik_raporu', 'sozlesme', 'diger')),
  ad text NOT NULL CHECK (char_length(btrim(ad)) BETWEEN 2 AND 150),
  veren_kurum text,
  belge_no text,
  verilis_tarihi date,
  gecerlilik_bitis date,
  not_metni text CHECK (not_metni IS NULL OR char_length(not_metni) <= 300),
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (kullanici_id, isletme_id) REFERENCES public.kullanici (id, isletme_id) ON DELETE CASCADE,
  CONSTRAINT belge_tarih_kurali CHECK (verilis_tarihi IS NULL OR gecerlilik_bitis IS NULL OR gecerlilik_bitis >= verilis_tarihi)
);
CREATE INDEX IF NOT EXISTS idx_personel_belge_kisi ON public.personel_belge (kullanici_id) WHERE aktif;
CREATE INDEX IF NOT EXISTS idx_personel_belge_bitis ON public.personel_belge (isletme_id, gecerlilik_bitis) WHERE aktif;
DROP TRIGGER IF EXISTS trg_personel_belge_updated_at ON public.personel_belge;
CREATE TRIGGER trg_personel_belge_updated_at BEFORE UPDATE ON public.personel_belge FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_personel_belge ON public.personel_belge;
CREATE TRIGGER trg_audit_personel_belge AFTER INSERT OR UPDATE ON public.personel_belge FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.personel_belge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personel_belge FROM anon, authenticated;
GRANT SELECT ON public.personel_belge TO authenticated;
DROP POLICY IF EXISTS "personel_belge_select" ON public.personel_belge;
CREATE POLICY "personel_belge_select" ON public.personel_belge FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND ((SELECT public.current_rol()) = 'isletme_admin' OR kullanici_id = (SELECT auth.uid())))
    OR (SELECT public.is_super_admin())
  );

CREATE OR REPLACE FUNCTION public.personel_belge_ekle(
  p_kullanici_id uuid,
  p_tur text,
  p_ad text,
  p_veren_kurum text DEFAULT NULL,
  p_belge_no text DEFAULT NULL,
  p_verilis date DEFAULT NULL,
  p_gecerlilik_bitis date DEFAULT NULL,
  p_not text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.kullanici WHERE id = p_kullanici_id AND isletme_id = v_isletme AND rol <> 'super_admin') THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;
  INSERT INTO public.personel_belge (isletme_id, kullanici_id, tur, ad, veren_kurum, belge_no, verilis_tarihi, gecerlilik_bitis, not_metni)
  VALUES (v_isletme, p_kullanici_id, p_tur, btrim(p_ad), nullif(btrim(coalesce(p_veren_kurum, '')), ''), nullif(btrim(coalesce(p_belge_no, '')), ''), p_verilis, p_gecerlilik_bitis, nullif(btrim(coalesce(p_not, '')), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_belge_ekle(uuid, text, text, text, text, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personel_belge_ekle(uuid, text, text, text, text, date, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.personel_belge_kaldir(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
BEGIN
  UPDATE public.personel_belge SET aktif = false WHERE id = p_id AND isletme_id = v_isletme AND aktif;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'belge_bulunamadi';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_belge_kaldir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personel_belge_kaldir(uuid) TO authenticated;

-- Yıllık izin hakkı: 50 yaş ve üzeri için en az 20 gün (doğum tarihi personel_kisisel'de varsa). İmza aynı (overload oluşmaz).
CREATE OR REPLACE FUNCTION public.izin_hak_gun(p_kullanici_id uuid, p_isletme_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (CASE
            WHEN age(public.bugun_istanbul(), k.dogum_tarihi) >= interval '50 years' THEN greatest(20, kidem.gun)
            ELSE kidem.gun
          END) + kidem.devir
    FROM (
      SELECT (CASE
                WHEN p.ise_giris_tarihi IS NULL THEN 14
                WHEN age(public.bugun_istanbul(), p.ise_giris_tarihi) < interval '1 year' THEN 0
                WHEN age(public.bugun_istanbul(), p.ise_giris_tarihi) < interval '5 years' THEN 14
                WHEN age(public.bugun_istanbul(), p.ise_giris_tarihi) < interval '15 years' THEN 20
                ELSE 26
              END) AS gun,
             p.izin_devir_gun AS devir
        FROM public.personel_profil p
       WHERE p.kullanici_id = p_kullanici_id AND p.isletme_id = p_isletme_id
    ) kidem
    LEFT JOIN public.personel_kisisel k ON k.kullanici_id = p_kullanici_id AND k.isletme_id = p_isletme_id AND k.dogum_tarihi IS NOT NULL
  UNION ALL
  SELECT 14
   WHERE NOT EXISTS (SELECT 1 FROM public.personel_profil p WHERE p.kullanici_id = p_kullanici_id AND p.isletme_id = p_isletme_id)
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.izin_hak_gun(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- B) İş başvuruları ---------------------------------------------------------------------------------------------------------------
ALTER TABLE public.qr_kod_ayar DROP CONSTRAINT IF EXISTS qr_kod_ayar_tip_check;
ALTER TABLE public.qr_kod_ayar ADD CONSTRAINT qr_kod_ayar_tip_check CHECK (tip IN ('musteri_on_kayit', 'anket', 'puantaj_giris', 'puantaj_cikis', 'is_basvurusu'));

CREATE TABLE IF NOT EXISTS public.is_basvurusu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  ad_soyad text NOT NULL CHECK (char_length(btrim(ad_soyad)) BETWEEN 2 AND 100),
  telefon text NOT NULL CHECK (telefon ~ '^\+90[0-9]{10}$'),
  eposta text CHECK (eposta IS NULL OR eposta ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  dogum_tarihi date CHECK (dogum_tarihi IS NULL OR dogum_tarihi >= DATE '1900-01-01'),
  basvurulan_pozisyon text CHECK (basvurulan_pozisyon IS NULL OR char_length(basvurulan_pozisyon) <= 100),
  deneyim text CHECK (deneyim IS NULL OR char_length(deneyim) <= 1000),
  sertifikalar text CHECK (sertifikalar IS NULL OR char_length(sertifikalar) <= 500),
  kvkk_aydinlatma_verildi boolean NOT NULL CHECK (kvkk_aydinlatma_verildi),
  metin_versiyonu text NOT NULL CHECK (char_length(btrim(metin_versiyonu)) > 0),
  durum text NOT NULL DEFAULT 'beklemede' CHECK (durum IN ('beklemede', 'olumlu', 'olumsuz')),
  degerlendirme_notu text CHECK (degerlendirme_notu IS NULL OR char_length(degerlendirme_notu) <= 500),
  kullanici_id uuid REFERENCES public.kullanici(id) ON DELETE SET NULL,
  degerlendiren_kullanici_id uuid REFERENCES public.kullanici(id) ON DELETE SET NULL,
  degerlendirme_zamani timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT is_basvurusu_sonuc_kurali CHECK ((durum = 'beklemede') = (degerlendirme_zamani IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_is_basvurusu_bekleyen ON public.is_basvurusu (isletme_id, telefon) WHERE durum = 'beklemede';
CREATE INDEX IF NOT EXISTS idx_is_basvurusu_isletme ON public.is_basvurusu (isletme_id, durum, created_at DESC);
DROP TRIGGER IF EXISTS trg_audit_is_basvurusu ON public.is_basvurusu;
CREATE TRIGGER trg_audit_is_basvurusu AFTER INSERT OR UPDATE ON public.is_basvurusu FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.is_basvurusu ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.is_basvurusu FROM anon, authenticated;
GRANT SELECT ON public.is_basvurusu TO authenticated;
DROP POLICY IF EXISTS "is_basvurusu_select" ON public.is_basvurusu;
CREATE POLICY "is_basvurusu_select" ON public.is_basvurusu FOR SELECT TO authenticated
  USING ((isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin') OR (SELECT public.is_super_admin()));
-- Yazma yetkisi YOK: ekleme yalnız service_role (herkese açık form), sonuçlandırma yalnız aşağıdaki fonksiyon.

CREATE OR REPLACE FUNCTION public.is_basvurusu_sonuclandir(p_id uuid, p_durum text, p_kullanici_id uuid DEFAULT NULL, p_not text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
BEGIN
  IF p_durum NOT IN ('olumlu', 'olumsuz') THEN
    RAISE EXCEPTION 'durum_gecersiz';
  END IF;
  IF p_kullanici_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.kullanici WHERE id = p_kullanici_id AND isletme_id = v_isletme) THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;
  UPDATE public.is_basvurusu
     SET durum = p_durum, kullanici_id = p_kullanici_id, degerlendirme_notu = nullif(btrim(coalesce(p_not, '')), ''),
         degerlendiren_kullanici_id = auth.uid(), degerlendirme_zamani = now()
   WHERE id = p_id AND isletme_id = v_isletme AND durum = 'beklemede';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'basvuru_bulunamadi';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.is_basvurusu_sonuclandir(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_basvurusu_sonuclandir(uuid, text, uuid, text) TO authenticated;

-- C) Puantaj ----------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personel_puantaj (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  kullanici_id uuid NOT NULL,
  tarih date NOT NULL,
  durum text NOT NULL CHECK (durum IN ('geldi', 'gelmedi', 'raporlu', 'yarim_gun')),
  giris_saati time,
  cikis_saati time,
  fazla_mesai_dk integer NOT NULL DEFAULT 0 CHECK (fazla_mesai_dk BETWEEN 0 AND 960),
  not_metni text CHECK (not_metni IS NULL OR char_length(not_metni) <= 200),
  kaydeden_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (kullanici_id, isletme_id) REFERENCES public.kullanici (id, isletme_id) ON DELETE CASCADE,
  UNIQUE (kullanici_id, tarih),
  CONSTRAINT puantaj_saat_kurali CHECK (giris_saati IS NULL OR cikis_saati IS NULL OR cikis_saati > giris_saati)
);
CREATE INDEX IF NOT EXISTS idx_puantaj_isletme_tarih ON public.personel_puantaj (isletme_id, tarih);
DROP TRIGGER IF EXISTS trg_puantaj_updated_at ON public.personel_puantaj;
CREATE TRIGGER trg_puantaj_updated_at BEFORE UPDATE ON public.personel_puantaj FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_puantaj ON public.personel_puantaj;
CREATE TRIGGER trg_audit_puantaj AFTER INSERT OR UPDATE OR DELETE ON public.personel_puantaj FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.personel_puantaj ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personel_puantaj FROM anon, authenticated;
GRANT SELECT ON public.personel_puantaj TO authenticated;
DROP POLICY IF EXISTS "puantaj_select" ON public.personel_puantaj;
CREATE POLICY "puantaj_select" ON public.personel_puantaj FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND ((SELECT public.current_rol()) IN ('isletme_admin', 'muhasebe') OR kullanici_id = (SELECT auth.uid())))
    OR (SELECT public.is_super_admin())
  );
-- Yazma yetkisi YOK — yalnız aşağıdaki SECURITY DEFINER fonksiyonlar.

-- Hakediş o ay için deftere yazılmış mı? (yazıldıysa puantaj artık değişmez)
CREATE OR REPLACE FUNCTION public.puantaj_donem_kapali_mi(p_isletme uuid, p_kullanici uuid, p_tarih date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personel_hesap_hareket h
     WHERE h.isletme_id = p_isletme AND h.kullanici_id = p_kullanici AND h.tur IN ('hakedis', 'prim')
       AND h.donem = make_date(extract(year FROM p_tarih)::integer, extract(month FROM p_tarih)::integer, 1)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.puantaj_donem_kapali_mi(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.personel_puantaj_kaydet(
  p_kullanici_id uuid,
  p_tarih date,
  p_durum text,
  p_giris time DEFAULT NULL,
  p_cikis time DEFAULT NULL,
  p_fazla_mesai_dk integer DEFAULT 0,
  p_not text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.kullanici WHERE id = p_kullanici_id AND isletme_id = v_isletme AND rol <> 'super_admin') THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;
  IF p_tarih IS NULL OR p_tarih > public.bugun_istanbul() THEN
    RAISE EXCEPTION 'gelecek_tarih';
  END IF;
  IF public.puantaj_donem_kapali_mi(v_isletme, p_kullanici_id, p_tarih) THEN
    RAISE EXCEPTION 'puantaj_donem_kapali';
  END IF;
  IF public.izin_var_mi(p_kullanici_id, p_tarih) THEN
    RAISE EXCEPTION 'puantaj_izinli_gun';
  END IF;

  INSERT INTO public.personel_puantaj (isletme_id, kullanici_id, tarih, durum, giris_saati, cikis_saati, fazla_mesai_dk, not_metni)
  VALUES (v_isletme, p_kullanici_id, p_tarih, p_durum, p_giris, p_cikis, coalesce(p_fazla_mesai_dk, 0), nullif(btrim(coalesce(p_not, '')), ''))
  ON CONFLICT (kullanici_id, tarih) DO UPDATE SET
    durum = EXCLUDED.durum, giris_saati = EXCLUDED.giris_saati, cikis_saati = EXCLUDED.cikis_saati,
    fazla_mesai_dk = EXCLUDED.fazla_mesai_dk, not_metni = EXCLUDED.not_metni, kaydeden_kullanici_id = auth.uid()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_puantaj_kaydet(uuid, date, text, time, time, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personel_puantaj_kaydet(uuid, date, text, time, time, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.personel_puantaj_sil(p_kullanici_id uuid, p_tarih date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
BEGIN
  IF public.puantaj_donem_kapali_mi(v_isletme, p_kullanici_id, p_tarih) THEN
    RAISE EXCEPTION 'puantaj_donem_kapali';
  END IF;
  DELETE FROM public.personel_puantaj WHERE kullanici_id = p_kullanici_id AND isletme_id = v_isletme AND tarih = p_tarih;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_puantaj_sil(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personel_puantaj_sil(uuid, date) TO authenticated;

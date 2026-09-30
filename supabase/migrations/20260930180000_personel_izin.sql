-- F9b: Personel izin talep-onay akışı, yıllık izin bakiyesi, resmi tatiller; izinli antrenöre ders atanamaz.
-- (UYGULANMADI — önce 20260930170000 uygulanmış olmalı.)
--
-- Klinikteki izin akışının fitness karşılığı. Kurallar:
--  * Herkes (yönetici dahil) kendi izin talebini açar; işletme yöneticisi onaylar/reddeder (ret gerekçesi zorunlu).
--  * Gün sayısı İŞ GÜNÜ: Pazar ve resmi tatiller sayılmaz (Cumartesi çalışma günüdür).
--  * Yıllık izin hakkı kıdemden: <1 yıl 0, 1-5 yıl 14, 5-15 yıl 20, 15+ yıl 26 gün (İş Kanunu m.53);
--    işe giriş tarihi girilmemişse 14 gün varsayılır. Bakiye = hak + devir - kullanılan (onaylı, takvim yılı, İstanbul).
--  * Bir personelin beklemede/onaylı izinleri tarih olarak çakışamaz.
--  * Durum makinesi yalnız SECURITY DEFINER fonksiyonlarda: beklemede -> onaylandi | reddedildi | iptal; onaylandi -> iptal (başlamamışsa).
--  * İzinli antrenöre ders atanamaz / taşınamaz. Onaylanan izinle çakışan planlı ders sayısı yöneticiye bildirilir.
--  * Ücretsiz izin bu sürümde YOK (maaştan düşme hakedişe bağlanınca eklenecek); tipler: yıllık, mazeret, rapor.

-- 1) Resmi tatil --------------------------------------------------------------------------------------------------
-- isletme_id NULL = platform geneli (tüm işletmeler); işletme kendi özel günlerini de ekleyebilir.
CREATE TABLE IF NOT EXISTS public.resmi_tatil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid REFERENCES public.isletme(id) ON DELETE CASCADE,
  tarih date NOT NULL,
  ad text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resmi_tatil_isletme_tarih ON public.resmi_tatil (isletme_id, tarih) WHERE isletme_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_resmi_tatil_genel_tarih ON public.resmi_tatil (tarih) WHERE isletme_id IS NULL;

ALTER TABLE public.resmi_tatil ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resmi_tatil FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.resmi_tatil TO authenticated;

DROP POLICY IF EXISTS "tatil_select" ON public.resmi_tatil;
CREATE POLICY "tatil_select" ON public.resmi_tatil FOR SELECT TO authenticated
  USING (isletme_id IS NULL OR isletme_id = (SELECT public.current_isletme_id()) OR (SELECT public.is_super_admin()));
DROP POLICY IF EXISTS "tatil_insert" ON public.resmi_tatil;
CREATE POLICY "tatil_insert" ON public.resmi_tatil FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');
DROP POLICY IF EXISTS "tatil_delete" ON public.resmi_tatil;
CREATE POLICY "tatil_delete" ON public.resmi_tatil FOR DELETE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');

-- Sabit tarihli ulusal tatiller + 2026 dini bayramlar (hicri takvim yıldan yıla kayar; 2027+ için ayrıca eklenmeli).
INSERT INTO public.resmi_tatil (isletme_id, tarih, ad) VALUES
  (NULL, '2026-01-01', 'Yılbaşı'),
  (NULL, '2026-03-20', 'Ramazan Bayramı (1. gün)'),
  (NULL, '2026-03-21', 'Ramazan Bayramı (2. gün)'),
  (NULL, '2026-03-22', 'Ramazan Bayramı (3. gün)'),
  (NULL, '2026-04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'),
  (NULL, '2026-05-01', 'Emek ve Dayanışma Günü'),
  (NULL, '2026-05-19', 'Atatürk''ü Anma, Gençlik ve Spor Bayramı'),
  (NULL, '2026-05-27', 'Kurban Bayramı (1. gün)'),
  (NULL, '2026-05-28', 'Kurban Bayramı (2. gün)'),
  (NULL, '2026-05-29', 'Kurban Bayramı (3. gün)'),
  (NULL, '2026-05-30', 'Kurban Bayramı (4. gün)'),
  (NULL, '2026-07-15', 'Demokrasi ve Milli Birlik Günü'),
  (NULL, '2026-08-30', 'Zafer Bayramı'),
  (NULL, '2026-10-29', 'Cumhuriyet Bayramı')
ON CONFLICT DO NOTHING;

-- 2) Profilde devreden izin ------------------------------------------------------------------------------------
ALTER TABLE public.personel_profil ADD COLUMN IF NOT EXISTS izin_devir_gun integer NOT NULL DEFAULT 0 CHECK (izin_devir_gun >= 0);

-- 3) İzin talebi -------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.izin_talebi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL,
  kullanici_id uuid NOT NULL,
  tip text NOT NULL CHECK (tip IN ('yillik', 'mazeret', 'rapor')),
  baslangic_tarihi date NOT NULL,
  bitis_tarihi date NOT NULL,
  gun_sayisi integer NOT NULL CHECK (gun_sayisi > 0),
  gerekce text,
  durum text NOT NULL DEFAULT 'beklemede' CHECK (durum IN ('beklemede', 'onaylandi', 'reddedildi', 'iptal')),
  red_gerekce text,
  degerlendiren_kullanici_id uuid REFERENCES public.kullanici(id) ON DELETE SET NULL,
  degerlendirme_zamani timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (kullanici_id, isletme_id) REFERENCES public.kullanici (id, isletme_id) ON DELETE RESTRICT,
  CONSTRAINT izin_tarih_kurali CHECK (bitis_tarihi >= baslangic_tarihi),
  -- NULL tuzağı: ret gerekçesi açıkça IS NOT NULL ile sınanır.
  CONSTRAINT izin_red_gerekce_kurali CHECK (durum <> 'reddedildi' OR (red_gerekce IS NOT NULL AND btrim(red_gerekce) <> '')),
  -- Aynı personelin beklemede/onaylı izinleri çakışamaz.
  CONSTRAINT izin_cakisma EXCLUDE USING gist (kullanici_id WITH =, daterange(baslangic_tarihi, bitis_tarihi, '[]') WITH &&) WHERE (durum IN ('beklemede', 'onaylandi'))
);
CREATE INDEX IF NOT EXISTS idx_izin_isletme_durum ON public.izin_talebi (isletme_id, durum);
CREATE INDEX IF NOT EXISTS idx_izin_kullanici ON public.izin_talebi (kullanici_id, baslangic_tarihi DESC);

DROP TRIGGER IF EXISTS trg_izin_updated_at ON public.izin_talebi;
CREATE TRIGGER trg_izin_updated_at
  BEFORE UPDATE ON public.izin_talebi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_izin ON public.izin_talebi;
CREATE TRIGGER trg_audit_izin
  AFTER INSERT OR UPDATE ON public.izin_talebi
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.izin_talebi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.izin_talebi FROM anon, authenticated;
GRANT SELECT ON public.izin_talebi TO authenticated;
-- Yazma yetkisi YOK — yalnız aşağıdaki SECURITY DEFINER fonksiyonlar.

DROP POLICY IF EXISTS "izin_select" ON public.izin_talebi;
CREATE POLICY "izin_select" ON public.izin_talebi FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
    OR kullanici_id = (SELECT auth.uid())
    OR (SELECT public.is_super_admin())
  );

-- 4) Hesap fonksiyonları -----------------------------------------------------------------------------------------
-- İş günü sayısı (Pazar ve resmi tatil hariç, uçlar dahil). Üst sınır: döngü kötüye kullanımına karşı 366 gün.
CREATE OR REPLACE FUNCTION public.izin_is_gunu_sayisi(p_baslangic date, p_bitis date)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.current_isletme_id();
  v_sayi integer;
BEGIN
  IF p_baslangic IS NULL OR p_bitis IS NULL OR p_bitis < p_baslangic THEN
    RAISE EXCEPTION 'tarih_araligi_gecersiz';
  END IF;
  IF p_bitis - p_baslangic > 366 THEN
    RAISE EXCEPTION 'tarih_araligi_cok_uzun';
  END IF;

  SELECT count(*)::integer INTO v_sayi
    FROM generate_series(p_baslangic::timestamp, p_bitis::timestamp, interval '1 day') AS g(d)
   WHERE extract(dow FROM g.d) <> 0
     AND NOT EXISTS (
       SELECT 1 FROM public.resmi_tatil r
        WHERE r.tarih = g.d::date AND (r.isletme_id IS NULL OR r.isletme_id = v_isletme)
     );
  RETURN v_sayi;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.izin_is_gunu_sayisi(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.izin_is_gunu_sayisi(date, date) TO authenticated;

-- Kıdemden yıllık izin hakkı + devir (iç fonksiyon; dışarıya açılmaz).
CREATE OR REPLACE FUNCTION public.izin_hak_gun(p_kullanici_id uuid, p_isletme_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (CASE
            WHEN p.ise_giris_tarihi IS NULL THEN 14
            WHEN age(public.bugun_istanbul(), p.ise_giris_tarihi) < interval '1 year' THEN 0
            WHEN age(public.bugun_istanbul(), p.ise_giris_tarihi) < interval '5 years' THEN 14
            WHEN age(public.bugun_istanbul(), p.ise_giris_tarihi) < interval '15 years' THEN 20
            ELSE 26
          END) + p.izin_devir_gun
    FROM public.personel_profil p
   WHERE p.kullanici_id = p_kullanici_id AND p.isletme_id = p_isletme_id
  UNION ALL
  SELECT 14
   WHERE NOT EXISTS (SELECT 1 FROM public.personel_profil p WHERE p.kullanici_id = p_kullanici_id AND p.isletme_id = p_isletme_id)
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.izin_hak_gun(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Bu takvim yılında (İstanbul) verilen yıllık izin günü: belirtilen durumdaki talepler.
CREATE OR REPLACE FUNCTION public.izin_yillik_gun(p_kullanici_id uuid, p_isletme_id uuid, p_durum text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(t.gun_sayisi), 0)::integer
    FROM public.izin_talebi t
   WHERE t.kullanici_id = p_kullanici_id AND t.isletme_id = p_isletme_id AND t.tip = 'yillik' AND t.durum = p_durum
     AND extract(year FROM t.baslangic_tarihi) = extract(year FROM public.bugun_istanbul());
$$;
REVOKE EXECUTE ON FUNCTION public.izin_yillik_gun(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Personelin izin bakiyesi: kendisi veya işletme yöneticisi görür.
CREATE OR REPLACE FUNCTION public.izin_bakiye(p_kullanici_id uuid DEFAULT NULL)
RETURNS TABLE (hak_gun integer, kullanilan_gun integer, bekleyen_gun integer, kalan_gun integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.current_isletme_id();
  v_kisi uuid := coalesce(p_kullanici_id, auth.uid());
BEGIN
  IF v_isletme IS NULL OR v_kisi IS NULL THEN
    RAISE EXCEPTION 'isletme_yok';
  END IF;
  IF v_kisi <> auth.uid() AND public.current_rol() IS DISTINCT FROM 'isletme_admin' THEN
    RAISE EXCEPTION 'yetki_yetersiz';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kullanici WHERE id = v_kisi AND isletme_id = v_isletme) THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;

  RETURN QUERY
  SELECT public.izin_hak_gun(v_kisi, v_isletme),
         public.izin_yillik_gun(v_kisi, v_isletme, 'onaylandi'),
         public.izin_yillik_gun(v_kisi, v_isletme, 'beklemede'),
         public.izin_hak_gun(v_kisi, v_isletme) - public.izin_yillik_gun(v_kisi, v_isletme, 'onaylandi') - public.izin_yillik_gun(v_kisi, v_isletme, 'beklemede');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.izin_bakiye(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.izin_bakiye(uuid) TO authenticated;

-- Personel o tarihte onaylı izinde mi? (ders atamasında kullanılır; iç fonksiyon)
CREATE OR REPLACE FUNCTION public.izin_var_mi(p_kullanici_id uuid, p_tarih date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.izin_talebi t
     WHERE t.kullanici_id = p_kullanici_id AND t.durum = 'onaylandi'
       AND p_tarih BETWEEN t.baslangic_tarihi AND t.bitis_tarihi
  );
$$;
REVOKE EXECUTE ON FUNCTION public.izin_var_mi(uuid, date) FROM PUBLIC, anon, authenticated;

-- 5) Durum makinesi ----------------------------------------------------------------------------------------------
-- Kendi adına talep açar (her rol). Yıllık izin için bakiye ve geçmiş tarih kontrolü yapılır.
CREATE OR REPLACE FUNCTION public.izin_talep_olustur(p_tip text, p_baslangic date, p_bitis date, p_gerekce text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.current_isletme_id();
  v_kisi uuid := auth.uid();
  v_bugun date := public.bugun_istanbul();
  v_gun integer;
  v_id uuid;
BEGIN
  IF v_isletme IS NULL OR v_kisi IS NULL OR public.current_rol() IS NULL THEN
    RAISE EXCEPTION 'isletme_yok';
  END IF;
  IF p_tip NOT IN ('yillik', 'mazeret', 'rapor') THEN
    RAISE EXCEPTION 'izin_tipi_gecersiz';
  END IF;

  v_gun := public.izin_is_gunu_sayisi(p_baslangic, p_bitis);
  IF v_gun < 1 THEN
    RAISE EXCEPTION 'izin_gun_yok';
  END IF;

  IF p_tip = 'yillik' AND p_baslangic < v_bugun THEN
    RAISE EXCEPTION 'gecmis_izin';
  END IF;
  IF p_tip <> 'yillik' AND p_baslangic < v_bugun - 60 THEN
    RAISE EXCEPTION 'gecmis_izin';
  END IF;

  IF p_tip = 'yillik' AND v_gun > public.izin_hak_gun(v_kisi, v_isletme) - public.izin_yillik_gun(v_kisi, v_isletme, 'onaylandi') - public.izin_yillik_gun(v_kisi, v_isletme, 'beklemede') THEN
    RAISE EXCEPTION 'izin_bakiyesi_yetersiz';
  END IF;

  BEGIN
    INSERT INTO public.izin_talebi (isletme_id, kullanici_id, tip, baslangic_tarihi, bitis_tarihi, gun_sayisi, gerekce)
    VALUES (v_isletme, v_kisi, p_tip, p_baslangic, p_bitis, v_gun, nullif(btrim(p_gerekce), ''))
    RETURNING id INTO v_id;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'izin_cakisma';
  END;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.izin_talep_olustur(text, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.izin_talep_olustur(text, date, date, text) TO authenticated;

-- Onay / ret (yalnız yönetici). Dönüş: onaylanan izinle çakışan planlı ders sayısı (yeniden planlanmalı).
CREATE OR REPLACE FUNCTION public.izin_talep_degerlendir(p_id uuid, p_onay boolean, p_red_gerekce text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  t public.izin_talebi%ROWTYPE;
  v_etkilenen integer := 0;
BEGIN
  SELECT * INTO t FROM public.izin_talebi WHERE id = p_id AND isletme_id = v_isletme FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'izin_bulunamadi';
  END IF;
  IF t.durum <> 'beklemede' THEN
    RAISE EXCEPTION 'izin_durumu_uygun_degil';
  END IF;

  IF p_onay THEN
    IF t.tip = 'yillik' AND t.gun_sayisi > public.izin_hak_gun(t.kullanici_id, v_isletme) - public.izin_yillik_gun(t.kullanici_id, v_isletme, 'onaylandi') THEN
      RAISE EXCEPTION 'izin_bakiyesi_yetersiz';
    END IF;
    UPDATE public.izin_talebi
       SET durum = 'onaylandi', degerlendiren_kullanici_id = auth.uid(), degerlendirme_zamani = now()
     WHERE id = p_id;

    SELECT count(*)::integer INTO v_etkilenen
      FROM public.ders_seansi d
     WHERE d.isletme_id = v_isletme AND d.antrenor_id = t.kullanici_id AND d.durum IN ('planlandi', 'ertelendi')
       AND (d.baslangic AT TIME ZONE 'Europe/Istanbul')::date BETWEEN t.baslangic_tarihi AND t.bitis_tarihi;
  ELSE
    IF nullif(btrim(p_red_gerekce), '') IS NULL THEN
      RAISE EXCEPTION 'red_gerekce_gerekli';
    END IF;
    UPDATE public.izin_talebi
       SET durum = 'reddedildi', red_gerekce = btrim(p_red_gerekce), degerlendiren_kullanici_id = auth.uid(), degerlendirme_zamani = now()
     WHERE id = p_id;
  END IF;
  RETURN v_etkilenen;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.izin_talep_degerlendir(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.izin_talep_degerlendir(uuid, boolean, text) TO authenticated;

-- İptal: sahibi (beklemede, veya başlamamış onaylı) ya da yönetici (aynı koşullar).
CREATE OR REPLACE FUNCTION public.izin_talep_iptal(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.current_isletme_id();
  v_rol text := public.current_rol();
  t public.izin_talebi%ROWTYPE;
BEGIN
  IF v_isletme IS NULL OR v_rol IS NULL THEN
    RAISE EXCEPTION 'isletme_yok';
  END IF;
  SELECT * INTO t FROM public.izin_talebi WHERE id = p_id AND isletme_id = v_isletme FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'izin_bulunamadi';
  END IF;
  IF t.kullanici_id <> auth.uid() AND v_rol <> 'isletme_admin' THEN
    RAISE EXCEPTION 'yetki_yetersiz';
  END IF;
  IF NOT (t.durum = 'beklemede' OR (t.durum = 'onaylandi' AND t.baslangic_tarihi > public.bugun_istanbul())) THEN
    RAISE EXCEPTION 'izin_durumu_uygun_degil';
  END IF;
  UPDATE public.izin_talebi SET durum = 'iptal' WHERE id = p_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.izin_talep_iptal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.izin_talep_iptal(uuid) TO authenticated;

-- Yönetici, personel adına doğrudan onaylı izin girer (ör. rapor, geçmişe dönük kayıt).
CREATE OR REPLACE FUNCTION public.izin_manuel_ekle(p_kullanici_id uuid, p_tip text, p_baslangic date, p_bitis date, p_gerekce text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  v_gun integer;
  v_id uuid;
BEGIN
  IF p_tip NOT IN ('yillik', 'mazeret', 'rapor') THEN
    RAISE EXCEPTION 'izin_tipi_gecersiz';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kullanici WHERE id = p_kullanici_id AND isletme_id = v_isletme) THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;

  v_gun := public.izin_is_gunu_sayisi(p_baslangic, p_bitis);
  IF v_gun < 1 THEN
    RAISE EXCEPTION 'izin_gun_yok';
  END IF;
  IF p_tip = 'yillik' AND v_gun > public.izin_hak_gun(p_kullanici_id, v_isletme) - public.izin_yillik_gun(p_kullanici_id, v_isletme, 'onaylandi') THEN
    RAISE EXCEPTION 'izin_bakiyesi_yetersiz';
  END IF;

  BEGIN
    INSERT INTO public.izin_talebi (isletme_id, kullanici_id, tip, baslangic_tarihi, bitis_tarihi, gun_sayisi, gerekce, durum, degerlendiren_kullanici_id, degerlendirme_zamani)
    VALUES (v_isletme, p_kullanici_id, p_tip, p_baslangic, p_bitis, v_gun, nullif(btrim(p_gerekce), ''), 'onaylandi', auth.uid(), now())
    RETURNING id INTO v_id;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'izin_cakisma';
  END;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.izin_manuel_ekle(uuid, text, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.izin_manuel_ekle(uuid, text, date, date, text) TO authenticated;

-- 6) İzinli antrenöre ders atanamaz: ders_seansi_olustur ve ders_seansi_tasi yeniden tanımlanır ----------------------
CREATE OR REPLACE FUNCTION public.ders_seansi_olustur(
  p_musteri_id uuid,
  p_antrenor_id uuid,
  p_alan_id uuid,
  p_baslangic timestamptz,
  p_sure_dk integer,
  p_ucret_kurus bigint DEFAULT 0,
  p_not text DEFAULT NULL,
  p_anahtar uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon']);
  v_id uuid;
  v_kisit text;
BEGIN
  IF p_anahtar IS NOT NULL THEN
    SELECT id INTO v_id FROM public.ders_seansi WHERE isletme_id = v_isletme AND olusturma_anahtari = p_anahtar;
    IF FOUND THEN
      RETURN v_id;
    END IF;
  END IF;

  IF p_baslangic IS NULL OR p_sure_dk IS NULL OR p_sure_dk < 15 OR p_sure_dk > 480 THEN
    RAISE EXCEPTION 'sure_gecersiz';
  END IF;
  IF coalesce(p_ucret_kurus, 0) < 0 THEN
    RAISE EXCEPTION 'ucret_gecersiz';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.musteri WHERE id = p_musteri_id AND isletme_id = v_isletme AND aktif) THEN
    RAISE EXCEPTION 'musteri_bulunamadi';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kullanici WHERE id = p_antrenor_id AND isletme_id = v_isletme AND rol = 'antrenor' AND aktif) THEN
    RAISE EXCEPTION 'antrenor_bulunamadi';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.alan_studyo WHERE id = p_alan_id AND isletme_id = v_isletme AND aktif) THEN
    RAISE EXCEPTION 'alan_bulunamadi';
  END IF;
  IF public.izin_var_mi(p_antrenor_id, (p_baslangic AT TIME ZONE 'Europe/Istanbul')::date) THEN
    RAISE EXCEPTION 'antrenor_izinli';
  END IF;

  BEGIN
    INSERT INTO public.ders_seansi (isletme_id, musteri_id, antrenor_id, alan_id, baslangic, bitis, ucret_kurus, not_metni, olusturma_anahtari)
    VALUES (v_isletme, p_musteri_id, p_antrenor_id, p_alan_id, p_baslangic, p_baslangic + make_interval(mins => p_sure_dk),
            coalesce(p_ucret_kurus, 0), nullif(btrim(p_not), ''), p_anahtar)
    RETURNING id INTO v_id;
  EXCEPTION WHEN exclusion_violation THEN
    GET STACKED DIAGNOSTICS v_kisit = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', public.ders_cakisma_hatasi(v_kisit);
  END;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ders_seansi_olustur(uuid, uuid, uuid, timestamptz, integer, bigint, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ders_seansi_olustur(uuid, uuid, uuid, timestamptz, integer, bigint, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ders_seansi_tasi(
  p_id uuid,
  p_baslangic timestamptz,
  p_sure_dk integer DEFAULT NULL,
  p_antrenor_id uuid DEFAULT NULL,
  p_alan_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon']);
  d public.ders_seansi%ROWTYPE;
  v_sure integer;
  v_kisit text;
BEGIN
  SELECT * INTO d FROM public.ders_seansi WHERE id = p_id AND isletme_id = v_isletme FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ders_bulunamadi';
  END IF;
  IF d.durum NOT IN ('planlandi', 'ertelendi') THEN
    RAISE EXCEPTION 'ders_tasinamaz';
  END IF;

  v_sure := coalesce(p_sure_dk, (extract(epoch FROM (d.bitis - d.baslangic)) / 60)::integer);
  IF p_baslangic IS NULL OR v_sure < 15 OR v_sure > 480 THEN
    RAISE EXCEPTION 'sure_gecersiz';
  END IF;
  IF p_antrenor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.kullanici WHERE id = p_antrenor_id AND isletme_id = v_isletme AND rol = 'antrenor' AND aktif) THEN
    RAISE EXCEPTION 'antrenor_bulunamadi';
  END IF;
  IF p_alan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.alan_studyo WHERE id = p_alan_id AND isletme_id = v_isletme AND aktif) THEN
    RAISE EXCEPTION 'alan_bulunamadi';
  END IF;
  IF public.izin_var_mi(coalesce(p_antrenor_id, d.antrenor_id), (p_baslangic AT TIME ZONE 'Europe/Istanbul')::date) THEN
    RAISE EXCEPTION 'antrenor_izinli';
  END IF;

  BEGIN
    UPDATE public.ders_seansi
       SET baslangic = p_baslangic,
           bitis = p_baslangic + make_interval(mins => v_sure),
           antrenor_id = coalesce(p_antrenor_id, antrenor_id),
           alan_id = coalesce(p_alan_id, alan_id),
           durum = 'ertelendi'
     WHERE id = p_id;
  EXCEPTION WHEN exclusion_violation THEN
    GET STACKED DIAGNOSTICS v_kisit = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', public.ders_cakisma_hatasi(v_kisit);
  END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ders_seansi_tasi(uuid, timestamptz, integer, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ders_seansi_tasi(uuid, timestamptz, integer, uuid, uuid) TO authenticated;

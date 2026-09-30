-- F9: Personel maaş/prim profili, aylık hakediş (dönem kapatma), personel hesap defteri (hakediş/prim/ödeme/avans).
-- (UYGULANMADI — önce 20260930160000 uygulanmış olmalı.)
--
-- Klinikteki maaş modelinin fitness karşılığı. Kurallar:
--  * Hakediş = sabit maaş (kısmi ay GÜN ORANLI; çıkış günü dahil) + tamamlanan ders başına prim.
--  * Prim yalnız 'tamamlandi' dersler için; işten çıkıştan sonraki / işe girişten önceki dersler sayılmaz.
--  * Dönem (ay) bittikten sonra KAPATILIR: hakediş ve prim satırları deftere yazılır (idempotent, bir kez).
--    Kapalı dönem artık değişmez; sonradan ders/profil değişse bile tutar sabit kalır.
--  * Defter değişmez (UPDATE/DELETE yok). Ödeme ve avans ayrı kayıtlardır; bakiye = hakediş + prim - ödeme - avans
--    (pozitif = işletme personele borçlu).
--  * Maaş bilgisi yalnız işletme yöneticisi ve muhasebe görür; personel yalnız KENDİ defter satırlarını görür.
--  * audit_log yalnız alan adlarını tutar (maaş/prim değerleri asla).

-- 1) Profil ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personel_profil (
  kullanici_id uuid PRIMARY KEY,
  isletme_id uuid NOT NULL,
  maas_kurus bigint NOT NULL DEFAULT 0 CHECK (maas_kurus >= 0),
  ders_prim_kurus bigint NOT NULL DEFAULT 0 CHECK (ders_prim_kurus >= 0),
  ise_giris_tarihi date,
  isten_cikis_tarihi date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (kullanici_id, isletme_id) REFERENCES public.kullanici (id, isletme_id) ON DELETE CASCADE,
  -- NULL tuzağı: CHECK, NULL sonucunu GEÇTİ sayar; bu yüzden her iki tarih de açıkça IS NOT NULL ile sınanır.
  CONSTRAINT profil_tarih_kurali CHECK (isten_cikis_tarihi IS NULL OR ise_giris_tarihi IS NULL OR isten_cikis_tarihi >= ise_giris_tarihi)
);

DROP TRIGGER IF EXISTS trg_personel_profil_updated_at ON public.personel_profil;
CREATE TRIGGER trg_personel_profil_updated_at
  BEFORE UPDATE ON public.personel_profil
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_personel_profil ON public.personel_profil;
CREATE TRIGGER trg_audit_personel_profil
  AFTER INSERT OR UPDATE ON public.personel_profil
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.personel_profil ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personel_profil FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.personel_profil TO authenticated;

DROP POLICY IF EXISTS "profil_select" ON public.personel_profil;
CREATE POLICY "profil_select" ON public.personel_profil FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'muhasebe'))
    OR kullanici_id = (SELECT auth.uid())
    OR (SELECT public.is_super_admin())
  );
DROP POLICY IF EXISTS "profil_insert" ON public.personel_profil;
CREATE POLICY "profil_insert" ON public.personel_profil FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');
DROP POLICY IF EXISTS "profil_update" ON public.personel_profil;
CREATE POLICY "profil_update" ON public.personel_profil FOR UPDATE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');

-- 2) Personel hesap defteri ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personel_hesap_hareket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL,
  kullanici_id uuid NOT NULL,
  tur text NOT NULL CHECK (tur IN ('hakedis', 'prim', 'odeme', 'avans')),
  tutar_kurus bigint NOT NULL CHECK (tutar_kurus > 0),
  -- Hakediş/prim için ayın 1'i; ödeme/avans için NULL.
  donem date,
  odeme_yontemi text CHECK (odeme_yontemi IN ('nakit', 'havale')),
  aciklama text,
  idempotency_anahtari uuid,
  islem_tarihi date NOT NULL DEFAULT public.bugun_istanbul(),
  kaydeden_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (kullanici_id, isletme_id) REFERENCES public.kullanici (id, isletme_id) ON DELETE RESTRICT,
  UNIQUE (isletme_id, idempotency_anahtari),
  CONSTRAINT phh_donem_kurali CHECK ((tur IN ('hakedis', 'prim')) = (donem IS NOT NULL) AND (donem IS NULL OR extract(day FROM donem) = 1)),
  CONSTRAINT phh_yontem_kurali CHECK ((tur IN ('odeme', 'avans')) = (odeme_yontemi IS NOT NULL))
);

-- Bir personelin bir dönem için tek hakediş ve tek prim satırı olur (dönem kapatma tekrar çalışsa da çift yazmaz).
CREATE UNIQUE INDEX IF NOT EXISTS uq_phh_donem
  ON public.personel_hesap_hareket (isletme_id, kullanici_id, donem, tur)
  WHERE tur IN ('hakedis', 'prim');
CREATE INDEX IF NOT EXISTS idx_phh_kullanici ON public.personel_hesap_hareket (kullanici_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.personel_defter_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'defter_degismez';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_defter_koru() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_phh_degismez ON public.personel_hesap_hareket;
CREATE TRIGGER trg_phh_degismez
  BEFORE UPDATE OR DELETE ON public.personel_hesap_hareket
  FOR EACH ROW EXECUTE FUNCTION public.personel_defter_koru();
DROP TRIGGER IF EXISTS trg_audit_phh ON public.personel_hesap_hareket;
CREATE TRIGGER trg_audit_phh
  AFTER INSERT ON public.personel_hesap_hareket
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.personel_hesap_hareket ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personel_hesap_hareket FROM anon, authenticated;
GRANT SELECT ON public.personel_hesap_hareket TO authenticated;
-- Yazma yetkisi YOK — yalnız aşağıdaki SECURITY DEFINER fonksiyonlar.

DROP POLICY IF EXISTS "phh_select" ON public.personel_hesap_hareket;
CREATE POLICY "phh_select" ON public.personel_hesap_hareket FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'muhasebe'))
    OR kullanici_id = (SELECT auth.uid())
    OR (SELECT public.is_super_admin())
  );

-- Personel başına bakiye: pozitif = işletme personele borçlu.
CREATE OR REPLACE VIEW public.personel_bakiye WITH (security_invoker = true) AS
SELECT h.kullanici_id,
       h.isletme_id,
       coalesce(sum(h.tutar_kurus) FILTER (WHERE h.tur IN ('hakedis', 'prim')), 0)::bigint AS hak_edilen_kurus,
       coalesce(sum(h.tutar_kurus) FILTER (WHERE h.tur IN ('odeme', 'avans')), 0)::bigint AS odenen_kurus,
       (coalesce(sum(h.tutar_kurus) FILTER (WHERE h.tur IN ('hakedis', 'prim')), 0)
        - coalesce(sum(h.tutar_kurus) FILTER (WHERE h.tur IN ('odeme', 'avans')), 0))::bigint AS bakiye_kurus
  FROM public.personel_hesap_hareket h
 GROUP BY h.kullanici_id, h.isletme_id;
REVOKE ALL ON public.personel_bakiye FROM anon, authenticated;
GRANT SELECT ON public.personel_bakiye TO authenticated;

-- 3) Hakediş hesabı (tek kaynak) ----------------------------------------------------------------------------------
-- Dönem kapalıysa deftere yazılmış gerçek tutarlar, açıksa canlı hesap döner. Yalnız kendi işletmesinin personeli.
CREATE OR REPLACE FUNCTION public.personel_hakedis_hesapla(p_ay date)
RETURNS TABLE (
  kullanici_id uuid,
  ad_soyad text,
  rol text,
  calisilan_gun integer,
  toplam_gun integer,
  taban_kurus bigint,
  ders_sayisi integer,
  prim_kurus bigint,
  toplam_kurus bigint,
  kapali boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ctx AS (
    SELECT public.rol_zorunlu(ARRAY['isletme_admin', 'muhasebe']) AS isletme_id,
           make_date(extract(year FROM p_ay)::integer, extract(month FROM p_ay)::integer, 1) AS ay
  ),
  donem AS (
    SELECT c.isletme_id,
           c.ay,
           (c.ay + interval '1 month')::date AS sonraki,
           (c.ay::timestamp AT TIME ZONE 'Europe/Istanbul') AS bas,
           ((c.ay + interval '1 month')::date::timestamp AT TIME ZONE 'Europe/Istanbul') AS bit
      FROM ctx c
  ),
  hesap AS (
    SELECT k.id AS k_id,
           k.ad_soyad AS k_ad,
           k.rol AS k_rol,
           p.maas_kurus,
           p.ders_prim_kurus,
           d.ay,
           d.sonraki,
           greatest(0, least(d.sonraki, coalesce(p.isten_cikis_tarihi + 1, d.sonraki)) - greatest(d.ay, coalesce(p.ise_giris_tarihi, d.ay))) AS gun,
           (d.sonraki - d.ay) AS ay_gun,
           (SELECT count(*)::integer
              FROM public.ders_seansi s
             WHERE s.isletme_id = d.isletme_id
               AND s.antrenor_id = k.id
               AND s.durum = 'tamamlandi'
               AND s.baslangic >= d.bas AND s.baslangic < d.bit
               AND (p.isten_cikis_tarihi IS NULL OR (s.baslangic AT TIME ZONE 'Europe/Istanbul')::date <= p.isten_cikis_tarihi)
               AND (p.ise_giris_tarihi IS NULL OR (s.baslangic AT TIME ZONE 'Europe/Istanbul')::date >= p.ise_giris_tarihi)) AS ders,
           d.isletme_id AS isletme
      FROM donem d
      JOIN public.personel_profil p ON p.isletme_id = d.isletme_id
      JOIN public.kullanici k ON k.id = p.kullanici_id AND k.isletme_id = d.isletme_id
  ),
  defter AS (
    SELECT h.kullanici_id AS k_id,
           coalesce(sum(h.tutar_kurus) FILTER (WHERE h.tur = 'hakedis'), 0)::bigint AS taban,
           coalesce(sum(h.tutar_kurus) FILTER (WHERE h.tur = 'prim'), 0)::bigint AS prim,
           count(*) > 0 AS var
      FROM public.personel_hesap_hareket h, donem d
     WHERE h.isletme_id = d.isletme_id AND h.donem = d.ay AND h.tur IN ('hakedis', 'prim')
     GROUP BY h.kullanici_id
  ),
  sonuc AS (
    SELECT hs.k_id, hs.k_ad, hs.k_rol, hs.gun, hs.ay_gun, hs.ders,
           coalesce(df.var, false) AS kapali,
           CASE WHEN coalesce(df.var, false) THEN df.taban
                WHEN hs.ay_gun > 0 THEN round(hs.maas_kurus::numeric * hs.gun / hs.ay_gun)::bigint
                ELSE 0 END AS taban,
           CASE WHEN coalesce(df.var, false) THEN df.prim ELSE hs.ders::bigint * hs.ders_prim_kurus END AS prim
      FROM hesap hs
      LEFT JOIN defter df ON df.k_id = hs.k_id
  )
  SELECT s.k_id, s.k_ad, s.k_rol, s.gun::integer, s.ay_gun::integer, s.taban, s.ders, s.prim, s.taban + s.prim, s.kapali
    FROM sonuc s
   WHERE s.kapali OR s.gun > 0 OR s.ders > 0
   ORDER BY s.k_ad;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_hakedis_hesapla(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personel_hakedis_hesapla(date) TO authenticated;

-- Dönem kapatma: biten ayın hakediş ve prim satırlarını deftere yazar. Tekrar çalıştırmak güvenlidir.
-- Dönüş: bu çağrıda yazılan satır sayısı.
CREATE OR REPLACE FUNCTION public.personel_donem_kapat(p_ay date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  v_ay date := make_date(extract(year FROM p_ay)::integer, extract(month FROM p_ay)::integer, 1);
  v_bugun date := public.bugun_istanbul();
  v_bu_ay date := make_date(extract(year FROM v_bugun)::integer, extract(month FROM v_bugun)::integer, 1);
  v_yazilan integer := 0;
BEGIN
  -- Bitmemiş (devam eden veya gelecek) dönem kapatılamaz: dersler ve günler henüz kesinleşmedi.
  IF v_ay >= v_bu_ay THEN
    RAISE EXCEPTION 'donem_bitmedi';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_isletme::text || v_ay::text, 2));

  -- Hesap TEK seferde (tek anlık görüntü) alınır: iki ayrı sorguda yapılsaydı, ilk satır yazılınca personel "kapalı"
  -- görünüp prim satırı atlanırdı. Yalnız HENÜZ kapatılmamış personeller yazılır; tekrar çalıştırmak çift kayıt üretmez.
  WITH h AS MATERIALIZED (
    SELECT * FROM public.personel_hakedis_hesapla(v_ay) WHERE NOT kapali
  ),
  hakedis AS (
    INSERT INTO public.personel_hesap_hareket (isletme_id, kullanici_id, tur, tutar_kurus, donem, aciklama)
    SELECT v_isletme, h.kullanici_id, 'hakedis', h.taban_kurus, v_ay,
           'Sabit maaş' || CASE WHEN h.calisilan_gun < h.toplam_gun THEN format(' (%s/%s gün oranlı)', h.calisilan_gun, h.toplam_gun) ELSE '' END
      FROM h WHERE h.taban_kurus > 0
    ON CONFLICT DO NOTHING
    RETURNING 1
  ),
  prim AS (
    INSERT INTO public.personel_hesap_hareket (isletme_id, kullanici_id, tur, tutar_kurus, donem, aciklama)
    SELECT v_isletme, h.kullanici_id, 'prim', h.prim_kurus, v_ay, format('%s tamamlanan ders primi', h.ders_sayisi)
      FROM h WHERE h.prim_kurus > 0
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM hakedis) + (SELECT count(*) FROM prim) INTO v_yazilan;

  RETURN v_yazilan;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_donem_kapat(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personel_donem_kapat(date) TO authenticated;

-- Ödeme / avans kaydı (yönetici ve muhasebe). Idempotent: aynı anahtar ikinci kez kayıt açmaz.
CREATE OR REPLACE FUNCTION public.personel_hesap_hareket_ekle(
  p_kullanici_id uuid,
  p_tur text,
  p_tutar_kurus bigint,
  p_yontem text,
  p_aciklama text DEFAULT NULL,
  p_anahtar uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'muhasebe']);
  v_id uuid;
BEGIN
  IF p_anahtar IS NOT NULL THEN
    SELECT id INTO v_id FROM public.personel_hesap_hareket WHERE isletme_id = v_isletme AND idempotency_anahtari = p_anahtar;
    IF FOUND THEN
      RETURN v_id;
    END IF;
  END IF;

  IF p_tur NOT IN ('odeme', 'avans') THEN
    RAISE EXCEPTION 'hareket_turu_gecersiz';
  END IF;
  IF p_yontem IS NULL OR p_yontem NOT IN ('nakit', 'havale') THEN
    RAISE EXCEPTION 'odeme_yontemi_gerekli';
  END IF;
  IF p_tutar_kurus IS NULL OR p_tutar_kurus <= 0 THEN
    RAISE EXCEPTION 'tutar_gecersiz';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kullanici WHERE id = p_kullanici_id AND isletme_id = v_isletme) THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;

  INSERT INTO public.personel_hesap_hareket (isletme_id, kullanici_id, tur, tutar_kurus, odeme_yontemi, aciklama, idempotency_anahtari)
  VALUES (v_isletme, p_kullanici_id, p_tur, p_tutar_kurus, p_yontem, nullif(btrim(p_aciklama), ''), p_anahtar)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_hesap_hareket_ekle(uuid, text, bigint, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personel_hesap_hareket_ekle(uuid, text, bigint, text, text, uuid) TO authenticated;

-- Üyelik: paket tanımı, üyelik (süre/seans bazlı), dondurma, satış/iptal fonksiyonları.
-- (UYGULANMADI — önce 20260930120000 uygulanmış olmalı.)
--
-- Tasarım: durum değişiklikleri (satış, dondurma, iptal, hak düşümü) YALNIZCA SECURITY DEFINER
-- fonksiyonlarla yapılır; kullanıcılar uyelik/uyelik_dondurma tablolarını yalnız OKUYABİLİR.
-- Definer fonksiyonlar RLS'i atlar, bu yüzden her sorguda isletme_id açıkça süzülür ve rol kontrol edilir.
-- bitis_tarihi DAHİL (son geçerli gün). "Sona erdi/dondurulmuş" saklanmaz, hesaplanır (cron gerekmez).

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- 1) Paket tanımı -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.uyelik_paketi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  ad text NOT NULL CHECK (char_length(btrim(ad)) >= 2),
  tur text NOT NULL CHECK (tur IN ('sure', 'seans')),
  sure_gun integer,
  seans_sayisi integer,
  gecerlilik_gun integer,
  fiyat_kurus bigint NOT NULL CHECK (fiyat_kurus >= 0),
  kdv_orani smallint NOT NULL DEFAULT 20 CHECK (kdv_orani BETWEEN 0 AND 100),
  dondurma_izni boolean NOT NULL DEFAULT false,
  azami_dondurma_gun integer NOT NULL DEFAULT 0 CHECK (azami_dondurma_gun >= 0),
  dondurma_ucret_kurus bigint NOT NULL DEFAULT 0 CHECK (dondurma_ucret_kurus >= 0),
  satis_bitis_tarihi date,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, isletme_id),
  CONSTRAINT paket_tur_kurali CHECK (
    -- NULL tuzağı: CHECK, NULL sonucunu GEÇTİ sayar; bu yüzden IS NOT NULL açıkça yazılır.
    (tur = 'sure' AND sure_gun IS NOT NULL AND sure_gun > 0 AND seans_sayisi IS NULL AND gecerlilik_gun IS NULL)
    OR (tur = 'seans' AND seans_sayisi IS NOT NULL AND seans_sayisi > 0 AND sure_gun IS NULL AND (gecerlilik_gun IS NULL OR gecerlilik_gun > 0))
  ),
  CONSTRAINT paket_dondurma_kurali CHECK (dondurma_izni OR (azami_dondurma_gun = 0 AND dondurma_ucret_kurus = 0))
);

DROP TRIGGER IF EXISTS trg_uyelik_paketi_updated_at ON public.uyelik_paketi;
CREATE TRIGGER trg_uyelik_paketi_updated_at
  BEFORE UPDATE ON public.uyelik_paketi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_uyelik_paketi ON public.uyelik_paketi;
CREATE TRIGGER trg_audit_uyelik_paketi
  AFTER INSERT OR UPDATE OR DELETE ON public.uyelik_paketi
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

-- 2) Üyelik (satılmış paket) -----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.uyelik (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL,
  musteri_id uuid NOT NULL,
  paket_id uuid NOT NULL,
  paket_adi text NOT NULL,
  tur text NOT NULL CHECK (tur IN ('sure', 'seans')),
  baslangic_tarihi date NOT NULL,
  bitis_tarihi date,
  toplam_hak integer,
  kalan_hak integer,
  fiyat_kurus bigint NOT NULL CHECK (fiyat_kurus >= 0),
  iskonto_kurus bigint NOT NULL DEFAULT 0 CHECK (iskonto_kurus >= 0),
  -- Satış anındaki dondurma koşulları (paket sonradan değişse de bu üyelik etkilenmez).
  dondurma_izni boolean NOT NULL DEFAULT false,
  azami_dondurma_gun integer NOT NULL DEFAULT 0,
  dondurma_ucret_kurus bigint NOT NULL DEFAULT 0,
  durum text NOT NULL DEFAULT 'aktif' CHECK (durum IN ('aktif', 'iptal')),
  iptal_zamani timestamptz,
  iptal_nedeni text,
  satis_anahtari uuid,
  olusturan_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (musteri_id, isletme_id) REFERENCES public.musteri (id, isletme_id) ON DELETE RESTRICT,
  FOREIGN KEY (paket_id, isletme_id) REFERENCES public.uyelik_paketi (id, isletme_id) ON DELETE RESTRICT,
  UNIQUE (id, isletme_id),
  UNIQUE (isletme_id, satis_anahtari),
  CONSTRAINT uyelik_hak_kurali CHECK (
    (tur = 'sure' AND toplam_hak IS NULL AND kalan_hak IS NULL)
    OR (tur = 'seans' AND toplam_hak IS NOT NULL AND kalan_hak IS NOT NULL AND toplam_hak > 0 AND kalan_hak BETWEEN 0 AND toplam_hak)
  ),
  CONSTRAINT uyelik_tarih_kurali CHECK (bitis_tarihi IS NULL OR bitis_tarihi >= baslangic_tarihi),
  CONSTRAINT uyelik_sure_bitis CHECK (tur <> 'sure' OR bitis_tarihi IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_uyelik_musteri ON public.uyelik (musteri_id, baslangic_tarihi DESC);
CREATE INDEX IF NOT EXISTS idx_uyelik_isletme_bitis ON public.uyelik (isletme_id, bitis_tarihi);

DROP TRIGGER IF EXISTS trg_uyelik_updated_at ON public.uyelik;
CREATE TRIGGER trg_uyelik_updated_at
  BEFORE UPDATE ON public.uyelik
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_uyelik ON public.uyelik;
CREATE TRIGGER trg_audit_uyelik
  AFTER INSERT OR UPDATE ON public.uyelik
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

-- Defter satırlarını üyeliğe bağla (tablo döngüsünü kırmak için FK sonradan eklenir).
ALTER TABLE public.musteri_bakiye_hareket DROP CONSTRAINT IF EXISTS hareket_uyelik_fk;
ALTER TABLE public.musteri_bakiye_hareket
  ADD CONSTRAINT hareket_uyelik_fk FOREIGN KEY (uyelik_id, isletme_id) REFERENCES public.uyelik (id, isletme_id);

-- 3) Dondurma -------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.uyelik_dondurma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL,
  uyelik_id uuid NOT NULL,
  baslangic_tarihi date NOT NULL,
  bitis_tarihi date NOT NULL,
  gun_sayisi integer NOT NULL CHECK (gun_sayisi >= 0),
  ucret_kurus bigint NOT NULL DEFAULT 0 CHECK (ucret_kurus >= 0),
  iptal boolean NOT NULL DEFAULT false,
  olusturan_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (uyelik_id, isletme_id) REFERENCES public.uyelik (id, isletme_id) ON DELETE RESTRICT,
  CONSTRAINT dondurma_tarih_kurali CHECK (bitis_tarihi >= baslangic_tarihi),
  -- Bir üyelikte iptal edilmemiş dondurmalar çakışamaz.
  CONSTRAINT dondurma_cakisma EXCLUDE USING gist (
    uyelik_id WITH =,
    daterange(baslangic_tarihi, bitis_tarihi, '[]') WITH &&
  ) WHERE (NOT iptal)
);

CREATE INDEX IF NOT EXISTS idx_dondurma_uyelik ON public.uyelik_dondurma (uyelik_id);

DROP TRIGGER IF EXISTS trg_audit_uyelik_dondurma ON public.uyelik_dondurma;
CREATE TRIGGER trg_audit_uyelik_dondurma
  AFTER INSERT OR UPDATE ON public.uyelik_dondurma
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

-- 4) Geçerli durum (tek kaynak): iptal | dondurulmus | sona_erdi | beklemede | aktif --------------------------------
CREATE OR REPLACE FUNCTION public.uyelik_gecerli_durum(u public.uyelik)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN u.durum = 'iptal' THEN 'iptal'
    WHEN EXISTS (
      SELECT 1 FROM public.uyelik_dondurma d
       WHERE d.uyelik_id = u.id AND NOT d.iptal
         AND public.bugun_istanbul() BETWEEN d.baslangic_tarihi AND d.bitis_tarihi
    ) THEN 'dondurulmus'
    WHEN u.bitis_tarihi IS NOT NULL AND u.bitis_tarihi < public.bugun_istanbul() THEN 'sona_erdi'
    WHEN u.kalan_hak IS NOT NULL AND u.kalan_hak <= 0 THEN 'sona_erdi'
    WHEN u.baslangic_tarihi > public.bugun_istanbul() THEN 'beklemede'
    ELSE 'aktif'
  END
$$;

CREATE OR REPLACE VIEW public.uyelik_gorunum WITH (security_invoker = true) AS
SELECT u.*, public.uyelik_gecerli_durum(u) AS gecerli_durum
  FROM public.uyelik u;

-- 5) RLS ------------------------------------------------------------------------------------------------------
ALTER TABLE public.uyelik_paketi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uyelik ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uyelik_dondurma ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.uyelik_paketi, public.uyelik, public.uyelik_dondurma, public.uyelik_gorunum FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.uyelik_paketi TO authenticated;
GRANT SELECT ON public.uyelik, public.uyelik_dondurma, public.uyelik_gorunum TO authenticated;
-- uyelik / uyelik_dondurma: yazma yetkisi YOK — yalnız aşağıdaki SECURITY DEFINER fonksiyonlar.

DROP POLICY IF EXISTS "paket_select" ON public.uyelik_paketi;
CREATE POLICY "paket_select" ON public.uyelik_paketi FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()))
    OR (SELECT public.is_super_admin())
  );
DROP POLICY IF EXISTS "paket_insert" ON public.uyelik_paketi;
CREATE POLICY "paket_insert" ON public.uyelik_paketi FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');
DROP POLICY IF EXISTS "paket_update" ON public.uyelik_paketi;
CREATE POLICY "paket_update" ON public.uyelik_paketi FOR UPDATE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');

DROP POLICY IF EXISTS "uyelik_select" ON public.uyelik;
CREATE POLICY "uyelik_select" ON public.uyelik FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon', 'muhasebe'))
    OR (SELECT public.is_super_admin())
  );

DROP POLICY IF EXISTS "dondurma_select" ON public.uyelik_dondurma;
CREATE POLICY "dondurma_select" ON public.uyelik_dondurma FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon', 'muhasebe'))
    OR (SELECT public.is_super_admin())
  );

-- 6) Ortak: rol + tenant kapısı (definer fonksiyonlarda) ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rol_zorunlu(p_roller text[])
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.current_isletme_id();
BEGIN
  IF v_isletme IS NULL THEN
    RAISE EXCEPTION 'isletme_yok';
  END IF;
  IF public.current_rol() IS NULL OR NOT (public.current_rol() = ANY (p_roller)) THEN
    RAISE EXCEPTION 'yetki_yetersiz';
  END IF;
  RETURN v_isletme;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rol_zorunlu(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rol_zorunlu(text[]) TO authenticated;

-- 7) Satış: üyelik + borç (+ ilk tahsilat) TEK işlemde; idempotent ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.uyelik_sat(
  p_musteri_id uuid,
  p_paket_id uuid,
  p_baslangic date DEFAULT NULL,
  p_iskonto_kurus bigint DEFAULT 0,
  p_odeme_kurus bigint DEFAULT 0,
  p_odeme_yontemi text DEFAULT NULL,
  p_anahtar uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon']);
  v_bugun date := public.bugun_istanbul();
  v_paket public.uyelik_paketi%ROWTYPE;
  v_baslangic date := coalesce(p_baslangic, public.bugun_istanbul());
  v_bitis date;
  v_net bigint;
  v_id uuid;
BEGIN
  IF p_anahtar IS NOT NULL THEN
    SELECT id INTO v_id FROM public.uyelik WHERE isletme_id = v_isletme AND satis_anahtari = p_anahtar;
    IF FOUND THEN
      RETURN v_id;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.musteri WHERE id = p_musteri_id AND isletme_id = v_isletme AND aktif) THEN
    RAISE EXCEPTION 'musteri_bulunamadi';
  END IF;

  SELECT * INTO v_paket FROM public.uyelik_paketi WHERE id = p_paket_id AND isletme_id = v_isletme;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'paket_bulunamadi';
  END IF;
  IF NOT v_paket.aktif OR (v_paket.satis_bitis_tarihi IS NOT NULL AND v_paket.satis_bitis_tarihi < v_bugun) THEN
    RAISE EXCEPTION 'paket_satisa_kapali';
  END IF;

  IF v_baslangic < v_bugun THEN
    RAISE EXCEPTION 'gecmis_baslangic';
  END IF;
  IF coalesce(p_iskonto_kurus, 0) < 0 OR coalesce(p_iskonto_kurus, 0) > v_paket.fiyat_kurus THEN
    RAISE EXCEPTION 'iskonto_asildi';
  END IF;
  v_net := v_paket.fiyat_kurus - coalesce(p_iskonto_kurus, 0);
  IF coalesce(p_odeme_kurus, 0) < 0 OR coalesce(p_odeme_kurus, 0) > v_net THEN
    RAISE EXCEPTION 'odeme_asildi';
  END IF;
  IF coalesce(p_odeme_kurus, 0) > 0 AND nullif(p_odeme_yontemi, '') IS NULL THEN
    RAISE EXCEPTION 'odeme_yontemi_gerekli';
  END IF;

  IF v_paket.tur = 'sure' THEN
    v_bitis := v_baslangic + v_paket.sure_gun - 1;
  ELSIF v_paket.gecerlilik_gun IS NOT NULL THEN
    v_bitis := v_baslangic + v_paket.gecerlilik_gun - 1;
  END IF;

  INSERT INTO public.uyelik (
    isletme_id, musteri_id, paket_id, paket_adi, tur, baslangic_tarihi, bitis_tarihi,
    toplam_hak, kalan_hak, fiyat_kurus, iskonto_kurus,
    dondurma_izni, azami_dondurma_gun, dondurma_ucret_kurus, satis_anahtari
  )
  VALUES (
    v_isletme, p_musteri_id, v_paket.id, v_paket.ad, v_paket.tur, v_baslangic, v_bitis,
    v_paket.seans_sayisi, v_paket.seans_sayisi, v_paket.fiyat_kurus, coalesce(p_iskonto_kurus, 0),
    v_paket.dondurma_izni, v_paket.azami_dondurma_gun, v_paket.dondurma_ucret_kurus, p_anahtar
  )
  RETURNING id INTO v_id;

  IF v_paket.fiyat_kurus > 0 THEN
    INSERT INTO public.musteri_bakiye_hareket (isletme_id, musteri_id, tur, tutar_kurus, iskonto_kurus, aciklama, uyelik_id)
    VALUES (v_isletme, p_musteri_id, 'borc', v_paket.fiyat_kurus, coalesce(p_iskonto_kurus, 0), 'Üyelik satışı: ' || v_paket.ad, v_id);
  END IF;
  IF coalesce(p_odeme_kurus, 0) > 0 THEN
    INSERT INTO public.musteri_bakiye_hareket (isletme_id, musteri_id, tur, tutar_kurus, odeme_yontemi, aciklama, uyelik_id)
    VALUES (v_isletme, p_musteri_id, 'odeme', p_odeme_kurus, p_odeme_yontemi, 'Üyelik satışı tahsilatı', v_id);
  END IF;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.uyelik_sat(uuid, uuid, date, bigint, bigint, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uyelik_sat(uuid, uuid, date, bigint, bigint, text, uuid) TO authenticated;

-- 8) Dondurma: bugünden başlayarak p_gun gün; bitiş tarihi aynı gün kadar uzar ------------------------------------------
CREATE OR REPLACE FUNCTION public.uyelik_dondur(p_uyelik_id uuid, p_gun integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon']);
  v_bugun date := public.bugun_istanbul();
  u public.uyelik%ROWTYPE;
  v_kullanilan integer;
  v_id uuid;
BEGIN
  SELECT * INTO u FROM public.uyelik WHERE id = p_uyelik_id AND isletme_id = v_isletme FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'uyelik_bulunamadi';
  END IF;
  IF NOT u.dondurma_izni THEN
    RAISE EXCEPTION 'dondurma_izni_yok';
  END IF;
  IF p_gun IS NULL OR p_gun < 1 THEN
    RAISE EXCEPTION 'dondurma_gun_gecersiz';
  END IF;
  IF u.bitis_tarihi IS NULL OR public.uyelik_gecerli_durum(u) <> 'aktif' THEN
    RAISE EXCEPTION 'dondurma_uygun_degil';
  END IF;

  SELECT coalesce(sum(gun_sayisi), 0) INTO v_kullanilan
    FROM public.uyelik_dondurma WHERE uyelik_id = u.id AND NOT iptal;
  IF v_kullanilan + p_gun > u.azami_dondurma_gun THEN
    RAISE EXCEPTION 'dondurma_limiti';
  END IF;

  BEGIN
    INSERT INTO public.uyelik_dondurma (isletme_id, uyelik_id, baslangic_tarihi, bitis_tarihi, gun_sayisi, ucret_kurus)
    VALUES (v_isletme, u.id, v_bugun, v_bugun + p_gun - 1, p_gun, u.dondurma_ucret_kurus)
    RETURNING id INTO v_id;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'dondurma_cakisma';
  END;

  UPDATE public.uyelik SET bitis_tarihi = bitis_tarihi + p_gun WHERE id = u.id;

  IF u.dondurma_ucret_kurus > 0 THEN
    INSERT INTO public.musteri_bakiye_hareket (isletme_id, musteri_id, tur, tutar_kurus, aciklama, uyelik_id)
    VALUES (v_isletme, u.musteri_id, 'borc', u.dondurma_ucret_kurus, 'Üyelik dondurma ücreti', u.id);
  END IF;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.uyelik_dondur(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uyelik_dondur(uuid, integer) TO authenticated;

-- Dondurmayı erken bitir: kullanılmayan günler bitişten geri alınır; bugün üye giriş yapabilir ---------------------------
CREATE OR REPLACE FUNCTION public.uyelik_dondurmayi_bitir(p_uyelik_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon']);
  v_bugun date := public.bugun_istanbul();
  u public.uyelik%ROWTYPE;
  d public.uyelik_dondurma%ROWTYPE;
  v_kullanilan integer;
  v_iade_gun integer;
BEGIN
  SELECT * INTO u FROM public.uyelik WHERE id = p_uyelik_id AND isletme_id = v_isletme FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'uyelik_bulunamadi';
  END IF;

  SELECT * INTO d FROM public.uyelik_dondurma
   WHERE uyelik_id = u.id AND NOT iptal AND v_bugun BETWEEN baslangic_tarihi AND bitis_tarihi
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'aktif_dondurma_yok';
  END IF;

  v_kullanilan := v_bugun - d.baslangic_tarihi;      -- bugünden ÖNCEki dondurulmuş günler
  v_iade_gun := d.gun_sayisi - v_kullanilan;         -- geri verilecek (kullanılmayan) gün

  IF v_kullanilan = 0 THEN
    UPDATE public.uyelik_dondurma SET iptal = true, gun_sayisi = 0 WHERE id = d.id;
  ELSE
    UPDATE public.uyelik_dondurma SET bitis_tarihi = v_bugun - 1, gun_sayisi = v_kullanilan WHERE id = d.id;
  END IF;
  UPDATE public.uyelik SET bitis_tarihi = bitis_tarihi - v_iade_gun WHERE id = u.id;

  RETURN v_iade_gun;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.uyelik_dondurmayi_bitir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uyelik_dondurmayi_bitir(uuid) TO authenticated;

-- İptal (yalnız yönetici). Para iadesi AYRI ve bilinçlidir: defterde iade hareketi ile yapılır. --------------------------
CREATE OR REPLACE FUNCTION public.uyelik_iptal(p_uyelik_id uuid, p_neden text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
BEGIN
  UPDATE public.uyelik
     SET durum = 'iptal', iptal_zamani = now(), iptal_nedeni = nullif(btrim(p_neden), '')
   WHERE id = p_uyelik_id AND isletme_id = v_isletme AND durum <> 'iptal';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'uyelik_bulunamadi';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.uyelik_iptal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uyelik_iptal(uuid, text) TO authenticated;

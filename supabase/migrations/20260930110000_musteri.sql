-- Müşteri: kayıt, hassas veri (KVKK), veli, onam kayıtları, arama.
-- (UYGULANMADI — önce 20260930100000 uygulanmış olmalı.)
--
-- Erişim: musteri / musteri_hassas / musteri_veli / musteri_onam = isletme_admin + resepsiyon.
-- muhasebe ve antrenor müşteri kişisel verisini GÖRMEZ; yalnız musteri_ozet (id, üye no, ad) görünümü.
-- Silme: KVKK silme/anonimleştirme akışı ayrı tasarlanır; şimdilik DELETE policy yok (aktif=false).

-- 1) TC kimlik no doğrulaması (resmi algoritma) --------------------------------------------------
CREATE OR REPLACE FUNCTION public.tc_kimlik_gecerli(p_tc text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  d int[];
  i int;
  tek int;
  cift int;
  toplam int;
BEGIN
  IF p_tc IS NULL OR p_tc !~ '^[1-9][0-9]{10}$' THEN
    RETURN false;
  END IF;
  FOR i IN 1..11 LOOP
    d[i] := substr(p_tc, i, 1)::int;
  END LOOP;
  tek := d[1] + d[3] + d[5] + d[7] + d[9];
  cift := d[2] + d[4] + d[6] + d[8];
  IF ((tek * 7 - cift) % 10 + 10) % 10 <> d[10] THEN
    RETURN false;
  END IF;
  toplam := 0;
  FOR i IN 1..10 LOOP
    toplam := toplam + d[i];
  END LOOP;
  RETURN toplam % 10 = d[11];
END;
$$;

-- 2) Müşteri ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.musteri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  uye_no bigint NOT NULL,
  ad_soyad text NOT NULL CHECK (char_length(btrim(ad_soyad)) >= 2),
  telefon text NOT NULL CHECK (telefon ~ '^\+90[0-9]{10}$'),
  eposta text CHECK (eposta IS NULL OR eposta ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  dogum_tarihi date CHECK (dogum_tarihi IS NULL OR dogum_tarihi >= DATE '1900-01-01'),
  cinsiyet text NOT NULL DEFAULT 'belirtilmemis' CHECK (cinsiyet IN ('kadin', 'erkek', 'belirtilmemis')),
  kategori text NOT NULL DEFAULT 'standart' CHECK (kategori IN ('standart', 'gold', 'vip', 'platinum')),
  kayit_kanali text NOT NULL DEFAULT 'resepsiyon' CHECK (kayit_kanali IN ('resepsiyon', 'qr_self_servis')),
  risk_bayraklari text[] NOT NULL DEFAULT '{}' CHECK (risk_bayraklari <@ ARRAY['saglik_riski', 'sakatlik_riski']::text[]),
  not_metni text,
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kullanici_id uuid REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Arama: Türkçe normalize ad + telefon + üye no (LIKE ile; bkz. musteri_ara).
  arama_metni text GENERATED ALWAYS AS (
    public.tr_normalize(ad_soyad) || ' ' || telefon || ' ' || uye_no::text
  ) STORED,
  UNIQUE (isletme_id, uye_no),
  -- Alt tablolar (isletme_id, musteri_id) bileşik FK ile tenant tutarlılığını garanti eder.
  UNIQUE (id, isletme_id)
);

CREATE INDEX IF NOT EXISTS idx_musteri_isletme_ad ON public.musteri (isletme_id, ad_soyad);
CREATE INDEX IF NOT EXISTS idx_musteri_isletme_telefon ON public.musteri (isletme_id, telefon);

-- Üye numarası işletme başına 1'den artar; istemci VERMEZ (verse de ezilir).
CREATE OR REPLACE FUNCTION public.musteri_uye_no_ata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.uye_no := public.sonraki_sayac(NEW.isletme_id, 'uye_no');
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.musteri_uye_no_ata() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_musteri_uye_no ON public.musteri;
CREATE TRIGGER trg_musteri_uye_no
  BEFORE INSERT ON public.musteri
  FOR EACH ROW EXECUTE FUNCTION public.musteri_uye_no_ata();

-- uye_no ve isletme_id sonradan değiştirilemez.
CREATE OR REPLACE FUNCTION public.musteri_degismez_alanlar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.uye_no IS DISTINCT FROM OLD.uye_no OR NEW.isletme_id IS DISTINCT FROM OLD.isletme_id THEN
    RAISE EXCEPTION 'degismez_alan';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_musteri_degismez ON public.musteri;
CREATE TRIGGER trg_musteri_degismez
  BEFORE UPDATE ON public.musteri
  FOR EACH ROW EXECUTE FUNCTION public.musteri_degismez_alanlar();

DROP TRIGGER IF EXISTS trg_musteri_updated_at ON public.musteri;
CREATE TRIGGER trg_musteri_updated_at
  BEFORE UPDATE ON public.musteri
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_musteri ON public.musteri;
CREATE TRIGGER trg_audit_musteri
  AFTER INSERT OR UPDATE OR DELETE ON public.musteri
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

-- 3) Hassas veri (1-1): kimlik, adres, acil durum, sağlık beyanı ---------------------------------------
CREATE TABLE IF NOT EXISTS public.musteri_hassas (
  musteri_id uuid PRIMARY KEY,
  isletme_id uuid NOT NULL,
  tc_kimlik_no text CHECK (tc_kimlik_no IS NULL OR public.tc_kimlik_gecerli(tc_kimlik_no)),
  il text,
  ilce text,
  mahalle text,
  adres_detay text,
  acil_durum_ad_soyad text,
  acil_durum_telefon text CHECK (acil_durum_telefon IS NULL OR acil_durum_telefon ~ '^\+90[0-9]{10}$'),
  saglik_bayraklari text[] NOT NULL DEFAULT '{}' CHECK (
    saglik_bayraklari <@ ARRAY['kronik_rahatsizlik', 'kalp_damar', 'tansiyon', 'sakatlik', 'ortopedik', 'hamilelik', 'diyabet', 'astim', 'diger']::text[]
  ),
  saglik_notu text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (musteri_id, isletme_id) REFERENCES public.musteri (id, isletme_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_musteri_hassas_updated_at ON public.musteri_hassas;
CREATE TRIGGER trg_musteri_hassas_updated_at
  BEFORE UPDATE ON public.musteri_hassas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_musteri_hassas ON public.musteri_hassas;
CREATE TRIGGER trg_audit_musteri_hassas
  AFTER INSERT OR UPDATE OR DELETE ON public.musteri_hassas
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

-- 4) Veli / vasi (18 yaş altı) ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.musteri_veli (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  musteri_id uuid NOT NULL UNIQUE,
  isletme_id uuid NOT NULL,
  ad_soyad text NOT NULL CHECK (char_length(btrim(ad_soyad)) >= 2),
  telefon text NOT NULL CHECK (telefon ~ '^\+90[0-9]{10}$'),
  yakinlik text NOT NULL DEFAULT 'diger' CHECK (yakinlik IN ('anne', 'baba', 'vasi', 'diger')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (musteri_id, isletme_id) REFERENCES public.musteri (id, isletme_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_audit_musteri_veli ON public.musteri_veli;
CREATE TRIGGER trg_audit_musteri_veli
  AFTER INSERT OR UPDATE OR DELETE ON public.musteri_veli
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

-- 5) Onam kayıtları: INSERT-ONLY (kim, ne zaman, hangi metin sürümüne) -----------------------------------
CREATE TABLE IF NOT EXISTS public.musteri_onam (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  musteri_id uuid NOT NULL,
  isletme_id uuid NOT NULL,
  tur text NOT NULL CHECK (tur IN ('kvkk_aydinlatma', 'acik_riza_saglik', 'ticari_ileti', 'taahhutname', 'veli_onayi')),
  verildi boolean NOT NULL,
  metin_versiyonu text NOT NULL CHECK (char_length(btrim(metin_versiyonu)) > 0),
  veren text NOT NULL DEFAULT 'kendisi' CHECK (veren IN ('kendisi', 'veli')),
  kaydeden_kullanici_id uuid REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (musteri_id, isletme_id) REFERENCES public.musteri (id, isletme_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_musteri_onam_musteri ON public.musteri_onam (musteri_id, tur, created_at DESC);

-- 6) RLS ----------------------------------------------------------------------------------------------
ALTER TABLE public.musteri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.musteri_hassas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.musteri_veli ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.musteri_onam ENABLE ROW LEVEL SECURITY;

-- Supabase varsayılan olarak authenticated'a TÜM yetkileri verir: önce hepsi geri alınır, sonra yalnız gerekenler verilir.
REVOKE ALL ON public.musteri, public.musteri_hassas, public.musteri_veli, public.musteri_onam FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.musteri, public.musteri_hassas, public.musteri_veli TO authenticated;
GRANT SELECT, INSERT ON public.musteri_onam TO authenticated;

-- Tekrarlanan kalıp: aynı işletme + (isletme_admin | resepsiyon) veya super_admin.
DROP POLICY IF EXISTS "musteri_select" ON public.musteri;
CREATE POLICY "musteri_select" ON public.musteri FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'))
    OR (SELECT public.is_super_admin())
  );
DROP POLICY IF EXISTS "musteri_insert" ON public.musteri;
CREATE POLICY "musteri_insert" ON public.musteri FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'));
DROP POLICY IF EXISTS "musteri_update" ON public.musteri;
CREATE POLICY "musteri_update" ON public.musteri FOR UPDATE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'))
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'));

DROP POLICY IF EXISTS "musteri_hassas_select" ON public.musteri_hassas;
CREATE POLICY "musteri_hassas_select" ON public.musteri_hassas FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'))
    OR (SELECT public.is_super_admin())
  );
DROP POLICY IF EXISTS "musteri_hassas_insert" ON public.musteri_hassas;
CREATE POLICY "musteri_hassas_insert" ON public.musteri_hassas FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'));
DROP POLICY IF EXISTS "musteri_hassas_update" ON public.musteri_hassas;
CREATE POLICY "musteri_hassas_update" ON public.musteri_hassas FOR UPDATE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'))
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'));

DROP POLICY IF EXISTS "musteri_veli_select" ON public.musteri_veli;
CREATE POLICY "musteri_veli_select" ON public.musteri_veli FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'))
    OR (SELECT public.is_super_admin())
  );
DROP POLICY IF EXISTS "musteri_veli_insert" ON public.musteri_veli;
CREATE POLICY "musteri_veli_insert" ON public.musteri_veli FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'));
DROP POLICY IF EXISTS "musteri_veli_update" ON public.musteri_veli;
CREATE POLICY "musteri_veli_update" ON public.musteri_veli FOR UPDATE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'))
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'));

DROP POLICY IF EXISTS "musteri_onam_select" ON public.musteri_onam;
CREATE POLICY "musteri_onam_select" ON public.musteri_onam FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'))
    OR (SELECT public.is_super_admin())
  );
DROP POLICY IF EXISTS "musteri_onam_insert" ON public.musteri_onam;
CREATE POLICY "musteri_onam_insert" ON public.musteri_onam FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'));
-- musteri_onam: UPDATE/DELETE policy YOK (ispat kaydı; düzeltme yeni satırdır).

-- 7) Ad-only özet görünümü (muhasebe/antrenör de görür; kişisel veri İÇERMEZ) ----------------------------
-- Bilerek SECURITY DEFINER görünüm: tenant filtresi görünümün içinde AÇIKÇA yazılıdır.
CREATE OR REPLACE VIEW public.musteri_ozet WITH (security_invoker = false) AS
SELECT m.id, m.isletme_id, m.uye_no, m.ad_soyad, m.kategori, m.aktif
  FROM public.musteri m
 WHERE m.isletme_id = (SELECT public.current_isletme_id())
    OR (SELECT public.is_super_admin());

-- Görünüm sahibin yetkisiyle çalıştığı için yazma yetkileri KAPATILIR (aksi halde UPDATE/INSERT RLS'i atlar).
REVOKE ALL ON public.musteri_ozet FROM anon, authenticated;
GRANT SELECT ON public.musteri_ozet TO authenticated;

-- 8) Arama: Türkçe normalize + LIKE kaçışı (RLS uygulanır — SECURITY INVOKER) ---------------------------
CREATE OR REPLACE FUNCTION public.musteri_ara(p_sorgu text, p_limit integer DEFAULT 20)
RETURNS SETOF public.musteri
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT m.*
    FROM public.musteri m
   WHERE m.aktif
     AND m.arama_metni LIKE '%' ||
         replace(replace(replace(public.tr_normalize(btrim(p_sorgu)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
   ORDER BY m.ad_soyad
   LIMIT least(greatest(p_limit, 1), 100)
$$;
REVOKE EXECUTE ON FUNCTION public.musteri_ara(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.musteri_ara(text, integer) TO authenticated;

-- 9) Atomik müşteri oluşturma (KVKK kuralları SQL'de zorlanır) --------------------------------------------
CREATE OR REPLACE FUNCTION public.musteri_olustur(
  p_ad_soyad text,
  p_telefon text,
  p_eposta text DEFAULT NULL,
  p_dogum_tarihi date DEFAULT NULL,
  p_cinsiyet text DEFAULT 'belirtilmemis',
  p_kategori text DEFAULT 'standart',
  p_kayit_kanali text DEFAULT 'resepsiyon',
  p_risk_bayraklari text[] DEFAULT '{}',
  p_not text DEFAULT NULL,
  p_hassas jsonb DEFAULT NULL,
  p_veli jsonb DEFAULT NULL,
  p_onamlar jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.current_isletme_id();
  v_id uuid;
  v_resit_degil boolean;
  v_saglik boolean;
  v_onam jsonb;
BEGIN
  IF v_isletme IS NULL THEN
    RAISE EXCEPTION 'isletme_yok';
  END IF;

  v_resit_degil := p_dogum_tarihi IS NOT NULL AND age(public.bugun_istanbul(), p_dogum_tarihi) < interval '18 years';
  IF v_resit_degil THEN
    IF p_veli IS NULL OR nullif(btrim(p_veli ->> 'ad_soyad'), '') IS NULL OR nullif(p_veli ->> 'telefon', '') IS NULL THEN
      RAISE EXCEPTION 'veli_gerekli';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_onamlar) o
       WHERE o ->> 'tur' = 'veli_onayi' AND (o ->> 'verildi')::boolean IS TRUE
    ) THEN
      RAISE EXCEPTION 'veli_onayi_gerekli';
    END IF;
  END IF;

  v_saglik := p_hassas IS NOT NULL AND (
    jsonb_array_length(coalesce(p_hassas -> 'saglik_bayraklari', '[]'::jsonb)) > 0
    OR nullif(btrim(p_hassas ->> 'saglik_notu'), '') IS NOT NULL
  );
  IF v_saglik AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_onamlar) o
     WHERE o ->> 'tur' = 'acik_riza_saglik' AND (o ->> 'verildi')::boolean IS TRUE
  ) THEN
    RAISE EXCEPTION 'saglik_riza_gerekli';
  END IF;

  INSERT INTO public.musteri (
    isletme_id, ad_soyad, telefon, eposta, dogum_tarihi, cinsiyet, kategori, kayit_kanali,
    risk_bayraklari, not_metni, olusturan_kullanici_id
  )
  VALUES (
    v_isletme, p_ad_soyad, p_telefon, nullif(btrim(p_eposta), ''), p_dogum_tarihi, p_cinsiyet, p_kategori, p_kayit_kanali,
    coalesce(p_risk_bayraklari, '{}'), nullif(btrim(p_not), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  IF p_hassas IS NOT NULL THEN
    INSERT INTO public.musteri_hassas (
      musteri_id, isletme_id, tc_kimlik_no, il, ilce, mahalle, adres_detay,
      acil_durum_ad_soyad, acil_durum_telefon, saglik_bayraklari, saglik_notu
    )
    VALUES (
      v_id, v_isletme,
      nullif(p_hassas ->> 'tc_kimlik_no', ''), nullif(p_hassas ->> 'il', ''), nullif(p_hassas ->> 'ilce', ''),
      nullif(p_hassas ->> 'mahalle', ''), nullif(p_hassas ->> 'adres_detay', ''),
      nullif(p_hassas ->> 'acil_durum_ad_soyad', ''), nullif(p_hassas ->> 'acil_durum_telefon', ''),
      coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_hassas -> 'saglik_bayraklari', '[]'::jsonb))), '{}'),
      nullif(p_hassas ->> 'saglik_notu', '')
    );
  END IF;

  IF p_veli IS NOT NULL AND nullif(btrim(p_veli ->> 'ad_soyad'), '') IS NOT NULL THEN
    INSERT INTO public.musteri_veli (musteri_id, isletme_id, ad_soyad, telefon, yakinlik)
    VALUES (v_id, v_isletme, p_veli ->> 'ad_soyad', p_veli ->> 'telefon', coalesce(nullif(p_veli ->> 'yakinlik', ''), 'diger'));
  END IF;

  FOR v_onam IN SELECT * FROM jsonb_array_elements(p_onamlar) LOOP
    INSERT INTO public.musteri_onam (musteri_id, isletme_id, tur, verildi, metin_versiyonu, veren, kaydeden_kullanici_id)
    VALUES (
      v_id, v_isletme, v_onam ->> 'tur', (v_onam ->> 'verildi')::boolean, v_onam ->> 'metin_versiyonu',
      coalesce(nullif(v_onam ->> 'veren', ''), 'kendisi'), auth.uid()
    );
  END LOOP;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.musteri_olustur(text, text, text, date, text, text, text, text[], text, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.musteri_olustur(text, text, text, date, text, text, text, text[], text, jsonb, jsonb, jsonb) TO authenticated;

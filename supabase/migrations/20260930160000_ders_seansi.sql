-- F8: Ders seansı (PT / bireysel ders): alan-stüdyo, çakışma kontrolü, durum akışı, ders hakkı / cari borç.
-- (UYGULANMADI — önce 20260930140000 uygulanmış olmalı.)
--
-- Klinikteki randevu sisteminin fitness karşılığı. Kurallar:
--  * Antrenör, alan ve müşteri aynı anda iki derste olamaz (exclusion constraint). iptal/gelmedi yeri boşaltır.
--  * 'Ertelendi': aynı satır yeni zamana taşınır (yeni satır açılmaz); yalnız planlandı/ertelendi dersler taşınır.
--  * Ders hakkı AYRI bir kapsamdır: paket kapsamı 'giris' (salona giriş, check-in düşer) veya 'ders' (yalnız PT dersi düşer).
--    Böylece PT dersi ile check-in aynı hakkı yemez. 'ders' kapsamı yalnız seans paketlerinde olur.
--  * Derse gelindiğinde (geldi / gecikmeli_geldi / derste / tamamlandi) ders başına BİR KEZ işlenir (idempotent):
--    en eski uygun ders paketinden 1 hak düşer (FIFO); paket yoksa ders ücreti > 0 ise cariye borç yazılır; ikisi de yoksa ücretsiz.
--  * Hak düşmüş ders 'planlandi/gelmedi/iptal'e alınırsa hak GERİ verilir. Cariye borç yazılmışsa geri alınamaz
--    (defter değişmez; düzeltme cari üzerinden yapılır).
--  * Yazma yalnız SECURITY DEFINER fonksiyonlarla; antrenör yalnız KENDİ derslerini görür ve yalnız derste/tamamlandı işaretler.

-- 1) Paket kapsamı --------------------------------------------------------------------------------------------
ALTER TABLE public.uyelik_paketi ADD COLUMN IF NOT EXISTS kapsam text NOT NULL DEFAULT 'giris' CHECK (kapsam IN ('giris', 'ders'));
ALTER TABLE public.uyelik_paketi DROP CONSTRAINT IF EXISTS paket_kapsam_kurali;
ALTER TABLE public.uyelik_paketi ADD CONSTRAINT paket_kapsam_kurali CHECK (kapsam = 'giris' OR tur = 'seans');

ALTER TABLE public.uyelik ADD COLUMN IF NOT EXISTS kapsam text NOT NULL DEFAULT 'giris' CHECK (kapsam IN ('giris', 'ders'));

-- Satışta paketin kapsamı üyeliğe kopyalanır (uyelik_sat fonksiyonuna dokunmadan).
CREATE OR REPLACE FUNCTION public.uyelik_kapsam_kopyala()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  SELECT p.kapsam INTO NEW.kapsam FROM public.uyelik_paketi p WHERE p.id = NEW.paket_id AND p.isletme_id = NEW.isletme_id;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.uyelik_kapsam_kopyala() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_uyelik_kapsam ON public.uyelik;
CREATE TRIGGER trg_uyelik_kapsam
  BEFORE INSERT ON public.uyelik
  FOR EACH ROW EXECUTE FUNCTION public.uyelik_kapsam_kopyala();

-- 2) Antrenör referansı için (id, isletme_id) tekilliği --------------------------------------------------------
ALTER TABLE public.kullanici DROP CONSTRAINT IF EXISTS kullanici_id_isletme_uq;
ALTER TABLE public.kullanici ADD CONSTRAINT kullanici_id_isletme_uq UNIQUE (id, isletme_id);

-- 3) Alan / stüdyo ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alan_studyo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  ad text NOT NULL CHECK (char_length(btrim(ad)) >= 2),
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, isletme_id),
  UNIQUE (isletme_id, ad)
);

DROP TRIGGER IF EXISTS trg_alan_studyo_updated_at ON public.alan_studyo;
CREATE TRIGGER trg_alan_studyo_updated_at
  BEFORE UPDATE ON public.alan_studyo
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_alan_studyo ON public.alan_studyo;
CREATE TRIGGER trg_audit_alan_studyo
  AFTER INSERT OR UPDATE ON public.alan_studyo
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.alan_studyo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alan_studyo FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.alan_studyo TO authenticated;

DROP POLICY IF EXISTS "alan_select" ON public.alan_studyo;
CREATE POLICY "alan_select" ON public.alan_studyo FOR SELECT TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) OR (SELECT public.is_super_admin()));
DROP POLICY IF EXISTS "alan_insert" ON public.alan_studyo;
CREATE POLICY "alan_insert" ON public.alan_studyo FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');
DROP POLICY IF EXISTS "alan_update" ON public.alan_studyo;
CREATE POLICY "alan_update" ON public.alan_studyo FOR UPDATE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');

-- 4) Ders seansı -----------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ders_seansi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL,
  musteri_id uuid NOT NULL,
  antrenor_id uuid NOT NULL,
  alan_id uuid NOT NULL,
  baslangic timestamptz NOT NULL,
  bitis timestamptz NOT NULL,
  zaman_araligi tstzrange GENERATED ALWAYS AS (tstzrange(baslangic, bitis, '[)')) STORED,
  durum text NOT NULL DEFAULT 'planlandi'
    CHECK (durum IN ('planlandi', 'geldi', 'gecikmeli_geldi', 'derste', 'iptal', 'gelmedi', 'ertelendi', 'tamamlandi')),
  gecikme_dakika integer,
  -- Ders ücreti (kuruş). Hak düşülemezse cariye borç olarak işlenir; 0 = ücretsiz / paketten.
  ucret_kurus bigint NOT NULL DEFAULT 0 CHECK (ucret_kurus >= 0),
  uyelik_id uuid,
  hak_dusuldu boolean NOT NULL DEFAULT false,
  borc_hareket_id uuid,
  not_metni text,
  olusturma_anahtari uuid,
  olusturan_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (musteri_id, isletme_id) REFERENCES public.musteri (id, isletme_id) ON DELETE RESTRICT,
  FOREIGN KEY (antrenor_id, isletme_id) REFERENCES public.kullanici (id, isletme_id) ON DELETE RESTRICT,
  FOREIGN KEY (alan_id, isletme_id) REFERENCES public.alan_studyo (id, isletme_id) ON DELETE RESTRICT,
  FOREIGN KEY (uyelik_id, isletme_id) REFERENCES public.uyelik (id, isletme_id) ON DELETE RESTRICT,
  FOREIGN KEY (borc_hareket_id, isletme_id) REFERENCES public.musteri_bakiye_hareket (id, isletme_id) ON DELETE RESTRICT,
  UNIQUE (isletme_id, olusturma_anahtari),
  CONSTRAINT ders_sure_kurali CHECK (bitis > baslangic AND bitis <= baslangic + interval '8 hours'),
  CONSTRAINT ders_gecikme_kurali CHECK ((durum = 'gecikmeli_geldi') = (gecikme_dakika IS NOT NULL) AND (gecikme_dakika IS NULL OR gecikme_dakika > 0)),
  -- iptal/gelmedi yeri boşaltır; diğer tüm durumlar zamanı tutar.
  CONSTRAINT ders_antrenor_cakisma EXCLUDE USING gist (antrenor_id WITH =, zaman_araligi WITH &&) WHERE (durum NOT IN ('iptal', 'gelmedi')),
  CONSTRAINT ders_alan_cakisma EXCLUDE USING gist (alan_id WITH =, zaman_araligi WITH &&) WHERE (durum NOT IN ('iptal', 'gelmedi')),
  CONSTRAINT ders_musteri_cakisma EXCLUDE USING gist (musteri_id WITH =, zaman_araligi WITH &&) WHERE (durum NOT IN ('iptal', 'gelmedi'))
);

CREATE INDEX IF NOT EXISTS idx_ders_isletme_baslangic ON public.ders_seansi (isletme_id, baslangic);
CREATE INDEX IF NOT EXISTS idx_ders_musteri ON public.ders_seansi (musteri_id, baslangic DESC);
CREATE INDEX IF NOT EXISTS idx_ders_antrenor ON public.ders_seansi (antrenor_id, baslangic);

DROP TRIGGER IF EXISTS trg_ders_seansi_updated_at ON public.ders_seansi;
CREATE TRIGGER trg_ders_seansi_updated_at
  BEFORE UPDATE ON public.ders_seansi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_ders_seansi ON public.ders_seansi;
CREATE TRIGGER trg_audit_ders_seansi
  AFTER INSERT OR UPDATE ON public.ders_seansi
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.ders_seansi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ders_seansi FROM anon, authenticated;
GRANT SELECT ON public.ders_seansi TO authenticated;
-- Yazma yetkisi YOK — yalnız aşağıdaki SECURITY DEFINER fonksiyonlar.

DROP POLICY IF EXISTS "ders_select" ON public.ders_seansi;
CREATE POLICY "ders_select" ON public.ders_seansi FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'))
    OR (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'antrenor' AND antrenor_id = (SELECT auth.uid()))
    OR (SELECT public.is_super_admin())
  );

-- 5) Fonksiyonlar ----------------------------------------------------------------------------------------------
-- Çakışma hatasını anlamlı koda çevirir: antrenor_dolu | alan_dolu | musteri_dolu.
CREATE OR REPLACE FUNCTION public.ders_cakisma_hatasi(p_kisit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_kisit
    WHEN 'ders_antrenor_cakisma' THEN 'antrenor_dolu'
    WHEN 'ders_alan_cakisma' THEN 'alan_dolu'
    WHEN 'ders_musteri_cakisma' THEN 'musteri_dolu'
    ELSE 'cakisma'
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.ders_cakisma_hatasi(text) FROM PUBLIC, anon, authenticated;

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

-- Erteleme / yeniden planlama: aynı satır yeni zamana (ve istenirse yeni antrenör/alana) taşınır, durum 'ertelendi' olur.
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

-- Durum değişikliği + ders hakkı / borç işleme.
-- Dönüş: {"durum":..,"yontem":"hak"|"borc"|"yok"|"zaten_islendi"|"geri_verildi"|null,"kalan_hak":..,"tutar_kurus":..}
CREATE OR REPLACE FUNCTION public.ders_seansi_durum(p_id uuid, p_durum text, p_gecikme_dk integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.current_isletme_id();
  v_rol text := public.current_rol();
  d public.ders_seansi%ROWTYPE;
  u public.uyelik%ROWTYPE;
  v_secilen public.uyelik%ROWTYPE;
  v_islendi boolean;
  v_hareket uuid;
  v_yontem text := NULL;
  v_kalan integer;
  v_kisit text;
BEGIN
  IF v_isletme IS NULL THEN
    RAISE EXCEPTION 'isletme_yok';
  END IF;
  IF p_durum NOT IN ('planlandi', 'geldi', 'gecikmeli_geldi', 'derste', 'tamamlandi', 'gelmedi', 'iptal') THEN
    RAISE EXCEPTION 'gecersiz_durum';
  END IF;

  SELECT * INTO d FROM public.ders_seansi WHERE id = p_id AND isletme_id = v_isletme FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ders_bulunamadi';
  END IF;

  IF v_rol IN ('isletme_admin', 'resepsiyon') THEN
    NULL;
  ELSIF v_rol = 'antrenor' AND d.antrenor_id = auth.uid() AND p_durum IN ('derste', 'tamamlandi') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'yetki_yetersiz';
  END IF;

  IF p_durum = 'gecikmeli_geldi' AND (p_gecikme_dk IS NULL OR p_gecikme_dk <= 0) THEN
    RAISE EXCEPTION 'gecikme_gerekli';
  END IF;

  -- Aynı müşterinin ders hakkı işlemleri sıraya girer.
  PERFORM pg_advisory_xact_lock(hashtextextended(d.musteri_id::text, 1));

  v_islendi := d.hak_dusuldu OR d.borc_hareket_id IS NOT NULL;

  IF p_durum IN ('planlandi', 'gelmedi', 'iptal') AND v_islendi THEN
    IF d.borc_hareket_id IS NOT NULL THEN
      RAISE EXCEPTION 'borc_islendi';
    END IF;
    UPDATE public.uyelik SET kalan_hak = kalan_hak + 1 WHERE id = d.uyelik_id AND isletme_id = v_isletme;
    UPDATE public.ders_seansi SET uyelik_id = NULL, hak_dusuldu = false WHERE id = p_id;
    v_yontem := 'geri_verildi';
    v_islendi := false;
  END IF;

  BEGIN
    UPDATE public.ders_seansi
       SET durum = p_durum,
           gecikme_dakika = CASE WHEN p_durum = 'gecikmeli_geldi' THEN p_gecikme_dk ELSE NULL END
     WHERE id = p_id;
  EXCEPTION WHEN exclusion_violation THEN
    -- İptal/gelmedi'den geri alınırken o saat başkasına verilmiş olabilir.
    GET STACKED DIAGNOSTICS v_kisit = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', public.ders_cakisma_hatasi(v_kisit);
  END;

  IF p_durum IN ('geldi', 'gecikmeli_geldi', 'derste', 'tamamlandi') THEN
    IF v_islendi THEN
      v_yontem := 'zaten_islendi';
    ELSE
      -- FIFO: bitişi en yakın ders paketi önce (bitişsiz sona).
      FOR u IN
        SELECT * FROM public.uyelik
         WHERE isletme_id = v_isletme AND musteri_id = d.musteri_id AND durum = 'aktif' AND kapsam = 'ders' AND tur = 'seans'
         ORDER BY bitis_tarihi ASC NULLS LAST, baslangic_tarihi ASC
           FOR UPDATE
      LOOP
        IF public.uyelik_gecerli_durum(u) = 'aktif' THEN
          v_secilen := u;
          EXIT;
        END IF;
      END LOOP;

      IF v_secilen.id IS NOT NULL THEN
        v_kalan := v_secilen.kalan_hak - 1;
        UPDATE public.uyelik SET kalan_hak = v_kalan WHERE id = v_secilen.id;
        UPDATE public.ders_seansi SET uyelik_id = v_secilen.id, hak_dusuldu = true WHERE id = p_id;
        v_yontem := 'hak';
      ELSIF d.ucret_kurus > 0 THEN
        INSERT INTO public.musteri_bakiye_hareket (isletme_id, musteri_id, tur, tutar_kurus, aciklama, idempotency_anahtari)
        VALUES (v_isletme, d.musteri_id, 'borc', d.ucret_kurus,
                'PT dersi: ' || to_char(d.baslangic AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'), p_id)
        RETURNING id INTO v_hareket;
        UPDATE public.ders_seansi SET borc_hareket_id = v_hareket WHERE id = p_id;
        v_yontem := 'borc';
      ELSE
        v_yontem := 'yok';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('durum', p_durum, 'yontem', v_yontem, 'kalan_hak', v_kalan,
                            'tutar_kurus', CASE WHEN v_yontem = 'borc' THEN d.ucret_kurus ELSE NULL END);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ders_seansi_durum(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ders_seansi_durum(uuid, text, integer) TO authenticated;

-- 6) check_in: yalnız 'giris' kapsamlı üyelikleri değerlendirir (ders paketi salon girişi açmaz, hakkı düşmez) ------
CREATE OR REPLACE FUNCTION public.check_in(p_musteri_id uuid, p_kaynak text DEFAULT 'resepsiyon')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon']);
  v_bugun date := public.bugun_istanbul();
  v_musteri public.musteri%ROWTYPE;
  u public.uyelik%ROWTYPE;
  v_secilen public.uyelik%ROWTYPE;
  v_mevcut public.giris_kaydi%ROWTYPE;
  v_durum text;
  v_red text;
  v_red_onceligi integer := 0;
  v_aday_onceligi integer;
  v_aday_red text;
  v_giris uuid;
  v_hak_dusuldu boolean := false;
  v_kalan integer;
BEGIN
  -- Aynı müşteri için check-in'leri sıraya sok (çift tıklama/eşzamanlı istek).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_musteri_id::text, 0));

  SELECT * INTO v_musteri FROM public.musteri WHERE id = p_musteri_id AND isletme_id = v_isletme;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'musteri_bulunamadi';
  END IF;

  IF NOT v_musteri.aktif THEN
    INSERT INTO public.giris_kaydi (isletme_id, musteri_id, kaynak, sonuc, red_nedeni)
    VALUES (v_isletme, p_musteri_id, p_kaynak, 'red', 'musteri_pasif') RETURNING id INTO v_giris;
    RETURN jsonb_build_object('sonuc', 'red', 'red_nedeni', 'musteri_pasif', 'giris_id', v_giris);
  END IF;

  -- Bugün zaten geçerli girişi varsa aynısını döndür (ikinci hak düşmez).
  SELECT * INTO v_mevcut FROM public.giris_kaydi
   WHERE isletme_id = v_isletme AND musteri_id = p_musteri_id AND giris_tarihi = v_bugun AND sonuc = 'kabul' AND NOT iptal;
  IF FOUND THEN
    SELECT kalan_hak INTO v_kalan FROM public.uyelik WHERE id = v_mevcut.uyelik_id;
    RETURN jsonb_build_object('sonuc', 'kabul', 'uyelik_id', v_mevcut.uyelik_id, 'kalan_hak', v_kalan,
                              'zaten_giris', true, 'giris_id', v_mevcut.id, 'uyari', false);
  END IF;

  -- FIFO: bitişi en yakın olan üyelik önce; bitişsiz (süresiz seans) sona.
  FOR u IN
    SELECT * FROM public.uyelik
     WHERE isletme_id = v_isletme AND musteri_id = p_musteri_id AND durum = 'aktif' AND kapsam = 'giris'
     ORDER BY bitis_tarihi ASC NULLS LAST, baslangic_tarihi ASC
       FOR UPDATE
  LOOP
    v_durum := public.uyelik_gecerli_durum(u);
    IF v_durum = 'aktif' THEN
      v_secilen := u;
      EXIT;
    END IF;
    -- Uygun üyelik yoksa en anlamlı red nedeni: dondurulmus > baslamadi > hak_bitti > suresi_doldu
    v_aday_red := CASE
      WHEN v_durum = 'dondurulmus' THEN 'donduruldu'
      WHEN v_durum = 'beklemede' THEN 'baslamadi'
      WHEN u.kalan_hak IS NOT NULL AND u.kalan_hak <= 0 THEN 'hak_bitti'
      ELSE 'suresi_doldu'
    END;
    v_aday_onceligi := CASE v_aday_red WHEN 'donduruldu' THEN 4 WHEN 'baslamadi' THEN 3 WHEN 'hak_bitti' THEN 2 ELSE 1 END;
    IF v_aday_onceligi > v_red_onceligi THEN
      v_red := v_aday_red;
      v_red_onceligi := v_aday_onceligi;
    END IF;
  END LOOP;

  IF v_secilen.id IS NULL THEN
    INSERT INTO public.giris_kaydi (isletme_id, musteri_id, kaynak, sonuc, red_nedeni)
    VALUES (v_isletme, p_musteri_id, p_kaynak, 'red', coalesce(v_red, 'uyelik_yok')) RETURNING id INTO v_giris;
    RETURN jsonb_build_object('sonuc', 'red', 'red_nedeni', coalesce(v_red, 'uyelik_yok'), 'giris_id', v_giris);
  END IF;

  v_kalan := v_secilen.kalan_hak;
  IF v_secilen.tur = 'seans' THEN
    v_kalan := v_secilen.kalan_hak - 1;
    UPDATE public.uyelik SET kalan_hak = v_kalan WHERE id = v_secilen.id;
    v_hak_dusuldu := true;
  END IF;

  INSERT INTO public.giris_kaydi (isletme_id, musteri_id, uyelik_id, kaynak, sonuc, hak_dusuldu)
  VALUES (v_isletme, p_musteri_id, v_secilen.id, p_kaynak, 'kabul', v_hak_dusuldu) RETURNING id INTO v_giris;

  RETURN jsonb_build_object(
    'sonuc', 'kabul',
    'uyelik_id', v_secilen.id,
    'kalan_hak', v_kalan,
    'zaten_giris', false,
    'giris_id', v_giris,
    -- Paket bitiyor uyarısı: kalan hak <= 2 veya bitişe <= 7 gün
    'uyari', (v_kalan IS NOT NULL AND v_kalan <= 2)
             OR (v_secilen.bitis_tarihi IS NOT NULL AND v_secilen.bitis_tarihi - v_bugun <= 7)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_in(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in(uuid, text) TO authenticated;

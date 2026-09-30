-- Check-in: giriş kaydı, üyelik seçimi (FIFO), seans hakkı düşümü, iptal.
-- (UYGULANMADI — önce 20260930130000 uygulanmış olmalı.)
--
-- Kurallar:
--  * Check-in BAKİYEYE borç YAZMAZ (satış sırasında borçlanılmıştır).
--  * Seans bazlı üyelikte günde BİR hak düşer (aynı gün ikinci check-in aynı kaydı döndürür).
--  * Uygun üyelik seçimi FIFO: bitişi en yakın olan önce (bitişsiz sona), sonra başlangıç.
--  * Giriş kayıtları yalnız SECURITY DEFINER fonksiyonlarla yazılır; kullanıcılar okur.
--  * Reddedilen girişler de kaydedilir (neden ile) — turnike/QR için denetim izi.

CREATE TABLE IF NOT EXISTS public.giris_kaydi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL,
  musteri_id uuid NOT NULL,
  uyelik_id uuid,
  kaynak text NOT NULL DEFAULT 'resepsiyon' CHECK (kaynak IN ('resepsiyon', 'qr', 'turnike')),
  sonuc text NOT NULL CHECK (sonuc IN ('kabul', 'red')),
  red_nedeni text CHECK (red_nedeni IN ('uyelik_yok', 'donduruldu', 'baslamadi', 'hak_bitti', 'suresi_doldu', 'musteri_pasif')),
  hak_dusuldu boolean NOT NULL DEFAULT false,
  giris_tarihi date NOT NULL DEFAULT public.bugun_istanbul(),
  zaman timestamptz NOT NULL DEFAULT now(),
  iptal boolean NOT NULL DEFAULT false,
  iptal_zamani timestamptz,
  kaydeden_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  FOREIGN KEY (musteri_id, isletme_id) REFERENCES public.musteri (id, isletme_id) ON DELETE RESTRICT,
  FOREIGN KEY (uyelik_id, isletme_id) REFERENCES public.uyelik (id, isletme_id) ON DELETE RESTRICT,
  CONSTRAINT giris_red_kurali CHECK ((sonuc = 'red') = (red_nedeni IS NOT NULL)),
  CONSTRAINT giris_kabul_uyelik CHECK (sonuc = 'red' OR uyelik_id IS NOT NULL)
);

-- Aynı müşteri aynı (İstanbul) günde yalnız BİR geçerli kabul alır (eşzamanlı çift basmaya karşı son savunma).
CREATE UNIQUE INDEX IF NOT EXISTS uq_giris_gunluk_kabul
  ON public.giris_kaydi (isletme_id, musteri_id, giris_tarihi)
  WHERE sonuc = 'kabul' AND NOT iptal;

CREATE INDEX IF NOT EXISTS idx_giris_isletme_tarih ON public.giris_kaydi (isletme_id, giris_tarihi DESC, zaman DESC);
CREATE INDEX IF NOT EXISTS idx_giris_musteri ON public.giris_kaydi (musteri_id, zaman DESC);

DROP TRIGGER IF EXISTS trg_audit_giris ON public.giris_kaydi;
CREATE TRIGGER trg_audit_giris
  AFTER INSERT OR UPDATE ON public.giris_kaydi
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.giris_kaydi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.giris_kaydi FROM anon, authenticated;
GRANT SELECT ON public.giris_kaydi TO authenticated;

DROP POLICY IF EXISTS "giris_select" ON public.giris_kaydi;
CREATE POLICY "giris_select" ON public.giris_kaydi FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'))
    OR (SELECT public.is_super_admin())
  );

-- Check-in ---------------------------------------------------------------------------------------------------
-- Dönüş: {"sonuc":"kabul"|"red","uyelik_id":..,"kalan_hak":..,"red_nedeni":..,"zaten_giris":bool,"uyari":bool,"giris_id":..}
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
     WHERE isletme_id = v_isletme AND musteri_id = p_musteri_id AND durum = 'aktif'
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

-- Hatalı check-in'i iptal et: seans hakkı geri verilir, müşteri aynı gün yeniden giriş yapabilir. ------------------------
CREATE OR REPLACE FUNCTION public.check_in_iptal(p_giris_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon']);
  g public.giris_kaydi%ROWTYPE;
BEGIN
  SELECT * INTO g FROM public.giris_kaydi WHERE id = p_giris_id AND isletme_id = v_isletme FOR UPDATE;
  IF NOT FOUND OR g.sonuc <> 'kabul' OR g.iptal THEN
    RAISE EXCEPTION 'giris_bulunamadi';
  END IF;
  -- Yalnız aynı gün içinde (İstanbul) iptal edilebilir.
  IF g.giris_tarihi <> public.bugun_istanbul() THEN
    RAISE EXCEPTION 'giris_iptal_suresi_doldu';
  END IF;

  UPDATE public.giris_kaydi SET iptal = true, iptal_zamani = now() WHERE id = g.id;
  IF g.hak_dusuldu THEN
    UPDATE public.uyelik SET kalan_hak = kalan_hak + 1 WHERE id = g.uyelik_id AND isletme_id = v_isletme AND kalan_hak < toplam_hak;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_in_iptal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in_iptal(uuid) TO authenticated;

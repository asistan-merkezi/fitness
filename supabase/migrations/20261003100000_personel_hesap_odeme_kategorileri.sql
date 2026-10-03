-- Personel hesap defteri: klinikteki "Ödeme Ekle" kategorileri (Maaş, Diğer Ödeme, Avans, Prim, Yol, Yemek, Fazla Mesai, Kesinti)
-- ve işlem tarihi. Idempotent tek blok.
--  * Yeni türler: prim_manuel (elle girilen prim; dönem kapanışının 'prim' satırından AYRI), yol, yemek, mesai (+ bakiyeyi artırır),
--    kesinti (− bakiyeyi azaltır, kasa/bankadan para ÇIKMAZ). Yalnız odeme/avans kasa-banka-kart defterine düşer.
--  * Defter değişmezliği, hakediş formülü ve dönem kapatma DEĞİŞMEDİ (hakedis/prim satırları yalnız dönem kapanışından gelir).

ALTER TABLE public.personel_hesap_hareket DROP CONSTRAINT IF EXISTS personel_hesap_hareket_tur_check;
ALTER TABLE public.personel_hesap_hareket ADD CONSTRAINT personel_hesap_hareket_tur_check
  CHECK (tur IN ('hakedis', 'prim', 'odeme', 'avans', 'prim_manuel', 'yol', 'yemek', 'mesai', 'kesinti'));

-- Bakiye: pozitif = işletme personele borçlu. Kesinti ödenen/düşülen tarafta sayılır.
CREATE OR REPLACE VIEW public.personel_bakiye WITH (security_invoker = true) AS
SELECT h.kullanici_id,
       h.isletme_id,
       coalesce(sum(h.tutar_kurus) FILTER (WHERE h.tur IN ('hakedis', 'prim', 'prim_manuel', 'yol', 'yemek', 'mesai')), 0)::bigint AS hak_edilen_kurus,
       coalesce(sum(h.tutar_kurus) FILTER (WHERE h.tur IN ('odeme', 'avans', 'kesinti')), 0)::bigint AS odenen_kurus,
       (coalesce(sum(h.tutar_kurus) FILTER (WHERE h.tur IN ('hakedis', 'prim', 'prim_manuel', 'yol', 'yemek', 'mesai')), 0)
        - coalesce(sum(h.tutar_kurus) FILTER (WHERE h.tur IN ('odeme', 'avans', 'kesinti')), 0))::bigint AS bakiye_kurus
  FROM public.personel_hesap_hareket h
 GROUP BY h.kullanici_id, h.isletme_id;
REVOKE ALL ON public.personel_bakiye FROM anon, authenticated;
GRANT SELECT ON public.personel_bakiye TO authenticated;

-- Ödeme / avans / ek hakediş kalemleri / kesinti. Yalnız odeme ve avans için yöntem (nakit|havale) zorunludur; diğerlerinde yöntem yoktur.
DROP FUNCTION IF EXISTS public.personel_hesap_hareket_ekle(uuid, text, bigint, text, text, uuid, uuid);
CREATE OR REPLACE FUNCTION public.personel_hesap_hareket_ekle(
  p_kullanici_id uuid,
  p_tur text,
  p_tutar_kurus bigint,
  p_yontem text DEFAULT NULL,
  p_aciklama text DEFAULT NULL,
  p_anahtar uuid DEFAULT NULL,
  p_banka_hesap_id uuid DEFAULT NULL,
  p_tarih date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'muhasebe']);
  v_id uuid;
  v_tarih date := coalesce(p_tarih, public.bugun_istanbul());
  v_para_cikar boolean := p_tur IN ('odeme', 'avans');
BEGIN
  IF p_anahtar IS NOT NULL THEN
    SELECT id INTO v_id FROM public.personel_hesap_hareket WHERE isletme_id = v_isletme AND idempotency_anahtari = p_anahtar;
    IF FOUND THEN
      RETURN v_id;
    END IF;
  END IF;

  IF p_tur IS NULL OR p_tur NOT IN ('odeme', 'avans', 'prim_manuel', 'yol', 'yemek', 'mesai', 'kesinti') THEN
    RAISE EXCEPTION 'hareket_turu_gecersiz';
  END IF;
  IF v_para_cikar AND (p_yontem IS NULL OR p_yontem NOT IN ('nakit', 'havale')) THEN
    RAISE EXCEPTION 'odeme_yontemi_gerekli';
  END IF;
  IF p_tutar_kurus IS NULL OR p_tutar_kurus <= 0 THEN
    RAISE EXCEPTION 'tutar_gecersiz';
  END IF;
  IF v_tarih > public.bugun_istanbul() THEN
    RAISE EXCEPTION 'tarih_gelecek';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kullanici WHERE id = p_kullanici_id AND isletme_id = v_isletme) THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;
  IF p_banka_hesap_id IS NOT NULL AND (NOT v_para_cikar OR p_yontem <> 'havale' OR NOT public.banka_hesabi_gecerli(p_banka_hesap_id)) THEN
    RAISE EXCEPTION 'banka_hesabi_bulunamadi';
  END IF;

  INSERT INTO public.personel_hesap_hareket (isletme_id, kullanici_id, tur, tutar_kurus, odeme_yontemi, aciklama, idempotency_anahtari, banka_hesap_id, islem_tarihi)
  VALUES (v_isletme, p_kullanici_id, p_tur, p_tutar_kurus, CASE WHEN v_para_cikar THEN p_yontem END, nullif(btrim(p_aciklama), ''), p_anahtar, p_banka_hesap_id, v_tarih)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_hesap_hareket_ekle(uuid, text, bigint, text, text, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personel_hesap_hareket_ekle(uuid, text, bigint, text, text, uuid, uuid, date) TO authenticated;

-- Finans özeti: personel tahakkuku = hakediş + prim + yol/yemek/mesai/elle prim − kesinti (kesinti gider azaltır, nakit hareketi değildir).
CREATE OR REPLACE FUNCTION public.finans_ozet(p_baslangic date, p_bitis date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'muhasebe']);
  v_tahsilat bigint;
  v_iade bigint;
  v_satis bigint;
  v_iskonto bigint;
  v_gider bigint;
  v_personel bigint;
  v_hakedis bigint;
  v_alacak bigint;
BEGIN
  IF p_baslangic IS NULL OR p_bitis IS NULL OR p_bitis <= p_baslangic THEN
    RAISE EXCEPTION 'tarih_araligi_gecersiz';
  END IF;

  SELECT coalesce(sum(tutar_kurus) FILTER (WHERE tur = 'odeme'), 0),
         coalesce(sum(tutar_kurus) FILTER (WHERE tur = 'iade'), 0),
         coalesce(sum(tutar_kurus) FILTER (WHERE tur = 'borc'), 0),
         coalesce(sum(iskonto_kurus) FILTER (WHERE tur = 'borc'), 0)
    INTO v_tahsilat, v_iade, v_satis, v_iskonto
    FROM public.musteri_bakiye_hareket
   WHERE isletme_id = v_isletme AND islem_tarihi >= p_baslangic AND islem_tarihi < p_bitis;

  SELECT coalesce(sum(tutar_kurus), 0) INTO v_gider
    FROM public.gider WHERE isletme_id = v_isletme AND durum = 'odendi' AND odeme_tarihi >= p_baslangic AND odeme_tarihi < p_bitis;

  SELECT coalesce(sum(tutar_kurus) FILTER (WHERE tur IN ('odeme', 'avans')), 0),
         coalesce(sum(tutar_kurus) FILTER (WHERE tur IN ('hakedis', 'prim', 'prim_manuel', 'yol', 'yemek', 'mesai')), 0) - coalesce(sum(tutar_kurus) FILTER (WHERE tur = 'kesinti'), 0)
    INTO v_personel, v_hakedis
    FROM public.personel_hesap_hareket WHERE isletme_id = v_isletme AND islem_tarihi >= p_baslangic AND islem_tarihi < p_bitis;

  SELECT coalesce(sum(borc_kurus), 0) INTO v_alacak FROM public.cari_alacak WHERE isletme_id = v_isletme;

  RETURN jsonb_build_object(
    'tahsilat_kurus', v_tahsilat,
    'iade_kurus', v_iade,
    'net_tahsilat_kurus', v_tahsilat - v_iade,
    'satis_kurus', v_satis,
    'iskonto_kurus', v_iskonto,
    'gider_kurus', v_gider,
    'personel_odeme_kurus', v_personel,
    'personel_hakedis_kurus', v_hakedis,
    'acik_alacak_kurus', v_alacak,
    -- Nakit esaslı sonuç: net tahsilat - gider - personel ödemesi (hakediş tahakkuku ayrıca gösterilir).
    'nakit_sonuc_kurus', v_tahsilat - v_iade - v_gider - v_personel
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finans_ozet(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finans_ozet(date, date) TO authenticated;

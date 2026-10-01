-- Kasa / Banka / Kredi Kartı ayrımı (klinik düzeni):
--  * Kredi kartı tahsilat/iade/gideri artık 'banka' hesabına değil, ayrı 'kart' hesabına yazılır (klinikteki gibi üçüncü ödeme rayı).
--    Banka bakiyesi yalnız havale/EFT hareketlerini taşır; kart ekranı salt okunur mutabakattır. hesap_ozet 'kart' satırını da döndürür.
--  * kasa_banka_hareket: manuel "giren" kayıtta gönderen banka ve IBAN bilgisi tutulur (isteğe bağlı).
--  * kasa_banka_hareket_ekle yeni parametrelerle yeniden tanımlanır; ESKİ imza ÖNCE silinir (aksi halde ikinci overload, PGRST203).
-- İdempotent tek blok. Önce 20260930220000 uygulanmış olmalı.

-- 1) Hesap hareketleri: kart ayrı hesap ----------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.hesap_hareket_gorunum WITH (security_invoker = true) AS
  SELECT h.isletme_id, h.islem_tarihi AS tarih,
         CASE h.odeme_yontemi WHEN 'nakit' THEN 'kasa' WHEN 'kredi_karti' THEN 'kart' ELSE 'banka' END AS hesap,
         h.banka_hesap_id,
         h.odeme_yontemi AS yontem,
         (CASE WHEN h.tur = 'odeme' THEN h.tutar_kurus ELSE -h.tutar_kurus END)::bigint AS tutar_kurus,
         'musteri'::text AS kaynak,
         h.id AS kaynak_id,
         h.aciklama AS aciklama
    FROM public.musteri_bakiye_hareket h
   WHERE h.tur IN ('odeme', 'iade')
  UNION ALL
  SELECT g.isletme_id, g.odeme_tarihi,
         CASE g.odeme_yontemi WHEN 'nakit' THEN 'kasa' WHEN 'kredi_karti' THEN 'kart' ELSE 'banka' END,
         g.banka_hesap_id, g.odeme_yontemi, (-g.tutar_kurus)::bigint, 'gider'::text, g.id, coalesce(g.tedarikci_adi, g.kategori)
    FROM public.gider g
   WHERE g.durum = 'odendi'
  UNION ALL
  SELECT p.isletme_id, p.islem_tarihi,
         CASE p.odeme_yontemi WHEN 'nakit' THEN 'kasa' WHEN 'kredi_karti' THEN 'kart' ELSE 'banka' END,
         p.banka_hesap_id, p.odeme_yontemi, (-p.tutar_kurus)::bigint, 'personel'::text, p.id, p.aciklama
    FROM public.personel_hesap_hareket p
   WHERE p.tur IN ('odeme', 'avans')
  UNION ALL
  SELECT m.isletme_id, m.tarih, CASE WHEN m.kasa THEN 'kasa' ELSE 'banka' END, m.banka_hesap_id,
         CASE WHEN m.kasa THEN 'nakit' ELSE 'havale' END,
         (CASE WHEN m.tip = 'giren' THEN m.tutar_kurus ELSE -m.tutar_kurus END)::bigint, 'manuel'::text, m.id, coalesce(m.aciklama, m.karsi_taraf)
    FROM public.kasa_banka_hareket m
   WHERE m.tip IN ('giren', 'cikan', 'transfer')
  UNION ALL
  -- Transferin hedef bacağı (+).
  SELECT m.isletme_id, m.tarih, CASE WHEN m.hedef_kasa THEN 'kasa' ELSE 'banka' END, m.hedef_banka_hesap_id,
         CASE WHEN m.hedef_kasa THEN 'nakit' ELSE 'havale' END,
         m.tutar_kurus::bigint, 'manuel'::text, m.id, coalesce(m.aciklama, m.karsi_taraf)
    FROM public.kasa_banka_hareket m
   WHERE m.tip = 'transfer';
REVOKE ALL ON public.hesap_hareket_gorunum FROM anon, authenticated;
GRANT SELECT ON public.hesap_hareket_gorunum TO authenticated;

-- 2) Hesap özeti: kasa, banka hesapları, (hesabı seçilmemiş banka), kredi kartı ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.hesap_ozet(p_baslangic date, p_bitis date)
RETURNS TABLE (hesap text, banka_hesap_id uuid, ad text, acilis_kurus bigint, giren_kurus bigint, cikan_kurus bigint, kapanis_kurus bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.current_isletme_id();
BEGIN
  IF v_isletme IS NULL THEN
    RAISE EXCEPTION 'isletme_yok';
  END IF;
  IF p_baslangic IS NULL OR p_bitis IS NULL OR p_bitis <= p_baslangic THEN
    RAISE EXCEPTION 'tarih_araligi_gecersiz';
  END IF;

  RETURN QUERY
  WITH hesaplar AS (
    SELECT 'kasa'::text AS h, NULL::uuid AS b, 'Kasa'::text AS a, coalesce((SELECT i.kasa_acilis_kurus FROM public.isletme i WHERE i.id = v_isletme), 0)::bigint AS acilis, 0 AS sira
    UNION ALL
    SELECT 'banka', bh.id, bh.banka_adi || CASE WHEN bh.sube IS NOT NULL THEN ' · ' || bh.sube ELSE '' END, bh.acilis_bakiye_kurus, 1
      FROM public.isletme_banka_hesabi bh WHERE bh.isletme_id = v_isletme
    UNION ALL
    SELECT 'banka', NULL, 'Hesap atanmamış (banka)', 0::bigint, 2
    UNION ALL
    SELECT 'kart', NULL, 'Kredi Kartı', 0::bigint, 3
  ),
  hareket AS (
    -- Kart hareketleri tek hesap sayılır (hangi bankaya yattığına bakılmaz); banka hareketlerinde hesap id'si korunur.
    SELECT g.hesap, CASE WHEN g.hesap = 'kart' THEN NULL ELSE g.banka_hesap_id END AS bid, g.tarih, g.tutar_kurus
      FROM public.hesap_hareket_gorunum g
     WHERE g.isletme_id = v_isletme AND g.tarih < p_bitis
  ),
  toplam AS (
    SELECT hs.h, hs.b, hs.a, hs.acilis, hs.sira,
           coalesce(sum(hr.tutar_kurus) FILTER (WHERE hr.tarih < p_baslangic), 0)::bigint AS onceki,
           coalesce(sum(hr.tutar_kurus) FILTER (WHERE hr.tarih >= p_baslangic AND hr.tutar_kurus > 0), 0)::bigint AS gir,
           coalesce(-sum(hr.tutar_kurus) FILTER (WHERE hr.tarih >= p_baslangic AND hr.tutar_kurus < 0), 0)::bigint AS cik
      FROM hesaplar hs
      LEFT JOIN hareket hr ON hr.hesap = hs.h AND hr.bid IS NOT DISTINCT FROM hs.b
     GROUP BY hs.h, hs.b, hs.a, hs.acilis, hs.sira
  )
  SELECT t.h, t.b, t.a, (t.acilis + t.onceki)::bigint, t.gir, t.cik, (t.acilis + t.onceki + t.gir - t.cik)::bigint
    FROM toplam t
   WHERE t.sira IN (0, 1, 3) OR t.onceki <> 0 OR t.gir <> 0 OR t.cik <> 0
   ORDER BY t.sira, t.a;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.hesap_ozet(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hesap_ozet(date, date) TO authenticated;

-- 3) Manuel giren kayıtta gönderen banka / IBAN ---------------------------------------------------------------------------------------
ALTER TABLE public.kasa_banka_hareket ADD COLUMN IF NOT EXISTS karsi_taraf_banka text;
ALTER TABLE public.kasa_banka_hareket ADD COLUMN IF NOT EXISTS karsi_taraf_iban text;
ALTER TABLE public.kasa_banka_hareket DROP CONSTRAINT IF EXISTS kbh_karsi_iban_kurali;
ALTER TABLE public.kasa_banka_hareket ADD CONSTRAINT kbh_karsi_iban_kurali CHECK (karsi_taraf_iban IS NULL OR public.iban_gecerli(karsi_taraf_iban));

DROP FUNCTION IF EXISTS public.kasa_banka_hareket_ekle(text, bigint, boolean, uuid, boolean, uuid, text, text, date, uuid);

CREATE OR REPLACE FUNCTION public.kasa_banka_hareket_ekle(
  p_tip text,
  p_tutar_kurus bigint,
  p_kasa boolean DEFAULT false,
  p_banka_hesap_id uuid DEFAULT NULL,
  p_hedef_kasa boolean DEFAULT false,
  p_hedef_banka_hesap_id uuid DEFAULT NULL,
  p_karsi_taraf text DEFAULT NULL,
  p_aciklama text DEFAULT NULL,
  p_tarih date DEFAULT NULL,
  p_anahtar uuid DEFAULT NULL,
  p_karsi_banka text DEFAULT NULL,
  p_karsi_iban text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  v_tarih date := coalesce(p_tarih, public.bugun_istanbul());
  v_iban text := nullif(upper(regexp_replace(coalesce(p_karsi_iban, ''), '\s', '', 'g')), '');
  v_id uuid;
BEGIN
  IF p_anahtar IS NOT NULL THEN
    SELECT id INTO v_id FROM public.kasa_banka_hareket WHERE isletme_id = v_isletme AND idempotency_anahtari = p_anahtar;
    IF FOUND THEN
      RETURN v_id;
    END IF;
  END IF;

  IF p_tutar_kurus IS NULL OR p_tutar_kurus <= 0 THEN
    RAISE EXCEPTION 'tutar_gecersiz';
  END IF;
  IF v_tarih > public.bugun_istanbul() THEN
    RAISE EXCEPTION 'gelecek_tarih';
  END IF;
  IF p_banka_hesap_id IS NOT NULL AND NOT public.banka_hesabi_gecerli(p_banka_hesap_id) THEN
    RAISE EXCEPTION 'banka_hesabi_bulunamadi';
  END IF;
  IF p_hedef_banka_hesap_id IS NOT NULL AND NOT public.banka_hesabi_gecerli(p_hedef_banka_hesap_id) THEN
    RAISE EXCEPTION 'banka_hesabi_bulunamadi';
  END IF;
  IF v_iban IS NOT NULL AND NOT public.iban_gecerli(v_iban) THEN
    RAISE EXCEPTION 'iban_gecersiz';
  END IF;

  INSERT INTO public.kasa_banka_hareket (isletme_id, tip, kasa, banka_hesap_id, hedef_kasa, hedef_banka_hesap_id, karsi_taraf, karsi_taraf_banka, karsi_taraf_iban, aciklama, tutar_kurus, tarih, idempotency_anahtari)
  VALUES (v_isletme, p_tip, coalesce(p_kasa, false), p_banka_hesap_id, coalesce(p_hedef_kasa, false), p_hedef_banka_hesap_id, nullif(btrim(p_karsi_taraf), ''), nullif(btrim(p_karsi_banka), ''), v_iban,
          nullif(btrim(p_aciklama), ''), p_tutar_kurus, v_tarih, p_anahtar)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.kasa_banka_hareket_ekle(text, bigint, boolean, uuid, boolean, uuid, text, text, date, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kasa_banka_hareket_ekle(text, bigint, boolean, uuid, boolean, uuid, text, text, date, uuid, text, text) TO authenticated;

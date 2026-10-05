-- Kasa Kontrol + Kasa/Banka hareket detayı (Villavilla düzeninden uyarlandı):
--  * Kasa başlangıç tutarı artık "ne zaman, kim girdi" bilgisini taşır (isletme.kasa_baslangic_zamani / _giren_id). Zaman varsa tutar
--    girildiği İstanbul gününde "Kasa Başlangıç" HAREKETİ sayılır (dönem açılışı değil); zamansız eski değer her dönemin açılışı kalır.
--  * kasa_dengeleme: değişmez (insert-only) işaretli düzeltme kaydı (+ kasaya ekler, − kasadan düşer). Hesap hareketlerine
--    "kasa_dengeleme" olarak girer.
--  * hesap_hareket_gorunum (SUM yolu, birleştirme YOK) iki yeni kaynakla genişler; hesap_ozet kasa açılışını zamana göre seçer.
--  * hesap_hareket_detay: liste için aynı satırlar + tür / karşı taraf / ayrıntı (müşteri adı, tedarikçi, personel, transfer karşı hesabı).
--    Ad çözümleme yalnız listede (dönem satırları) çalışır; bakiye toplamları yalın görünümden gelir.
--  * Dönem sorguları için indeksler.
-- İdempotent tek blok. Önce 20261001140000 uygulanmış olmalı.

-- 1) Kasa başlangıç bilgisi -------------------------------------------------------------------------------------------------------
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS kasa_baslangic_zamani timestamptz;
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS kasa_baslangic_giren_id uuid REFERENCES public.kullanici(id) ON DELETE SET NULL;

-- 2) Kasa dengeleme defteri -------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kasa_dengeleme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  tutar_kurus bigint NOT NULL CHECK (tutar_kurus <> 0),
  aciklama text CHECK (aciklama IS NULL OR char_length(aciklama) <= 300),
  tarih date NOT NULL DEFAULT public.bugun_istanbul(),
  idempotency_anahtari uuid,
  olusturan_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (isletme_id, idempotency_anahtari)
);
CREATE INDEX IF NOT EXISTS idx_kasa_dengeleme_tarih ON public.kasa_dengeleme (isletme_id, tarih);

DROP TRIGGER IF EXISTS trg_kasa_dengeleme_degismez ON public.kasa_dengeleme;
CREATE TRIGGER trg_kasa_dengeleme_degismez BEFORE UPDATE OR DELETE ON public.kasa_dengeleme FOR EACH ROW EXECUTE FUNCTION public.kbh_degismez();
DROP TRIGGER IF EXISTS trg_audit_kasa_dengeleme ON public.kasa_dengeleme;
CREATE TRIGGER trg_audit_kasa_dengeleme AFTER INSERT ON public.kasa_dengeleme FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.kasa_dengeleme ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kasa_dengeleme FROM anon, authenticated;
GRANT SELECT ON public.kasa_dengeleme TO authenticated;
DROP POLICY IF EXISTS "kasa_dengeleme_select" ON public.kasa_dengeleme;
CREATE POLICY "kasa_dengeleme_select" ON public.kasa_dengeleme FOR SELECT TO authenticated
  USING ((isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'muhasebe')) OR (SELECT public.is_super_admin()));

-- 3) Yazma RPC'leri (yalnız işletme yöneticisi) ------------------------------------------------------------------------------------
-- Başlangıç tutarı: her kayıtta zaman + giren kişi yeniden damgalanır (hareket girildiği günde sayılır).
CREATE OR REPLACE FUNCTION public.kasa_baslangic_kaydet(p_tutar_kurus bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
BEGIN
  IF p_tutar_kurus IS NULL THEN
    RAISE EXCEPTION 'tutar_gecersiz';
  END IF;
  UPDATE public.isletme
     SET kasa_acilis_kurus = p_tutar_kurus, kasa_baslangic_zamani = now(), kasa_baslangic_giren_id = auth.uid()
   WHERE id = v_isletme;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.kasa_baslangic_kaydet(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kasa_baslangic_kaydet(bigint) TO authenticated;

-- Dengeleme: işaretli tutar (+ kasaya ekler, − kasadan düşer), sıfır olamaz; aynı anahtar çift kayıt açmaz.
CREATE OR REPLACE FUNCTION public.kasa_dengele(p_tutar_kurus bigint, p_aciklama text DEFAULT NULL, p_anahtar uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  v_id uuid;
BEGIN
  IF p_anahtar IS NOT NULL THEN
    SELECT id INTO v_id FROM public.kasa_dengeleme WHERE isletme_id = v_isletme AND idempotency_anahtari = p_anahtar;
    IF FOUND THEN
      RETURN v_id;
    END IF;
  END IF;
  IF p_tutar_kurus IS NULL OR p_tutar_kurus = 0 THEN
    RAISE EXCEPTION 'tutar_gecersiz';
  END IF;
  INSERT INTO public.kasa_dengeleme (isletme_id, tutar_kurus, aciklama, idempotency_anahtari)
  VALUES (v_isletme, p_tutar_kurus, nullif(btrim(p_aciklama), ''), p_anahtar)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.kasa_dengele(bigint, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kasa_dengele(bigint, text, uuid) TO authenticated;

-- 4) Yalın hareket görünümü: + Kasa Başlangıç + Kasa Dengeleme (sütunlar değişmez) ---------------------------------------------------
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
   WHERE m.tip = 'transfer'
  UNION ALL
  -- Kasa başlangıç tutarı: girildiği İstanbul gününde hareket (zamansız eski değer hesap_ozet'te açılıştır). Yalnız yönetici/muhasebe görür.
  SELECT i.id, (i.kasa_baslangic_zamani AT TIME ZONE 'Europe/Istanbul')::date, 'kasa'::text, NULL::uuid, 'nakit'::text,
         i.kasa_acilis_kurus::bigint, 'kasa_baslangic'::text, i.id, 'Kasa Başlangıç'::text
    FROM public.isletme i
   WHERE i.kasa_baslangic_zamani IS NOT NULL AND i.kasa_acilis_kurus <> 0
     AND (SELECT public.current_rol()) IN ('isletme_admin', 'muhasebe')
  UNION ALL
  SELECT d.isletme_id, d.tarih, 'kasa'::text, NULL::uuid, 'nakit'::text, d.tutar_kurus, 'kasa_dengeleme'::text, d.id, coalesce(d.aciklama, 'Kasa Dengeleme')
    FROM public.kasa_dengeleme d;
REVOKE ALL ON public.hesap_hareket_gorunum FROM anon, authenticated;
GRANT SELECT ON public.hesap_hareket_gorunum TO authenticated;

-- 5) Hesap özeti: kasa açılışı, başlangıç zamanı varsa 0 (başlangıç artık hareket) ---------------------------------------------------
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
    SELECT 'kasa'::text AS h, NULL::uuid AS b, 'Kasa'::text AS a,
           coalesce((SELECT CASE WHEN i.kasa_baslangic_zamani IS NULL THEN i.kasa_acilis_kurus ELSE 0 END FROM public.isletme i WHERE i.id = v_isletme), 0)::bigint AS acilis, 0 AS sira
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

-- 6) Liste görünümü: aynı satırlar + tür / karşı taraf / ayrıntı ---------------------------------------------------------------------
-- tur: tahsilat · iade · gider · personel_odeme · personel_avans · giren · cikan · transfer_gelen · transfer_giden · kasa_baslangic · kasa_dengeleme
-- (transfer yönü HER ZAMAN tutar işaretinden okunur: + gelen bacak, − giden bacak.)
CREATE OR REPLACE VIEW public.hesap_hareket_detay WITH (security_invoker = true) AS
  SELECT g.isletme_id, g.tarih, g.hesap, g.banka_hesap_id, g.yontem, g.tutar_kurus, g.kaynak, g.kaynak_id, g.aciklama,
         CASE g.kaynak
           WHEN 'musteri' THEN CASE WHEN g.tutar_kurus >= 0 THEN 'tahsilat' ELSE 'iade' END
           WHEN 'gider' THEN 'gider'
           WHEN 'personel' THEN CASE WHEN ph.tur = 'avans' THEN 'personel_avans' ELSE 'personel_odeme' END
           WHEN 'manuel' THEN CASE WHEN m.tip = 'transfer' THEN CASE WHEN g.tutar_kurus >= 0 THEN 'transfer_gelen' ELSE 'transfer_giden' END ELSE m.tip END
           ELSE g.kaynak
         END AS tur,
         CASE g.kaynak
           WHEN 'musteri' THEN mo.ad_soyad
           WHEN 'gider' THEN gd.tedarikci_adi
           WHEN 'personel' THEN pk.ad_soyad
           WHEN 'manuel' THEN CASE
             WHEN m.tip = 'transfer' THEN CASE WHEN g.tutar_kurus >= 0
               THEN CASE WHEN m.kasa THEN 'Kasa' ELSE bk.banka_adi END
               ELSE CASE WHEN m.hedef_kasa THEN 'Kasa' ELSE bh.banka_adi END END
             ELSE nullif(concat_ws(' · ', m.karsi_taraf, m.karsi_taraf_banka), '') END
           WHEN 'kasa_baslangic' THEN ik.ad_soyad
           WHEN 'kasa_dengeleme' THEN dk.ad_soyad
         END AS karsi_taraf,
         CASE g.kaynak
           WHEN 'musteri' THEN mh.aciklama
           WHEN 'gider' THEN gd.aciklama
           WHEN 'personel' THEN ph.aciklama
           WHEN 'manuel' THEN m.aciklama
           WHEN 'kasa_dengeleme' THEN kd.aciklama
         END AS detay,
         gd.kategori AS kategori,
         m.karsi_taraf_iban AS karsi_iban,
         CASE g.kaynak WHEN 'kasa_baslangic' THEN i.kasa_baslangic_zamani WHEN 'kasa_dengeleme' THEN kd.created_at END AS islem_zamani
    FROM public.hesap_hareket_gorunum g
    LEFT JOIN public.musteri_bakiye_hareket mh ON g.kaynak = 'musteri' AND mh.id = g.kaynak_id
    LEFT JOIN public.musteri_ozet mo ON mo.id = mh.musteri_id
    LEFT JOIN public.gider gd ON g.kaynak = 'gider' AND gd.id = g.kaynak_id
    LEFT JOIN public.personel_hesap_hareket ph ON g.kaynak = 'personel' AND ph.id = g.kaynak_id
    LEFT JOIN public.kullanici pk ON pk.id = ph.kullanici_id
    LEFT JOIN public.kasa_banka_hareket m ON g.kaynak = 'manuel' AND m.id = g.kaynak_id
    LEFT JOIN public.isletme_banka_hesabi bk ON bk.id = m.banka_hesap_id
    LEFT JOIN public.isletme_banka_hesabi bh ON bh.id = m.hedef_banka_hesap_id
    LEFT JOIN public.isletme i ON g.kaynak = 'kasa_baslangic' AND i.id = g.kaynak_id
    LEFT JOIN public.kullanici ik ON ik.id = i.kasa_baslangic_giren_id
    LEFT JOIN public.kasa_dengeleme kd ON g.kaynak = 'kasa_dengeleme' AND kd.id = g.kaynak_id
    LEFT JOIN public.kullanici dk ON dk.id = kd.olusturan_kullanici_id;
REVOKE ALL ON public.hesap_hareket_detay FROM anon, authenticated;
GRANT SELECT ON public.hesap_hareket_detay TO authenticated;

-- 7) Dönem sorguları ve SUM'lar için indeksler ----------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gider_odenen_tarih ON public.gider (isletme_id, odeme_tarihi) WHERE durum = 'odendi';
CREATE INDEX IF NOT EXISTS idx_phh_odeme_tarih ON public.personel_hesap_hareket (isletme_id, islem_tarihi) WHERE tur IN ('odeme', 'avans');

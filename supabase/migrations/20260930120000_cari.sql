-- Cari (müşteri defteri): DEĞİŞMEZ hareketler, bakiye, kasa özeti.
-- (UYGULANMADI — önce 20260930110000 uygulanmış olmalı.)
--
-- Tek defter: borç ve ödeme bağımsız kayıtlardır, bakiye = SUM(hareketler).
--   borc  : bakiyeyi -(tutar - iskonto) etkiler   (üyelik/ders satışı)
--   odeme : bakiyeyi +tutar etkiler                (nakit | kredi_karti | havale)
--   iade  : bakiyeyi -tutar etkiler                (müşteriye geri ödeme; bir ödemeye bağlı)
-- Tutarlar kuruş (bigint). Kayıtlar ASLA güncellenmez/silinmez; düzeltme yeni (ters) kayıttır.
-- Erişim: isletme_admin, resepsiyon, muhasebe. İade yalnızca isletme_admin.

CREATE TABLE IF NOT EXISTS public.musteri_bakiye_hareket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL,
  musteri_id uuid NOT NULL,
  tur text NOT NULL CHECK (tur IN ('borc', 'odeme', 'iade')),
  tutar_kurus bigint NOT NULL CHECK (tutar_kurus > 0),
  iskonto_kurus bigint NOT NULL DEFAULT 0 CHECK (iskonto_kurus >= 0),
  odeme_yontemi text CHECK (odeme_yontemi IN ('nakit', 'kredi_karti', 'havale')),
  aciklama text,
  -- Satışla ilişki: FK üyelik tablosu oluşunca eklenir (20260930130000).
  uyelik_id uuid,
  iade_edilen_hareket_id uuid,
  -- İstemci tarafından üretilen tek kullanımlık anahtar: çift tıklama/yeniden deneme çift kayıt üretmez.
  idempotency_anahtari uuid,
  islem_tarihi date NOT NULL DEFAULT public.bugun_istanbul(),
  islem_zamani timestamptz NOT NULL DEFAULT now(),
  kaydeden_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Defter silinmez: müşteri silinmeye çalışılırsa RESTRICT (KVKK anonimleştirme ayrı tasarlanır).
  FOREIGN KEY (musteri_id, isletme_id) REFERENCES public.musteri (id, isletme_id) ON DELETE RESTRICT,
  UNIQUE (id, isletme_id),
  FOREIGN KEY (iade_edilen_hareket_id, isletme_id) REFERENCES public.musteri_bakiye_hareket (id, isletme_id),
  UNIQUE (isletme_id, idempotency_anahtari),
  CONSTRAINT hareket_yontem_kurali CHECK (
    (tur = 'borc' AND odeme_yontemi IS NULL) OR (tur IN ('odeme', 'iade') AND odeme_yontemi IS NOT NULL)
  ),
  CONSTRAINT hareket_iskonto_kurali CHECK (iskonto_kurus <= tutar_kurus AND (tur = 'borc' OR iskonto_kurus = 0)),
  CONSTRAINT hareket_iade_baglantisi CHECK ((tur = 'iade') = (iade_edilen_hareket_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_hareket_musteri ON public.musteri_bakiye_hareket (musteri_id, islem_zamani DESC);
CREATE INDEX IF NOT EXISTS idx_hareket_kasa ON public.musteri_bakiye_hareket (isletme_id, islem_tarihi, tur);

-- İade doğrulaması: bir ÖDEMEYE bağlı olmalı, aynı müşteriye ait olmalı, toplam iade ödemeyi aşamaz.
-- SECURITY DEFINER: kilit (FOR UPDATE) UPDATE yetkisi ister; kullanıcılarda yalnız SELECT/INSERT vardır.
CREATE OR REPLACE FUNCTION public.hareket_dogrula()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_odeme public.musteri_bakiye_hareket%ROWTYPE;
  v_iade_toplam bigint;
BEGIN
  IF NEW.tur = 'iade' THEN
    -- Eşzamanlı iadeleri sıraya sok: bağlı ödeme satırı kilitlenir.
    SELECT * INTO v_odeme FROM public.musteri_bakiye_hareket
     WHERE id = NEW.iade_edilen_hareket_id AND isletme_id = NEW.isletme_id
       FOR UPDATE;
    IF NOT FOUND OR v_odeme.tur <> 'odeme' THEN
      RAISE EXCEPTION 'iade_icin_odeme_gerekli';
    END IF;
    IF v_odeme.musteri_id <> NEW.musteri_id THEN
      RAISE EXCEPTION 'iade_musteri_uyumsuz';
    END IF;
    SELECT coalesce(sum(tutar_kurus), 0) INTO v_iade_toplam
      FROM public.musteri_bakiye_hareket
     WHERE iade_edilen_hareket_id = NEW.iade_edilen_hareket_id AND tur = 'iade';
    IF v_iade_toplam + NEW.tutar_kurus > v_odeme.tutar_kurus THEN
      RAISE EXCEPTION 'iade_tutari_asildi';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hareket_dogrula ON public.musteri_bakiye_hareket;
CREATE TRIGGER trg_hareket_dogrula
  BEFORE INSERT ON public.musteri_bakiye_hareket
  FOR EACH ROW EXECUTE FUNCTION public.hareket_dogrula();

-- Defter değişmezliği: service_role dahil kimse güncelleyemez/silemez.
CREATE OR REPLACE FUNCTION public.defter_degismez()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'defter_degismez';
END;
$$;

DROP TRIGGER IF EXISTS trg_hareket_degismez ON public.musteri_bakiye_hareket;
CREATE TRIGGER trg_hareket_degismez
  BEFORE UPDATE OR DELETE ON public.musteri_bakiye_hareket
  FOR EACH ROW EXECUTE FUNCTION public.defter_degismez();

DROP TRIGGER IF EXISTS trg_audit_hareket ON public.musteri_bakiye_hareket;
CREATE TRIGGER trg_audit_hareket
  AFTER INSERT ON public.musteri_bakiye_hareket
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

-- RLS ----------------------------------------------------------------------------------------------
ALTER TABLE public.musteri_bakiye_hareket ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.musteri_bakiye_hareket FROM anon, authenticated;
GRANT SELECT, INSERT ON public.musteri_bakiye_hareket TO authenticated;

DROP POLICY IF EXISTS "hareket_select" ON public.musteri_bakiye_hareket;
CREATE POLICY "hareket_select" ON public.musteri_bakiye_hareket FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon', 'muhasebe'))
    OR (SELECT public.is_super_admin())
  );

DROP POLICY IF EXISTS "hareket_insert" ON public.musteri_bakiye_hareket;
CREATE POLICY "hareket_insert" ON public.musteri_bakiye_hareket FOR INSERT TO authenticated
  WITH CHECK (
    isletme_id = (SELECT public.current_isletme_id())
    AND kaydeden_kullanici_id = (SELECT auth.uid())
    AND (
      (tur IN ('borc', 'odeme') AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon', 'muhasebe'))
      OR (tur = 'iade' AND (SELECT public.current_rol()) = 'isletme_admin')
    )
  );

-- Bakiye (SECURITY INVOKER: hareket tablosunun RLS'i uygulanır) ------------------------------------------
CREATE OR REPLACE VIEW public.musteri_bakiye WITH (security_invoker = true) AS
SELECT h.isletme_id,
       h.musteri_id,
       sum(CASE h.tur
             WHEN 'odeme' THEN h.tutar_kurus
             WHEN 'borc' THEN -(h.tutar_kurus - h.iskonto_kurus)
             WHEN 'iade' THEN -h.tutar_kurus
           END)::bigint AS bakiye_kurus
  FROM public.musteri_bakiye_hareket h
 GROUP BY h.isletme_id, h.musteri_id;

REVOKE ALL ON public.musteri_bakiye FROM anon, authenticated;
GRANT SELECT ON public.musteri_bakiye TO authenticated;

-- Cari alacaklar: bakiyesi negatif (borçlu) müşteriler. Ad için musteri_ozet (kişisel veri yok).
CREATE OR REPLACE VIEW public.cari_alacak WITH (security_invoker = true) AS
SELECT b.isletme_id, b.musteri_id, o.uye_no, o.ad_soyad, (-b.bakiye_kurus)::bigint AS borc_kurus
  FROM public.musteri_bakiye b
  JOIN public.musteri_ozet o ON o.id = b.musteri_id
 WHERE b.bakiye_kurus < 0;

REVOKE ALL ON public.cari_alacak FROM anon, authenticated;
GRANT SELECT ON public.cari_alacak TO authenticated;

-- Tek giriş: hareket ekle (idempotent) -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hareket_ekle(
  p_musteri_id uuid,
  p_tur text,
  p_tutar_kurus bigint,
  p_iskonto_kurus bigint DEFAULT 0,
  p_yontem text DEFAULT NULL,
  p_aciklama text DEFAULT NULL,
  p_iade_edilen_hareket_id uuid DEFAULT NULL,
  p_anahtar uuid DEFAULT NULL,
  p_uyelik_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.current_isletme_id();
  v_id uuid;
BEGIN
  IF v_isletme IS NULL THEN
    RAISE EXCEPTION 'isletme_yok';
  END IF;

  INSERT INTO public.musteri_bakiye_hareket (
    isletme_id, musteri_id, tur, tutar_kurus, iskonto_kurus, odeme_yontemi, aciklama,
    iade_edilen_hareket_id, idempotency_anahtari, uyelik_id
  )
  VALUES (
    v_isletme, p_musteri_id, p_tur, p_tutar_kurus, coalesce(p_iskonto_kurus, 0), nullif(p_yontem, ''),
    nullif(btrim(p_aciklama), ''), p_iade_edilen_hareket_id, p_anahtar, p_uyelik_id
  )
  ON CONFLICT (isletme_id, idempotency_anahtari) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Aynı anahtarla daha önce kaydedilmiş: aynı kaydı döndür (çift kayıt yok).
    SELECT id INTO v_id FROM public.musteri_bakiye_hareket
     WHERE isletme_id = v_isletme AND idempotency_anahtari = p_anahtar;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.hareket_ekle(uuid, text, bigint, bigint, text, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hareket_ekle(uuid, text, bigint, bigint, text, text, uuid, uuid, uuid) TO authenticated;

-- Kasa özeti: [baslangic, bitis) İstanbul takvim günü aralığı (islem_tarihi bir date kolonudur) ----------------------
CREATE OR REPLACE FUNCTION public.kasa_ozet(p_baslangic date, p_bitis date)
RETURNS TABLE (odeme_yontemi text, tahsilat_kurus bigint, iade_kurus bigint, net_kurus bigint, adet integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT h.odeme_yontemi,
         coalesce(sum(h.tutar_kurus) FILTER (WHERE h.tur = 'odeme'), 0)::bigint AS tahsilat_kurus,
         coalesce(sum(h.tutar_kurus) FILTER (WHERE h.tur = 'iade'), 0)::bigint AS iade_kurus,
         (coalesce(sum(h.tutar_kurus) FILTER (WHERE h.tur = 'odeme'), 0)
          - coalesce(sum(h.tutar_kurus) FILTER (WHERE h.tur = 'iade'), 0))::bigint AS net_kurus,
         count(*)::integer AS adet
    FROM public.musteri_bakiye_hareket h
   WHERE h.tur IN ('odeme', 'iade')
     AND h.islem_tarihi >= p_baslangic
     AND h.islem_tarihi < p_bitis
   GROUP BY h.odeme_yontemi
   ORDER BY h.odeme_yontemi
$$;
REVOKE EXECUTE ON FUNCTION public.kasa_ozet(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kasa_ozet(date, date) TO authenticated;

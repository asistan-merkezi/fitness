-- Şirket Bilgileri > Araçlar + Giderler revizyonu (klinik düzeni):
--  * isletme_arac: işletme envanterindeki araçlar (marka/model/plaka). Silinmez, pasife alınır (gider kayıtları araca bağlı kalır).
--  * gider.arac_id: Bakım/Onarım, Motorlu Taşıtlar Vergisi ve Trafik Cezası giderleri hangi araca ait olduğunu taşıyabilir.
--  * gider.donem_yil/donem_ay: kamu ödemesinin AİT OLDUĞU dönem (ör. Eylül KDV'si Ekim'de ödenir); Kamusal Giderler bu döneme göre listelenir.
--  * Kamu ödemesi tipleri (KDV, stopaj, SGK, damga, emlak, MTV, Bağkur, muhasebe ücreti, trafik cezası, gecikme faizi, geçici/kurumlar vergisi) kategori olarak eklendi.
--  * gider_ekle yeni parametrelerle yeniden tanımlanır; ESKİ imza ÖNCE silinir (aksi halde ikinci bir overload oluşur, PostgREST PGRST203 verir).
-- İdempotent tek blok. Önce 20260930220000 uygulanmış olmalı.

-- 1) Araçlar ----------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.isletme_arac (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  marka text NOT NULL CHECK (char_length(btrim(marka)) >= 1),
  model text NOT NULL CHECK (char_length(btrim(model)) >= 1),
  plaka text NOT NULL CHECK (char_length(btrim(plaka)) >= 4),
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, isletme_id)
);

-- Plaka boşluksuz büyük harfle saklanır; aynı plaka iki kez eklenemez.
CREATE OR REPLACE FUNCTION public.plaka_duzenle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.plaka := upper(regexp_replace(NEW.plaka, '\s', '', 'g'));
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.plaka_duzenle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_arac_plaka_duzenle ON public.isletme_arac;
CREATE TRIGGER trg_arac_plaka_duzenle BEFORE INSERT OR UPDATE ON public.isletme_arac FOR EACH ROW EXECUTE FUNCTION public.plaka_duzenle();
CREATE UNIQUE INDEX IF NOT EXISTS uq_arac_plaka ON public.isletme_arac (isletme_id, plaka);
DROP TRIGGER IF EXISTS trg_arac_updated_at ON public.isletme_arac;
CREATE TRIGGER trg_arac_updated_at BEFORE UPDATE ON public.isletme_arac FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_arac ON public.isletme_arac;
CREATE TRIGGER trg_audit_arac AFTER INSERT OR UPDATE ON public.isletme_arac FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.isletme_arac ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.isletme_arac FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.isletme_arac TO authenticated;

DROP POLICY IF EXISTS "arac_select" ON public.isletme_arac;
CREATE POLICY "arac_select" ON public.isletme_arac FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'muhasebe'))
    OR (SELECT public.is_super_admin())
  );
DROP POLICY IF EXISTS "arac_insert" ON public.isletme_arac;
CREATE POLICY "arac_insert" ON public.isletme_arac FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');
DROP POLICY IF EXISTS "arac_update" ON public.isletme_arac;
CREATE POLICY "arac_update" ON public.isletme_arac FOR UPDATE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');
-- Silme yok: araç "aktif = false" ile pasife alınır.

-- 2) gider: yeni kategoriler, araç ve dönem ------------------------------------------------------------------------------------
ALTER TABLE public.gider DROP CONSTRAINT IF EXISTS gider_kategori_check;
ALTER TABLE public.gider ADD CONSTRAINT gider_kategori_check CHECK (kategori IN (
  'kira', 'elektrik', 'su', 'dogalgaz', 'internet_telefon', 'bakim_onarim', 'temizlik', 'malzeme', 'ekipman', 'reklam', 'sigorta', 'vergi_sgk', 'yazilim', 'diger',
  'kdv', 'stopaj', 'sgk_primleri', 'damga_vergisi', 'emlak_vergisi', 'arac_vergisi', 'bagkur_primleri', 'muhasebe_ucreti', 'trafik_cezasi', 'gec_odeme_faizi', 'gecici_vergi', 'kurumlar_vergisi'
));

ALTER TABLE public.gider ADD COLUMN IF NOT EXISTS arac_id uuid;
ALTER TABLE public.gider ADD COLUMN IF NOT EXISTS donem_yil smallint;
ALTER TABLE public.gider ADD COLUMN IF NOT EXISTS donem_ay smallint;

ALTER TABLE public.gider DROP CONSTRAINT IF EXISTS gider_arac_fk;
ALTER TABLE public.gider ADD CONSTRAINT gider_arac_fk FOREIGN KEY (arac_id, isletme_id) REFERENCES public.isletme_arac (id, isletme_id) ON DELETE RESTRICT;
ALTER TABLE public.gider DROP CONSTRAINT IF EXISTS gider_arac_kurali;
ALTER TABLE public.gider ADD CONSTRAINT gider_arac_kurali CHECK (arac_id IS NULL OR kategori IN ('bakim_onarim', 'arac_vergisi', 'trafik_cezasi'));
ALTER TABLE public.gider DROP CONSTRAINT IF EXISTS gider_donem_kurali;
ALTER TABLE public.gider ADD CONSTRAINT gider_donem_kurali CHECK (
  (donem_yil IS NULL AND donem_ay IS NULL)
  OR (donem_yil IS NOT NULL AND donem_ay IS NOT NULL AND donem_yil BETWEEN 2000 AND 2100 AND donem_ay BETWEEN 1 AND 12)
);
CREATE INDEX IF NOT EXISTS idx_gider_donem ON public.gider (isletme_id, tur, donem_yil, donem_ay);

-- Araç ve dönem de kaydedildikten sonra DEĞİŞMEZ (defter ilkesi).
CREATE OR REPLACE FUNCTION public.gider_degismez_alanlar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.tutar_kurus IS DISTINCT FROM OLD.tutar_kurus OR NEW.kategori IS DISTINCT FROM OLD.kategori OR NEW.tarih IS DISTINCT FROM OLD.tarih
     OR NEW.isletme_id IS DISTINCT FROM OLD.isletme_id OR NEW.tur IS DISTINCT FROM OLD.tur OR NEW.kdv_orani IS DISTINCT FROM OLD.kdv_orani
     OR NEW.arac_id IS DISTINCT FROM OLD.arac_id OR NEW.donem_yil IS DISTINCT FROM OLD.donem_yil OR NEW.donem_ay IS DISTINCT FROM OLD.donem_ay THEN
    RAISE EXCEPTION 'defter_degismez';
  END IF;
  IF OLD.durum = 'iptal' THEN
    RAISE EXCEPTION 'defter_degismez';
  END IF;
  IF OLD.durum = 'odendi' AND NEW.durum <> 'iptal' THEN
    RAISE EXCEPTION 'defter_degismez';
  END IF;
  RETURN NEW;
END;
$$;

-- 3) gider_ekle: araç + dönem parametreleri ---------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.gider_ekle(text, bigint, date, text, text, text, text, integer, date, boolean, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.gider_ekle(
  p_kategori text,
  p_tutar_kurus bigint,
  p_tarih date DEFAULT NULL,
  p_tur text DEFAULT 'gider',
  p_tedarikci text DEFAULT NULL,
  p_aciklama text DEFAULT NULL,
  p_belge_no text DEFAULT NULL,
  p_kdv_orani integer DEFAULT 0,
  p_vade date DEFAULT NULL,
  p_odendi boolean DEFAULT true,
  p_yontem text DEFAULT NULL,
  p_banka_hesap_id uuid DEFAULT NULL,
  p_anahtar uuid DEFAULT NULL,
  p_arac_id uuid DEFAULT NULL,
  p_donem_yil integer DEFAULT NULL,
  p_donem_ay integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'muhasebe']);
  v_bugun date := public.bugun_istanbul();
  v_tarih date := coalesce(p_tarih, public.bugun_istanbul());
  v_kamu_tipleri text[] := ARRAY['vergi_sgk', 'kdv', 'stopaj', 'sgk_primleri', 'damga_vergisi', 'emlak_vergisi', 'arac_vergisi', 'bagkur_primleri', 'muhasebe_ucreti', 'trafik_cezasi', 'gec_odeme_faizi', 'gecici_vergi', 'kurumlar_vergisi'];
  v_id uuid;
BEGIN
  IF p_anahtar IS NOT NULL THEN
    SELECT id INTO v_id FROM public.gider WHERE isletme_id = v_isletme AND idempotency_anahtari = p_anahtar;
    IF FOUND THEN
      RETURN v_id;
    END IF;
  END IF;

  IF p_tutar_kurus IS NULL OR p_tutar_kurus <= 0 THEN
    RAISE EXCEPTION 'tutar_gecersiz';
  END IF;
  IF v_tarih > v_bugun THEN
    RAISE EXCEPTION 'gelecek_tarih';
  END IF;
  -- Kamu ödemesi yalnız kamu tiplerinden biriyle ve ait olduğu dönemle girilir; olağan gider kamu-özel tiplerini taşımaz.
  IF p_tur = 'kamusal' THEN
    IF p_kategori IS NOT NULL AND NOT (p_kategori = ANY (v_kamu_tipleri)) THEN
      RAISE EXCEPTION 'kategori_uygun_degil';
    END IF;
    IF p_donem_yil IS NULL OR p_donem_ay IS NULL THEN
      RAISE EXCEPTION 'donem_gerekli';
    END IF;
  ELSIF p_kategori = ANY (v_kamu_tipleri) AND p_kategori <> 'vergi_sgk' THEN
    RAISE EXCEPTION 'kategori_uygun_degil';
  END IF;
  IF p_odendi THEN
    IF p_yontem IS NULL OR p_yontem NOT IN ('nakit', 'havale', 'kredi_karti') THEN
      RAISE EXCEPTION 'odeme_yontemi_gerekli';
    END IF;
  ELSIF p_yontem IS NOT NULL OR p_banka_hesap_id IS NOT NULL THEN
    RAISE EXCEPTION 'bekleyen_gider_yontem_olmaz';
  END IF;
  IF p_banka_hesap_id IS NOT NULL AND (p_yontem NOT IN ('havale', 'kredi_karti') OR NOT public.banka_hesabi_gecerli(p_banka_hesap_id)) THEN
    RAISE EXCEPTION 'banka_hesabi_bulunamadi';
  END IF;
  IF p_arac_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.isletme_arac WHERE id = p_arac_id AND isletme_id = v_isletme AND aktif) THEN
    RAISE EXCEPTION 'arac_bulunamadi';
  END IF;

  INSERT INTO public.gider (isletme_id, tur, kategori, tedarikci_adi, aciklama, belge_no, tutar_kurus, kdv_orani, tarih, vade_tarihi, durum, odeme_yontemi, banka_hesap_id, odeme_tarihi, idempotency_anahtari, arac_id, donem_yil, donem_ay)
  VALUES (v_isletme, p_tur, p_kategori, nullif(btrim(p_tedarikci), ''), nullif(btrim(p_aciklama), ''), nullif(btrim(p_belge_no), ''), p_tutar_kurus, coalesce(p_kdv_orani, 0), v_tarih, p_vade,
          CASE WHEN p_odendi THEN 'odendi' ELSE 'bekliyor' END,
          CASE WHEN p_odendi THEN p_yontem END, CASE WHEN p_odendi THEN p_banka_hesap_id END, CASE WHEN p_odendi THEN v_bugun END, p_anahtar,
          p_arac_id, p_donem_yil, p_donem_ay)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.gider_ekle(text, bigint, date, text, text, text, text, integer, date, boolean, text, uuid, uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gider_ekle(text, bigint, date, text, text, text, text, integer, date, boolean, text, uuid, uuid, uuid, integer, integer) TO authenticated;

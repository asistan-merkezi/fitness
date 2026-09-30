-- F13: Finans — hesaplar (kasa/banka), giderler, kasa-banka defteri, kredi kartı mutabakatı, kategori iskonto oranları,
-- fatura kuyruğu ve finans özeti. (UYGULANMADI — önce 20260930210000 uygulanmış olmalı.)
--
-- Klinikteki finans modüllerinin fitness karşılığı. İlkeler:
--  * Tüm tutarlar KURUŞ (bigint). Defterler DEĞİŞMEZ: düzeltme ters kayıt/iptal ile yapılır, silme yoktur.
--  * Her paranın bir HESABI vardır: nakit -> Kasa; havale / kredi kartı -> bir banka hesabı (seçilmemişse "atanmamış").
--    Müşteri tahsilatı, gider ve personel ödemesi banka hesabı seçebilir; bakiye tek bir görünümden (hesap_hareket_gorunum) hesaplanır.
--  * Kasa/banka manuel hareketi, gider ve fatura yazma yetkisi yalnız SECURITY DEFINER fonksiyonlardadır.
--  * Banka hesabı adı/IBAN'ı yalnız yönetici ve muhasebe görür; resepsiyon tahsilatta hesabı yalnız adıyla seçer (banka_hesap_secenekleri).

-- 1) Açılış bakiyeleri ve hareketlere hesap bağı ---------------------------------------------------------------------
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS kasa_acilis_kurus bigint NOT NULL DEFAULT 0;
ALTER TABLE public.isletme_banka_hesabi ADD COLUMN IF NOT EXISTS acilis_bakiye_kurus bigint NOT NULL DEFAULT 0;

ALTER TABLE public.musteri_bakiye_hareket ADD COLUMN IF NOT EXISTS banka_hesap_id uuid;
ALTER TABLE public.musteri_bakiye_hareket DROP CONSTRAINT IF EXISTS hareket_banka_fk;
ALTER TABLE public.musteri_bakiye_hareket ADD CONSTRAINT hareket_banka_fk
  FOREIGN KEY (banka_hesap_id, isletme_id) REFERENCES public.isletme_banka_hesabi (id, isletme_id) ON DELETE RESTRICT;
-- NULL tuzağı: yöntem de açıkça IS NOT NULL ile sınanır.
ALTER TABLE public.musteri_bakiye_hareket DROP CONSTRAINT IF EXISTS hareket_banka_kurali;
ALTER TABLE public.musteri_bakiye_hareket ADD CONSTRAINT hareket_banka_kurali
  CHECK (banka_hesap_id IS NULL OR (odeme_yontemi IS NOT NULL AND odeme_yontemi IN ('havale', 'kredi_karti')));

ALTER TABLE public.personel_hesap_hareket ADD COLUMN IF NOT EXISTS banka_hesap_id uuid;
ALTER TABLE public.personel_hesap_hareket DROP CONSTRAINT IF EXISTS phh_banka_fk;
ALTER TABLE public.personel_hesap_hareket ADD CONSTRAINT phh_banka_fk
  FOREIGN KEY (banka_hesap_id, isletme_id) REFERENCES public.isletme_banka_hesabi (id, isletme_id) ON DELETE RESTRICT;
ALTER TABLE public.personel_hesap_hareket DROP CONSTRAINT IF EXISTS phh_banka_kurali;
ALTER TABLE public.personel_hesap_hareket ADD CONSTRAINT phh_banka_kurali
  CHECK (banka_hesap_id IS NULL OR (odeme_yontemi IS NOT NULL AND odeme_yontemi = 'havale'));

-- Tahsilatta hesap seçimi için: aktif hesapların YALNIZ adı (IBAN/şube yok). Yönetici, resepsiyon ve muhasebe çağırabilir.
CREATE OR REPLACE FUNCTION public.banka_hesap_secenekleri()
RETURNS TABLE (id uuid, ad text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon', 'muhasebe']);
BEGIN
  RETURN QUERY
  SELECT b.id, b.banka_adi || CASE WHEN b.sube IS NOT NULL THEN ' · ' || b.sube ELSE '' END
    FROM public.isletme_banka_hesabi b
   WHERE b.isletme_id = v_isletme AND b.aktif
   ORDER BY b.sira, b.banka_adi;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.banka_hesap_secenekleri() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.banka_hesap_secenekleri() TO authenticated;

-- Hesap geçerliliği kontrolü: aktif ve OTURUMDAKİ işletmeye ait mi? İşletme parametre değil oturumdan alınır (başka işletmenin hesabı yoklanamaz).
-- Tahsilat yapan resepsiyon hesap tablosunu okuyamadığından DEFINER; invoker fonksiyonlar (hareket_ekle) çağırabilsin diye authenticated'a açıktır.
CREATE OR REPLACE FUNCTION public.banka_hesabi_gecerli(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.isletme_banka_hesabi WHERE id = p_id AND isletme_id = public.current_isletme_id() AND aktif);
$$;
REVOKE EXECUTE ON FUNCTION public.banka_hesabi_gecerli(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.banka_hesabi_gecerli(uuid) TO authenticated;

-- 2) Tahsilat/iade fonksiyonu: banka hesabı seçimi eklendi (eski imza kaldırılır, çağrılar adlandırılmış parametre kullanır) --------
DROP FUNCTION IF EXISTS public.hareket_ekle(uuid, text, bigint, bigint, text, text, uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.hareket_ekle(
  p_musteri_id uuid,
  p_tur text,
  p_tutar_kurus bigint,
  p_iskonto_kurus bigint DEFAULT 0,
  p_yontem text DEFAULT NULL,
  p_aciklama text DEFAULT NULL,
  p_iade_edilen_hareket_id uuid DEFAULT NULL,
  p_anahtar uuid DEFAULT NULL,
  p_uyelik_id uuid DEFAULT NULL,
  p_banka_hesap_id uuid DEFAULT NULL
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
  IF p_banka_hesap_id IS NOT NULL AND NOT public.banka_hesabi_gecerli(p_banka_hesap_id) THEN
    RAISE EXCEPTION 'banka_hesabi_bulunamadi';
  END IF;

  INSERT INTO public.musteri_bakiye_hareket (
    isletme_id, musteri_id, tur, tutar_kurus, iskonto_kurus, odeme_yontemi, aciklama,
    iade_edilen_hareket_id, idempotency_anahtari, uyelik_id, banka_hesap_id
  )
  VALUES (
    v_isletme, p_musteri_id, p_tur, p_tutar_kurus, coalesce(p_iskonto_kurus, 0), nullif(p_yontem, ''),
    nullif(btrim(p_aciklama), ''), p_iade_edilen_hareket_id, p_anahtar, p_uyelik_id, p_banka_hesap_id
  )
  ON CONFLICT (isletme_id, idempotency_anahtari) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Aynı anahtarla daha önce kaydedilmiş: aynı kaydı döndür (çift kayıt yok).
    SELECT id INTO v_id FROM public.musteri_bakiye_hareket WHERE isletme_id = v_isletme AND idempotency_anahtari = p_anahtar;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.hareket_ekle(uuid, text, bigint, bigint, text, text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hareket_ekle(uuid, text, bigint, bigint, text, text, uuid, uuid, uuid, uuid) TO authenticated;

-- Personel ödeme/avans: banka hesabı seçimi eklendi.
DROP FUNCTION IF EXISTS public.personel_hesap_hareket_ekle(uuid, text, bigint, text, text, uuid);
CREATE OR REPLACE FUNCTION public.personel_hesap_hareket_ekle(
  p_kullanici_id uuid,
  p_tur text,
  p_tutar_kurus bigint,
  p_yontem text,
  p_aciklama text DEFAULT NULL,
  p_anahtar uuid DEFAULT NULL,
  p_banka_hesap_id uuid DEFAULT NULL
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
  IF p_banka_hesap_id IS NOT NULL AND (p_yontem <> 'havale' OR NOT public.banka_hesabi_gecerli(p_banka_hesap_id)) THEN
    RAISE EXCEPTION 'banka_hesabi_bulunamadi';
  END IF;

  INSERT INTO public.personel_hesap_hareket (isletme_id, kullanici_id, tur, tutar_kurus, odeme_yontemi, aciklama, idempotency_anahtari, banka_hesap_id)
  VALUES (v_isletme, p_kullanici_id, p_tur, p_tutar_kurus, p_yontem, nullif(btrim(p_aciklama), ''), p_anahtar, p_banka_hesap_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_hesap_hareket_ekle(uuid, text, bigint, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personel_hesap_hareket_ekle(uuid, text, bigint, text, text, uuid, uuid) TO authenticated;

-- 3) Giderler -------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gider (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  -- 'gider': olağan işletme gideri; 'kamusal': vergi/SGK/belediye gibi kamu ödemeleri (vadeli takip).
  tur text NOT NULL DEFAULT 'gider' CHECK (tur IN ('gider', 'kamusal')),
  kategori text NOT NULL CHECK (kategori IN ('kira', 'elektrik', 'su', 'dogalgaz', 'internet_telefon', 'bakim_onarim', 'temizlik', 'malzeme', 'ekipman', 'reklam', 'sigorta', 'vergi_sgk', 'yazilim', 'diger')),
  tedarikci_adi text,
  aciklama text,
  belge_no text,
  tutar_kurus bigint NOT NULL CHECK (tutar_kurus > 0),
  kdv_orani smallint NOT NULL DEFAULT 0 CHECK (kdv_orani BETWEEN 0 AND 100),
  tarih date NOT NULL DEFAULT public.bugun_istanbul(),
  vade_tarihi date,
  durum text NOT NULL DEFAULT 'odendi' CHECK (durum IN ('bekliyor', 'odendi', 'iptal')),
  odeme_yontemi text CHECK (odeme_yontemi IN ('nakit', 'havale', 'kredi_karti')),
  banka_hesap_id uuid,
  odeme_tarihi date,
  iptal_nedeni text,
  idempotency_anahtari uuid,
  olusturan_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (banka_hesap_id, isletme_id) REFERENCES public.isletme_banka_hesabi (id, isletme_id) ON DELETE RESTRICT,
  UNIQUE (isletme_id, idempotency_anahtari),
  -- Ödendi ise yöntem ve tarih zorunlu; bekleyende yöntem olmaz (iptal her iki durumdan gelebilir). NULL tuzağı: açık IS NOT NULL.
  CONSTRAINT gider_odeme_kurali CHECK (
    (durum = 'odendi' AND odeme_yontemi IS NOT NULL AND odeme_tarihi IS NOT NULL)
    OR (durum = 'bekliyor' AND odeme_yontemi IS NULL AND odeme_tarihi IS NULL)
    OR durum = 'iptal'
  ),
  CONSTRAINT gider_banka_kurali CHECK (banka_hesap_id IS NULL OR (odeme_yontemi IS NOT NULL AND odeme_yontemi IN ('havale', 'kredi_karti'))),
  CONSTRAINT gider_iptal_kurali CHECK (durum <> 'iptal' OR (iptal_nedeni IS NOT NULL AND btrim(iptal_nedeni) <> ''))
);
CREATE INDEX IF NOT EXISTS idx_gider_isletme_tarih ON public.gider (isletme_id, tarih DESC);
CREATE INDEX IF NOT EXISTS idx_gider_bekleyen ON public.gider (isletme_id, vade_tarihi) WHERE durum = 'bekliyor';

DROP TRIGGER IF EXISTS trg_gider_updated_at ON public.gider;
CREATE TRIGGER trg_gider_updated_at BEFORE UPDATE ON public.gider FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_gider ON public.gider;
CREATE TRIGGER trg_audit_gider AFTER INSERT OR UPDATE ON public.gider FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

-- Tutar ve kimlik alanları kaydedildikten sonra DEĞİŞMEZ: yalnız durum geçişi (bekliyor -> odendi / iptal, odendi -> iptal) olur.
CREATE OR REPLACE FUNCTION public.gider_degismez_alanlar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.tutar_kurus IS DISTINCT FROM OLD.tutar_kurus OR NEW.kategori IS DISTINCT FROM OLD.kategori OR NEW.tarih IS DISTINCT FROM OLD.tarih
     OR NEW.isletme_id IS DISTINCT FROM OLD.isletme_id OR NEW.tur IS DISTINCT FROM OLD.tur OR NEW.kdv_orani IS DISTINCT FROM OLD.kdv_orani THEN
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
DROP TRIGGER IF EXISTS trg_gider_degismez ON public.gider;
CREATE TRIGGER trg_gider_degismez BEFORE UPDATE ON public.gider FOR EACH ROW EXECUTE FUNCTION public.gider_degismez_alanlar();
CREATE OR REPLACE FUNCTION public.gider_silinemez()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'defter_degismez';
END;
$$;
DROP TRIGGER IF EXISTS trg_gider_silinemez ON public.gider;
CREATE TRIGGER trg_gider_silinemez BEFORE DELETE ON public.gider FOR EACH ROW EXECUTE FUNCTION public.gider_silinemez();

ALTER TABLE public.gider ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gider FROM anon, authenticated;
GRANT SELECT ON public.gider TO authenticated;
DROP POLICY IF EXISTS "gider_select" ON public.gider;
CREATE POLICY "gider_select" ON public.gider FOR SELECT TO authenticated
  USING ((isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'muhasebe')) OR (SELECT public.is_super_admin()));

-- Gider ekle (yönetici ve muhasebe). p_odendi=true: yöntem zorunlu, hesaplara etki eder. false: vadeli bekleyen borç (hesaba etkisiz).
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
  p_anahtar uuid DEFAULT NULL
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

  INSERT INTO public.gider (isletme_id, tur, kategori, tedarikci_adi, aciklama, belge_no, tutar_kurus, kdv_orani, tarih, vade_tarihi, durum, odeme_yontemi, banka_hesap_id, odeme_tarihi, idempotency_anahtari)
  VALUES (v_isletme, p_tur, p_kategori, nullif(btrim(p_tedarikci), ''), nullif(btrim(p_aciklama), ''), nullif(btrim(p_belge_no), ''), p_tutar_kurus, coalesce(p_kdv_orani, 0), v_tarih, p_vade,
          CASE WHEN p_odendi THEN 'odendi' ELSE 'bekliyor' END,
          CASE WHEN p_odendi THEN p_yontem END, CASE WHEN p_odendi THEN p_banka_hesap_id END, CASE WHEN p_odendi THEN v_bugun END, p_anahtar)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.gider_ekle(text, bigint, date, text, text, text, text, integer, date, boolean, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gider_ekle(text, bigint, date, text, text, text, text, integer, date, boolean, text, uuid, uuid) TO authenticated;

-- Bekleyen gideri öde: yalnız 'bekliyor' -> 'odendi'.
CREATE OR REPLACE FUNCTION public.gider_ode(p_id uuid, p_yontem text, p_banka_hesap_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'muhasebe']);
  g public.gider%ROWTYPE;
BEGIN
  SELECT * INTO g FROM public.gider WHERE id = p_id AND isletme_id = v_isletme FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gider_bulunamadi';
  END IF;
  IF g.durum <> 'bekliyor' THEN
    RAISE EXCEPTION 'gider_durumu_uygun_degil';
  END IF;
  IF p_yontem IS NULL OR p_yontem NOT IN ('nakit', 'havale', 'kredi_karti') THEN
    RAISE EXCEPTION 'odeme_yontemi_gerekli';
  END IF;
  IF p_banka_hesap_id IS NOT NULL AND (p_yontem NOT IN ('havale', 'kredi_karti') OR NOT public.banka_hesabi_gecerli(p_banka_hesap_id)) THEN
    RAISE EXCEPTION 'banka_hesabi_bulunamadi';
  END IF;
  UPDATE public.gider SET durum = 'odendi', odeme_yontemi = p_yontem, banka_hesap_id = p_banka_hesap_id, odeme_tarihi = public.bugun_istanbul() WHERE id = p_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.gider_ode(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gider_ode(uuid, text, uuid) TO authenticated;

-- Gider iptali (yalnız yönetici, gerekçe zorunlu): kayıt silinmez; ödenmişse hesaplara etkisi kalkar.
CREATE OR REPLACE FUNCTION public.gider_iptal(p_id uuid, p_neden text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  g public.gider%ROWTYPE;
BEGIN
  IF nullif(btrim(p_neden), '') IS NULL THEN
    RAISE EXCEPTION 'iptal_nedeni_gerekli';
  END IF;
  SELECT * INTO g FROM public.gider WHERE id = p_id AND isletme_id = v_isletme FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gider_bulunamadi';
  END IF;
  IF g.durum = 'iptal' THEN
    RAISE EXCEPTION 'gider_durumu_uygun_degil';
  END IF;
  UPDATE public.gider SET durum = 'iptal', iptal_nedeni = btrim(p_neden) WHERE id = p_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.gider_iptal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gider_iptal(uuid, text) TO authenticated;

-- 4) Kasa / banka manuel hareket defteri ------------------------------------------------------------------------------
-- giren: hesaba para girer (+). cikan: hesaptan para çıkar (-). transfer: hesaptan hesaba (kaynaktan -, hedefe +).
CREATE TABLE IF NOT EXISTS public.kasa_banka_hareket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  tip text NOT NULL CHECK (tip IN ('giren', 'cikan', 'transfer')),
  kasa boolean NOT NULL DEFAULT false,
  banka_hesap_id uuid,
  hedef_kasa boolean NOT NULL DEFAULT false,
  hedef_banka_hesap_id uuid,
  karsi_taraf text,
  aciklama text,
  tutar_kurus bigint NOT NULL CHECK (tutar_kurus > 0),
  tarih date NOT NULL DEFAULT public.bugun_istanbul(),
  idempotency_anahtari uuid,
  olusturan_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (banka_hesap_id, isletme_id) REFERENCES public.isletme_banka_hesabi (id, isletme_id) ON DELETE RESTRICT,
  FOREIGN KEY (hedef_banka_hesap_id, isletme_id) REFERENCES public.isletme_banka_hesabi (id, isletme_id) ON DELETE RESTRICT,
  UNIQUE (isletme_id, idempotency_anahtari),
  -- Hesap: kasa XOR bir banka hesabı.
  CONSTRAINT kbh_hesap_xor CHECK ((kasa AND banka_hesap_id IS NULL) OR (NOT kasa AND banka_hesap_id IS NOT NULL)),
  -- giren/çıkan: hedef boş. transfer: hedef de kasa XOR banka ve kaynaktan farklı.
  CONSTRAINT kbh_hedef_kurali CHECK (
    (tip IN ('giren', 'cikan') AND NOT hedef_kasa AND hedef_banka_hesap_id IS NULL)
    OR (tip = 'transfer' AND ((hedef_kasa AND hedef_banka_hesap_id IS NULL) OR (NOT hedef_kasa AND hedef_banka_hesap_id IS NOT NULL)))
  ),
  CONSTRAINT kbh_farkli_hesap CHECK (tip <> 'transfer' OR NOT (kasa AND hedef_kasa)),
  CONSTRAINT kbh_farkli_banka CHECK (tip <> 'transfer' OR banka_hesap_id IS NULL OR banka_hesap_id IS DISTINCT FROM hedef_banka_hesap_id)
);
CREATE INDEX IF NOT EXISTS idx_kbh_isletme_tarih ON public.kasa_banka_hareket (isletme_id, tarih DESC);

CREATE OR REPLACE FUNCTION public.kbh_degismez()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'defter_degismez';
END;
$$;
DROP TRIGGER IF EXISTS trg_kbh_degismez ON public.kasa_banka_hareket;
CREATE TRIGGER trg_kbh_degismez BEFORE UPDATE OR DELETE ON public.kasa_banka_hareket FOR EACH ROW EXECUTE FUNCTION public.kbh_degismez();
DROP TRIGGER IF EXISTS trg_audit_kbh ON public.kasa_banka_hareket;
CREATE TRIGGER trg_audit_kbh AFTER INSERT ON public.kasa_banka_hareket FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.kasa_banka_hareket ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kasa_banka_hareket FROM anon, authenticated;
GRANT SELECT ON public.kasa_banka_hareket TO authenticated;
DROP POLICY IF EXISTS "kbh_select" ON public.kasa_banka_hareket;
CREATE POLICY "kbh_select" ON public.kasa_banka_hareket FOR SELECT TO authenticated
  USING ((isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'muhasebe')) OR (SELECT public.is_super_admin()));

-- Yalnız işletme yöneticisi yazar (klinikle aynı). Hata düzeltmesi ters kayıtla yapılır.
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
  p_anahtar uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  v_tarih date := coalesce(p_tarih, public.bugun_istanbul());
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

  INSERT INTO public.kasa_banka_hareket (isletme_id, tip, kasa, banka_hesap_id, hedef_kasa, hedef_banka_hesap_id, karsi_taraf, aciklama, tutar_kurus, tarih, idempotency_anahtari)
  VALUES (v_isletme, p_tip, coalesce(p_kasa, false), p_banka_hesap_id, coalesce(p_hedef_kasa, false), p_hedef_banka_hesap_id, nullif(btrim(p_karsi_taraf), ''), nullif(btrim(p_aciklama), ''), p_tutar_kurus, v_tarih, p_anahtar)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.kasa_banka_hareket_ekle(text, bigint, boolean, uuid, boolean, uuid, text, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kasa_banka_hareket_ekle(text, bigint, boolean, uuid, boolean, uuid, text, text, date, uuid) TO authenticated;

-- 5) Hesap hareketleri (tek kaynak) ve özet ------------------------------------------------------------------------------
-- Her satır bir hesabın para hareketidir (tutar işaretli: + giriş, - çıkış). hesap: 'kasa' (nakit) | 'banka' (havale/kredi kartı/manuel banka).
-- security_invoker: kullanıcı yalnız rolünün okuyabildiği kaynak satırlarını görür (Kasa/Banka ekranları yönetici ve muhasebe içindir).
CREATE OR REPLACE VIEW public.hesap_hareket_gorunum WITH (security_invoker = true) AS
  SELECT h.isletme_id, h.islem_tarihi AS tarih,
         CASE WHEN h.odeme_yontemi = 'nakit' THEN 'kasa' ELSE 'banka' END AS hesap,
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
         CASE WHEN g.odeme_yontemi = 'nakit' THEN 'kasa' ELSE 'banka' END,
         g.banka_hesap_id, g.odeme_yontemi, (-g.tutar_kurus)::bigint, 'gider'::text, g.id, coalesce(g.tedarikci_adi, g.kategori)
    FROM public.gider g
   WHERE g.durum = 'odendi'
  UNION ALL
  SELECT p.isletme_id, p.islem_tarihi,
         CASE WHEN p.odeme_yontemi = 'nakit' THEN 'kasa' ELSE 'banka' END,
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

-- Hesap özeti [p_baslangic, p_bitis): her hesap için açılış (açılış bakiyesi + öncesi hareketler), giren, çıkan, kapanış.
-- Satırlar: kasa, her banka hesabı, ve hesabı seçilmemiş banka hareketi varsa 'Hesap atanmamış'.
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
  ),
  hareket AS (
    SELECT g.hesap, g.banka_hesap_id AS bid, g.tarih, g.tutar_kurus
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
   WHERE t.sira < 2 OR t.onceki <> 0 OR t.gir <> 0 OR t.cik <> 0
   ORDER BY t.sira, t.a;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.hesap_ozet(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hesap_ozet(date, date) TO authenticated;

-- 6) Kategori iskonto oranları -------------------------------------------------------------------------------------------
-- Müşteri kategorisine (standart/gold/vip/platinum) göre üyelik satışında ÖNERİLEN iskonto yüzdesi. Satışta değiştirilebilir; zorlayıcı değildir.
CREATE TABLE IF NOT EXISTS public.kategori_iskonto_orani (
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  kategori text NOT NULL CHECK (kategori IN ('standart', 'gold', 'vip', 'platinum')),
  yuzde numeric(5, 2) NOT NULL DEFAULT 0 CHECK (yuzde >= 0 AND yuzde <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (isletme_id, kategori)
);
DROP TRIGGER IF EXISTS trg_kategori_iskonto_updated_at ON public.kategori_iskonto_orani;
CREATE TRIGGER trg_kategori_iskonto_updated_at BEFORE UPDATE ON public.kategori_iskonto_orani FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_kategori_iskonto ON public.kategori_iskonto_orani;
CREATE TRIGGER trg_audit_kategori_iskonto AFTER INSERT OR UPDATE ON public.kategori_iskonto_orani FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.kategori_iskonto_orani ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kategori_iskonto_orani FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.kategori_iskonto_orani TO authenticated;
DROP POLICY IF EXISTS "iskonto_select" ON public.kategori_iskonto_orani;
CREATE POLICY "iskonto_select" ON public.kategori_iskonto_orani FOR SELECT TO authenticated
  USING ((isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon', 'muhasebe')) OR (SELECT public.is_super_admin()));
DROP POLICY IF EXISTS "iskonto_insert" ON public.kategori_iskonto_orani;
CREATE POLICY "iskonto_insert" ON public.kategori_iskonto_orani FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');
DROP POLICY IF EXISTS "iskonto_update" ON public.kategori_iskonto_orani;
CREATE POLICY "iskonto_update" ON public.kategori_iskonto_orani FOR UPDATE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');

-- 7) Fatura kuyruğu ---------------------------------------------------------------------------------------------------------
-- Faturalandırma (Paraşüt) entegrasyonu henüz bağlı değildir: fatura 'bekliyor' durumunda kuyruğa düşer; entegrasyon kurulunca
-- fatura_durum_ayarla (yalnız service_role) 'kesildi'/'hata' yazar. Bir borç satırı tek faturada yer alabilir.
CREATE TABLE IF NOT EXISTS public.fatura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL,
  durum text NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'kesildi', 'hata', 'iptal')),
  toplam_kurus bigint NOT NULL CHECK (toplam_kurus > 0),
  kdv_kurus bigint NOT NULL DEFAULT 0 CHECK (kdv_kurus >= 0),
  fatura_no text,
  parasut_id text,
  hata_mesaji text,
  kesim_zamani timestamptz,
  iptal_nedeni text,
  olusturan_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (musteri_id, isletme_id) REFERENCES public.musteri (id, isletme_id) ON DELETE RESTRICT,
  UNIQUE (id, isletme_id),
  CONSTRAINT fatura_kesildi_kurali CHECK (durum <> 'kesildi' OR (fatura_no IS NOT NULL AND kesim_zamani IS NOT NULL)),
  CONSTRAINT fatura_iptal_kurali CHECK (durum <> 'iptal' OR (iptal_nedeni IS NOT NULL AND btrim(iptal_nedeni) <> ''))
);
CREATE INDEX IF NOT EXISTS idx_fatura_isletme ON public.fatura (isletme_id, durum, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fatura_kalem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id uuid NOT NULL,
  isletme_id uuid NOT NULL,
  hareket_id uuid NOT NULL,
  aciklama text,
  tutar_kurus bigint NOT NULL CHECK (tutar_kurus > 0),
  kdv_orani smallint NOT NULL DEFAULT 20 CHECK (kdv_orani BETWEEN 0 AND 100),
  FOREIGN KEY (fatura_id, isletme_id) REFERENCES public.fatura (id, isletme_id) ON DELETE CASCADE,
  FOREIGN KEY (hareket_id, isletme_id) REFERENCES public.musteri_bakiye_hareket (id, isletme_id) ON DELETE RESTRICT,
  -- Bir borç satırı tek faturaya girer; fatura iptalinde kalemler silinir ve borç yeniden faturalanabilir hale gelir.
  UNIQUE (hareket_id)
);

DROP TRIGGER IF EXISTS trg_fatura_updated_at ON public.fatura;
CREATE TRIGGER trg_fatura_updated_at BEFORE UPDATE ON public.fatura FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_fatura ON public.fatura;
CREATE TRIGGER trg_audit_fatura AFTER INSERT OR UPDATE ON public.fatura FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.fatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fatura_kalem ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fatura, public.fatura_kalem FROM anon, authenticated;
GRANT SELECT ON public.fatura, public.fatura_kalem TO authenticated;
DROP POLICY IF EXISTS "fatura_select" ON public.fatura;
CREATE POLICY "fatura_select" ON public.fatura FOR SELECT TO authenticated
  USING ((isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon', 'muhasebe')) OR (SELECT public.is_super_admin()));
DROP POLICY IF EXISTS "fatura_kalem_select" ON public.fatura_kalem;
CREATE POLICY "fatura_kalem_select" ON public.fatura_kalem FOR SELECT TO authenticated
  USING ((isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon', 'muhasebe')) OR (SELECT public.is_super_admin()));

-- Henüz faturalanmamış borç satırları (net tutar = tutar - iskonto).
CREATE OR REPLACE VIEW public.faturalanmamis_borc WITH (security_invoker = true) AS
SELECT h.id, h.isletme_id, h.musteri_id, h.uyelik_id, h.aciklama, h.islem_tarihi, (h.tutar_kurus - h.iskonto_kurus)::bigint AS net_kurus
  FROM public.musteri_bakiye_hareket h
 WHERE h.tur = 'borc' AND h.tutar_kurus - h.iskonto_kurus > 0
   AND NOT EXISTS (SELECT 1 FROM public.fatura_kalem k WHERE k.hareket_id = h.id);
REVOKE ALL ON public.faturalanmamis_borc FROM anon, authenticated;
GRANT SELECT ON public.faturalanmamis_borc TO authenticated;

-- Seçili borç satırlarından (tek müşteri) fatura kuyruğu kaydı oluşturur. KDV dahil tutardan ayrıştırılır (yuvarlama kalem başına).
CREATE OR REPLACE FUNCTION public.fatura_olustur(p_hareket_idleri uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon', 'muhasebe']);
  v_musteri uuid;
  v_adet integer;
  v_bulunan integer;
  v_id uuid;
  v_toplam bigint := 0;
  v_kdv bigint := 0;
  r record;
  v_oran integer;
  v_net bigint;
BEGIN
  IF p_hareket_idleri IS NULL OR array_length(p_hareket_idleri, 1) IS NULL THEN
    RAISE EXCEPTION 'hareket_secilmedi';
  END IF;
  v_adet := array_length(p_hareket_idleri, 1);

  SELECT count(DISTINCT h.id), min(h.musteri_id::text)::uuid INTO v_bulunan, v_musteri
    FROM public.musteri_bakiye_hareket h
   WHERE h.id = ANY (p_hareket_idleri) AND h.isletme_id = v_isletme AND h.tur = 'borc' AND h.tutar_kurus - h.iskonto_kurus > 0;
  IF v_bulunan <> v_adet THEN
    RAISE EXCEPTION 'hareket_gecersiz';
  END IF;
  IF (SELECT count(DISTINCT h.musteri_id) FROM public.musteri_bakiye_hareket h WHERE h.id = ANY (p_hareket_idleri)) <> 1 THEN
    RAISE EXCEPTION 'birden_fazla_musteri';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fatura_kalem k WHERE k.hareket_id = ANY (p_hareket_idleri)) THEN
    RAISE EXCEPTION 'zaten_faturalanmis';
  END IF;

  INSERT INTO public.fatura (isletme_id, musteri_id, toplam_kurus) VALUES (v_isletme, v_musteri, 1) RETURNING id INTO v_id;

  FOR r IN
    SELECT h.id, h.aciklama, (h.tutar_kurus - h.iskonto_kurus) AS net, p.kdv_orani AS paket_kdv
      FROM public.musteri_bakiye_hareket h
      LEFT JOIN public.uyelik u ON u.id = h.uyelik_id
      LEFT JOIN public.uyelik_paketi p ON p.id = u.paket_id
     WHERE h.id = ANY (p_hareket_idleri)
  LOOP
    v_oran := coalesce(r.paket_kdv, 20);
    v_net := r.net;
    INSERT INTO public.fatura_kalem (fatura_id, isletme_id, hareket_id, aciklama, tutar_kurus, kdv_orani) VALUES (v_id, v_isletme, r.id, r.aciklama, v_net, v_oran);
    v_toplam := v_toplam + v_net;
    v_kdv := v_kdv + round(v_net::numeric * v_oran / (100 + v_oran))::bigint;
  END LOOP;

  UPDATE public.fatura SET toplam_kurus = v_toplam, kdv_kurus = v_kdv WHERE id = v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fatura_olustur(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fatura_olustur(uuid[]) TO authenticated;

-- Kuyruktaki (bekliyor/hata) faturayı iptal eder; kalemler silinir, borçlar yeniden faturalanabilir.
CREATE OR REPLACE FUNCTION public.fatura_iptal(p_id uuid, p_neden text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'muhasebe']);
  f public.fatura%ROWTYPE;
BEGIN
  IF nullif(btrim(p_neden), '') IS NULL THEN
    RAISE EXCEPTION 'iptal_nedeni_gerekli';
  END IF;
  SELECT * INTO f FROM public.fatura WHERE id = p_id AND isletme_id = v_isletme FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fatura_bulunamadi';
  END IF;
  IF f.durum NOT IN ('bekliyor', 'hata') THEN
    RAISE EXCEPTION 'fatura_durumu_uygun_degil';
  END IF;
  DELETE FROM public.fatura_kalem WHERE fatura_id = p_id;
  UPDATE public.fatura SET durum = 'iptal', iptal_nedeni = btrim(p_neden) WHERE id = p_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fatura_iptal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fatura_iptal(uuid, text) TO authenticated;

-- Entegrasyon sonucu (Paraşüt): yalnız service_role.
CREATE OR REPLACE FUNCTION public.fatura_durum_ayarla(p_id uuid, p_durum text, p_fatura_no text DEFAULT NULL, p_parasut_id text DEFAULT NULL, p_hata text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_durum NOT IN ('kesildi', 'hata') THEN
    RAISE EXCEPTION 'durum_gecersiz';
  END IF;
  UPDATE public.fatura
     SET durum = p_durum,
         fatura_no = CASE WHEN p_durum = 'kesildi' THEN p_fatura_no ELSE fatura_no END,
         parasut_id = coalesce(p_parasut_id, parasut_id),
         hata_mesaji = CASE WHEN p_durum = 'hata' THEN p_hata ELSE NULL END,
         kesim_zamani = CASE WHEN p_durum = 'kesildi' THEN now() ELSE kesim_zamani END
   WHERE id = p_id AND durum IN ('bekliyor', 'hata');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fatura_bulunamadi';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fatura_durum_ayarla(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fatura_durum_ayarla(uuid, text, text, text, text) TO service_role;

-- 8) Finans özeti [p_baslangic, p_bitis) ---------------------------------------------------------------------------------------
-- Yönetici ve muhasebe. Tutarlar kuruş. Dönem İstanbul takvim günüdür.
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
         coalesce(sum(tutar_kurus) FILTER (WHERE tur IN ('hakedis', 'prim')), 0)
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

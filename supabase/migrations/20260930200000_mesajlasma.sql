-- F11: Mesajlaşma (SMS / WhatsApp / Mail) ayarları, kuyruk ve merkez kredi aynası — klinikteki mesajlaşma modülünün fitness karşılığı.
-- (UYGULANMADI — önce 20260930190000 uygulanmış olmalı.)
--
-- Mimari (klinikle aynı):
--  * Tetikleyici KATALOĞU kodda sabittir (lib/mesaj/tetikleyiciler.ts). Veritabanı yalnız işletmenin katalog üstüne yazdığı ayarları
--    (mesaj_kurali) tutar; satır yoksa kural PASİF sayılır.
--  * Kuyruk aynı zamanda gönderim kaydıdır (mesaj_kuyrugu). Yazma yalnız sunucuda (service_role); kullanıcılar yalnız okur.
--  * Gönderim ve kredi düşümü Asistan Merkezi (mesaj.asistanmerkezi) tarafındadır. Yerelde yalnız merkezden dönen bakiye AYNASI tutulur;
--    yerelde kredi hesaplanmaz. Bakiye yalnız mesaj_kredi_senkronla ile ve versiyon guard'ıyla (eski yanıt yenisini ezemez) yazılır.
--  * Kredi yüklemeyi yalnız platform yöneticisi (super_admin) kaydeder; işletme yöneticisi kendi kredisini yazamaz.
--  * Tüm modül işletme yöneticisine kilitlidir (otomasyon ayarları + alıcı verisi).

-- 1) Kurallar --------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mesaj_kurali (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  tetikleyici_kodu text NOT NULL CHECK (char_length(btrim(tetikleyici_kodu)) > 0),
  aktif boolean NOT NULL DEFAULT false,
  sms_aktif boolean NOT NULL DEFAULT false,
  whatsapp_aktif boolean NOT NULL DEFAULT false,
  mail_aktif boolean NOT NULL DEFAULT false,
  mesaj_metni text NOT NULL DEFAULT '' CHECK (char_length(mesaj_metni) <= 1000),
  -- Zamanlanmış tetikleyiciler için: olaydan kaç dakika önce/sonra (ders hatırlatma: 1440 = 24 saat önce).
  zamanlama_offset_dakika integer CHECK (zamanlama_offset_dakika IS NULL OR zamanlama_offset_dakika BETWEEN 0 AND 43200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (isletme_id, tetikleyici_kodu)
);

DROP TRIGGER IF EXISTS trg_mesaj_kurali_updated_at ON public.mesaj_kurali;
CREATE TRIGGER trg_mesaj_kurali_updated_at
  BEFORE UPDATE ON public.mesaj_kurali
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_mesaj_kurali ON public.mesaj_kurali;
CREATE TRIGGER trg_audit_mesaj_kurali
  AFTER INSERT OR UPDATE ON public.mesaj_kurali
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.mesaj_kurali ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mesaj_kurali FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.mesaj_kurali TO authenticated;

DROP POLICY IF EXISTS "mesaj_kurali_select" ON public.mesaj_kurali;
CREATE POLICY "mesaj_kurali_select" ON public.mesaj_kurali FOR SELECT TO authenticated
  USING ((isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin') OR (SELECT public.is_super_admin()));
DROP POLICY IF EXISTS "mesaj_kurali_insert" ON public.mesaj_kurali;
CREATE POLICY "mesaj_kurali_insert" ON public.mesaj_kurali FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');
DROP POLICY IF EXISTS "mesaj_kurali_update" ON public.mesaj_kurali;
CREATE POLICY "mesaj_kurali_update" ON public.mesaj_kurali FOR UPDATE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');

-- 2) Kuyruk (= gönderim kaydı) -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mesaj_kuyrugu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  tetikleyici_kodu text NOT NULL,
  kanal text NOT NULL CHECK (kanal IN ('sms', 'whatsapp', 'mail')),
  alici_tipi text NOT NULL CHECK (alici_tipi IN ('musteri', 'personel')),
  alici_id uuid NOT NULL,
  alici_adres text NOT NULL,
  gonderilecek_metin text NOT NULL,
  durum text NOT NULL DEFAULT 'beklemede' CHECK (durum IN ('beklemede', 'gonderiliyor', 'gonderildi', 'hata', 'iptal')),
  planlanan_zaman timestamptz NOT NULL DEFAULT now(),
  gonderim_zamani timestamptz,
  deneme_sayisi integer NOT NULL DEFAULT 0,
  saglayici_mesaj_id text,
  hata_mesaji text,
  -- Aynı olay tekrar tetiklense de kuyruğa tek satır düşer; merkeze de Idempotency-Key olarak gider.
  idempotency_anahtari text NOT NULL UNIQUE,
  test_mi boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mesaj_kuyrugu_durum_zaman ON public.mesaj_kuyrugu (durum, planlanan_zaman);
CREATE INDEX IF NOT EXISTS idx_mesaj_kuyrugu_isletme ON public.mesaj_kuyrugu (isletme_id, created_at DESC);

ALTER TABLE public.mesaj_kuyrugu ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mesaj_kuyrugu FROM anon, authenticated;
GRANT SELECT ON public.mesaj_kuyrugu TO authenticated;
-- Yazma yetkisi YOK: yalnız service_role (RLS'i aşar).

DROP POLICY IF EXISTS "mesaj_kuyrugu_select" ON public.mesaj_kuyrugu;
CREATE POLICY "mesaj_kuyrugu_select" ON public.mesaj_kuyrugu FOR SELECT TO authenticated
  USING ((isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin') OR (SELECT public.is_super_admin()));

-- 3) Kredi aynası ve hareketleri ----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mesaj_kredi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  kanal text NOT NULL CHECK (kanal IN ('sms', 'whatsapp', 'mail')),
  bakiye integer NOT NULL DEFAULT 0 CHECK (bakiye >= 0),
  son_senkron_zamani timestamptz,
  merkez_bakiye_versiyonu bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (isletme_id, kanal)
);

CREATE TABLE IF NOT EXISTS public.mesaj_kredi_hareket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  kanal text NOT NULL CHECK (kanal IN ('sms', 'whatsapp', 'mail')),
  -- Yerelde yalnız yükleme yazılır; düşüm/iade merkezin kendi defterindedir.
  tip text NOT NULL DEFAULT 'yukleme' CHECK (tip = 'yukleme'),
  miktar integer NOT NULL CHECK (miktar > 0),
  tutar_kurus bigint CHECK (tutar_kurus IS NULL OR tutar_kurus >= 0),
  aciklama text,
  olusturan_kullanici_id uuid REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mesaj_kredi_hareket ON public.mesaj_kredi_hareket (isletme_id, kanal, created_at DESC);

DROP TRIGGER IF EXISTS trg_mesaj_kredi_updated_at ON public.mesaj_kredi;
CREATE TRIGGER trg_mesaj_kredi_updated_at
  BEFORE UPDATE ON public.mesaj_kredi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.mesaj_hareket_koru()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'defter_degismez';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mesaj_hareket_koru() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_mesaj_kredi_hareket_degismez ON public.mesaj_kredi_hareket;
CREATE TRIGGER trg_mesaj_kredi_hareket_degismez
  BEFORE UPDATE OR DELETE ON public.mesaj_kredi_hareket
  FOR EACH ROW EXECUTE FUNCTION public.mesaj_hareket_koru();

ALTER TABLE public.mesaj_kredi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesaj_kredi_hareket ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mesaj_kredi, public.mesaj_kredi_hareket FROM anon, authenticated;
GRANT SELECT ON public.mesaj_kredi, public.mesaj_kredi_hareket TO authenticated;

DROP POLICY IF EXISTS "mesaj_kredi_select" ON public.mesaj_kredi;
CREATE POLICY "mesaj_kredi_select" ON public.mesaj_kredi FOR SELECT TO authenticated
  USING ((isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin') OR (SELECT public.is_super_admin()));
DROP POLICY IF EXISTS "mesaj_kredi_hareket_select" ON public.mesaj_kredi_hareket;
CREATE POLICY "mesaj_kredi_hareket_select" ON public.mesaj_kredi_hareket FOR SELECT TO authenticated
  USING ((isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin') OR (SELECT public.is_super_admin()));

-- 4) Fonksiyonlar ---------------------------------------------------------------------------------------------------
-- Kredi yükleme kaydı: YALNIZ platform yöneticisi. (Ödeme doğrulaması merkez tarafında ayrıca yapılmalıdır.)
CREATE OR REPLACE FUNCTION public.mesaj_kredi_yukle(p_isletme_id uuid, p_kanal text, p_miktar integer, p_tutar_kurus bigint DEFAULT NULL, p_aciklama text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT coalesce(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'yetki_yetersiz';
  END IF;
  IF p_kanal NOT IN ('sms', 'whatsapp', 'mail') THEN
    RAISE EXCEPTION 'kanal_gecersiz';
  END IF;
  IF p_miktar IS NULL OR p_miktar <= 0 THEN
    RAISE EXCEPTION 'miktar_gecersiz';
  END IF;

  INSERT INTO public.mesaj_kredi (isletme_id, kanal, bakiye)
  VALUES (p_isletme_id, p_kanal, p_miktar)
  ON CONFLICT (isletme_id, kanal) DO UPDATE SET bakiye = public.mesaj_kredi.bakiye + EXCLUDED.bakiye;

  INSERT INTO public.mesaj_kredi_hareket (isletme_id, kanal, miktar, tutar_kurus, aciklama, olusturan_kullanici_id)
  VALUES (p_isletme_id, p_kanal, p_miktar, p_tutar_kurus, nullif(btrim(p_aciklama), ''), auth.uid());
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mesaj_kredi_yukle(uuid, text, integer, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mesaj_kredi_yukle(uuid, text, integer, bigint, text) TO authenticated;

-- Merkezden dönen (bakiye, versiyon) çiftini yazar, hesaplamaz. Versiyon guard'ı tek ifadede atomiktir: gecikmiş/sıra dışı bir yanıt
-- daha yeni bir versiyonu ezemez. Yalnız service_role çağırabilir (kuyruk işleyici ve kredi senkron işi).
CREATE OR REPLACE FUNCTION public.mesaj_kredi_senkronla(p_isletme_id uuid, p_kanal text, p_bakiye integer, p_versiyon bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_kanal NOT IN ('sms', 'whatsapp', 'mail') THEN
    RAISE EXCEPTION 'kanal_gecersiz';
  END IF;
  IF p_bakiye IS NULL OR p_bakiye < 0 OR p_versiyon IS NULL THEN
    RAISE EXCEPTION 'senkron_degeri_gecersiz';
  END IF;

  INSERT INTO public.mesaj_kredi (isletme_id, kanal, bakiye, son_senkron_zamani, merkez_bakiye_versiyonu)
  VALUES (p_isletme_id, p_kanal, p_bakiye, now(), p_versiyon)
  ON CONFLICT (isletme_id, kanal) DO UPDATE
    SET bakiye = EXCLUDED.bakiye,
        son_senkron_zamani = EXCLUDED.son_senkron_zamani,
        merkez_bakiye_versiyonu = EXCLUDED.merkez_bakiye_versiyonu
    WHERE public.mesaj_kredi.merkez_bakiye_versiyonu < EXCLUDED.merkez_bakiye_versiyonu;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mesaj_kredi_senkronla(uuid, text, integer, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mesaj_kredi_senkronla(uuid, text, integer, bigint) TO service_role;

-- Bir müşterinin ticari elektronik ileti izni (en son onam kaydı "verildi" ise true). Yalnız service_role (mesaj gönderimi sunucuda).
CREATE OR REPLACE FUNCTION public.musteri_ticari_izin(p_musteri_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT o.verildi FROM public.musteri_onam o WHERE o.musteri_id = p_musteri_id AND o.tur = 'ticari_ileti' ORDER BY o.created_at DESC, o.id DESC LIMIT 1), false);
$$;
REVOKE EXECUTE ON FUNCTION public.musteri_ticari_izin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.musteri_ticari_izin(uuid) TO service_role;

-- 5) Zamanlanmış tarama yardımcıları (yalnız service_role; günlük cron işi kullanır) --------------------------------------
-- Bugün doğum günü olan aktif müşteriler (29 Şubat doğumlular artık olmayan yıllarda 28 Şubat'ta kutlanır).
CREATE OR REPLACE FUNCTION public.mesaj_dogum_gunu_musterileri(p_isletme_id uuid, p_tarih date)
RETURNS TABLE (id uuid, ad_soyad text, telefon text, eposta text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.id, m.ad_soyad, m.telefon, m.eposta
    FROM public.musteri m
   WHERE m.isletme_id = p_isletme_id AND m.aktif AND m.dogum_tarihi IS NOT NULL
     AND (
       (extract(month FROM m.dogum_tarihi) = extract(month FROM p_tarih) AND extract(day FROM m.dogum_tarihi) = extract(day FROM p_tarih))
       OR (extract(month FROM m.dogum_tarihi) = 2 AND extract(day FROM m.dogum_tarihi) = 29
           AND extract(month FROM p_tarih) = 2 AND extract(day FROM p_tarih) = 28
           AND (extract(year FROM p_tarih)::integer % 4 <> 0 OR (extract(year FROM p_tarih)::integer % 100 = 0 AND extract(year FROM p_tarih)::integer % 400 <> 0)))
     );
$$;
REVOKE EXECUTE ON FUNCTION public.mesaj_dogum_gunu_musterileri(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mesaj_dogum_gunu_musterileri(uuid, date) TO service_role;

-- Son kabul edilen girişinden TAM p_gun gün sonra olan (o günden beri hiç girişi olmayan) aktif müşteriler.
-- "Tam gün" eşleşmesi günlük taramada her müşteriye tek hatırlatma düşmesini sağlar. Dönüş: son giriş tarihi de gelir (anahtar için).
CREATE OR REPLACE FUNCTION public.mesaj_ozledik_musterileri(p_isletme_id uuid, p_bugun date, p_gun integer)
RETURNS TABLE (id uuid, ad_soyad text, telefon text, eposta text, son_giris date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.id, m.ad_soyad, m.telefon, m.eposta, s.son_giris
    FROM public.musteri m
    JOIN LATERAL (
      SELECT max(g.giris_tarihi) AS son_giris
        FROM public.giris_kaydi g
       WHERE g.musteri_id = m.id AND g.sonuc = 'kabul' AND NOT g.iptal
    ) s ON s.son_giris IS NOT NULL
   WHERE m.isletme_id = p_isletme_id AND m.aktif AND s.son_giris = p_bugun - p_gun;
$$;
REVOKE EXECUTE ON FUNCTION public.mesaj_ozledik_musterileri(uuid, date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mesaj_ozledik_musterileri(uuid, date, integer) TO service_role;

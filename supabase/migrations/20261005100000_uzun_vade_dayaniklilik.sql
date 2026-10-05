-- Uzun vade dayanıklılık düzeltmeleri (proje geneli inceleme, 2026-10-05). İdempotent tek blok; önce 20261004100000 uygulanmış olmalı.
--  1) audit_log bölümü: cron aksarsa o ayın satırları DEFAULT bölüme düşer; sonra o ayın bölümünü açmak Postgres'te HATA verir
--     ("default partition would be violated") ve cron her gün 500 döner. Fonksiyon artık satırları yeni bölüme taşıyarak açar.
--  2) mesaj_kuyrugu.sahiplenme_zamani: gönderim sırasında süreç ölürse (zaman aşımı, deploy) satır 'gonderiliyor'da kalıyordu;
--     sahiplenme zamanı sayesinde işleyici takılan satırları yeniden kuyruğa alır (merkez Idempotency-Key ile çift gönderimi önler).
--  3) kullanici: UPDATE yetkisi yalnız uygulamanın yazdığı kolonlara daraltılır (id/isletme_id/created_at doğrudan değiştirilemez).

-- 1) audit_log bölümü: DEFAULT'taki satırları taşıyarak oluştur ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_log_bolum_olustur(p_ay date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_baslangic timestamptz := (date_trunc('month', p_ay)::timestamp AT TIME ZONE 'Europe/Istanbul');
  v_bitis timestamptz := ((date_trunc('month', p_ay) + interval '1 month')::timestamp AT TIME ZONE 'Europe/Istanbul');
  v_ad text := format('audit_log_y%sm%s', to_char(p_ay, 'YYYY'), to_char(p_ay, 'MM'));
BEGIN
  IF to_regclass('public.' || v_ad) IS NOT NULL THEN
    RETURN v_ad;
  END IF;

  IF EXISTS (SELECT 1 FROM public.audit_log_varsayilan WHERE created_at >= v_baslangic AND created_at < v_bitis) THEN
    -- Bölüm geç açılıyor: önce bağımsız tablo, satırlar DEFAULT'tan taşınır, sonra bölüm olarak bağlanır (aynı işlemde, atomik).
    EXECUTE format('CREATE TABLE public.%I (LIKE public.audit_log INCLUDING DEFAULTS INCLUDING CONSTRAINTS)', v_ad);
    EXECUTE format(
      'WITH tasinan AS (DELETE FROM public.audit_log_varsayilan WHERE created_at >= %L AND created_at < %L RETURNING *)
       INSERT INTO public.%I SELECT * FROM tasinan',
      v_baslangic, v_bitis, v_ad
    );
    EXECUTE format('ALTER TABLE public.audit_log ATTACH PARTITION public.%I FOR VALUES FROM (%L) TO (%L)', v_ad, v_baslangic, v_bitis);
  ELSE
    EXECUTE format(
      'CREATE TABLE public.%I PARTITION OF public.audit_log FOR VALUES FROM (%L) TO (%L)',
      v_ad, v_baslangic, v_bitis
    );
  END IF;
  -- Bölüme DOĞRUDAN erişim üst tablonun RLS'ini atlar: bölüm kapatılır (yalnız üst tablo okunur).
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_ad);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v_ad);
  RETURN v_ad;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_log_bolum_olustur(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_log_bolum_olustur(date) TO service_role;

-- 2) Mesaj kuyruğu: sahiplenme zamanı ------------------------------------------------------------------------------------------------
ALTER TABLE public.mesaj_kuyrugu ADD COLUMN IF NOT EXISTS sahiplenme_zamani timestamptz;
CREATE INDEX IF NOT EXISTS idx_mesaj_kuyrugu_gonderiliyor ON public.mesaj_kuyrugu (sahiplenme_zamani) WHERE durum = 'gonderiliyor';

-- 3) kullanici: kolon bazlı UPDATE yetkisi --------------------------------------------------------------------------------------------
-- Yeni bir kolonu uygulama doğrudan güncelleyecekse buraya eklenmelidir (eklenmezse güncelleme "permission denied" ile güvenli başarısız olur).
REVOKE UPDATE ON public.kullanici FROM authenticated;
GRANT UPDATE (ad_soyad, rol, aktif, pozisyon_id) ON public.kullanici TO authenticated;

-- 4) audit_log saklama süresi: süresi dolan AY BÖLÜMLERİ bütünüyle kaldırılır (satır satır DELETE yok, tablo şişmez) --------------
-- Süre kararı avukata aittir; cron yalnız AUDIT_LOG_SAKLAMA_AY tanımlıysa çağırır. 12 aydan kısa süre reddedilir (yanlış ayara karşı).
CREATE OR REPLACE FUNCTION public.audit_log_eski_bolumleri_kaldir(p_saklama_ay integer)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Sınır ayı: bu ayın başından p_saklama_ay ay öncesi. Bu aydan ÖNCEKİ bölümler silinir (sınır ayı ve sonrası kalır).
  v_sinir_ay date := (date_trunc('month', public.bugun_istanbul()) - make_interval(months => p_saklama_ay))::date;
  v_sinir timestamptz := (v_sinir_ay::timestamp AT TIME ZONE 'Europe/Istanbul');
  v_bolum record;
  v_silinen text[] := '{}';
BEGIN
  IF p_saklama_ay IS NULL OR p_saklama_ay < 12 THEN
    RAISE EXCEPTION 'saklama_suresi_gecersiz';
  END IF;

  FOR v_bolum IN
    SELECT c.relname AS ad,
           make_date(substr(c.relname, 12, 4)::int, substr(c.relname, 17, 2)::int, 1) AS ay
      FROM pg_catalog.pg_inherits i
      JOIN pg_catalog.pg_class c ON c.oid = i.inhrelid
     WHERE i.inhparent = 'public.audit_log'::regclass
       AND c.relname ~ '^audit_log_y[0-9]{4}m[0-9]{2}$'
  LOOP
    IF v_bolum.ay < v_sinir_ay THEN
      EXECUTE format('DROP TABLE public.%I', v_bolum.ad);
      v_silinen := v_silinen || v_bolum.ad;
    END IF;
  END LOOP;

  -- Cron aksadığı dönemde DEFAULT bölüme düşmüş eski satırlar.
  DELETE FROM public.audit_log_varsayilan WHERE created_at < v_sinir;
  RETURN v_silinen;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_log_eski_bolumleri_kaldir(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_log_eski_bolumleri_kaldir(integer) TO service_role;

-- 5) Müşteri araması: trigram indeksi ---------------------------------------------------------------------------------------------
-- musteri_ara `arama_metni LIKE '%sorgu%'` kullanır; B-tree bu kalıpta işe yaramaz, her aramada işletmenin tüm müşterileri taranırdı.
-- GIN trigram indeksi 3+ karakterli sorgularda doğrudan eşleşenleri bulur (daha kısa sorgu taramaya düşer, sonuç değişmez).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS idx_musteri_arama_trgm ON public.musteri USING gin (arama_metni extensions.gin_trgm_ops);

-- 6) Cron çalışma kaydı (sağlık kontrolü /api/saglik için) ---------------------------------------------------------------------------
-- Tenant verisi değildir, isletme_id yoktur: yalnız service_role okur/yazar (RLS açık, policy yok = authenticated hiçbir şey göremez).
CREATE TABLE IF NOT EXISTS public.cron_calisma (
  ad text PRIMARY KEY,
  son_baslangic timestamptz,
  son_bitis timestamptz,
  son_basarili timestamptz,
  son_hata text
);
ALTER TABLE public.cron_calisma ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cron_calisma FROM anon, authenticated;

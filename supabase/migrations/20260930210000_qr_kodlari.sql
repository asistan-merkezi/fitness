-- F12: QR kodları — herkese açık müşteri ön kayıt ve anket formları için işletme kısa kodu, aç/kapa ayarı, hız sınırı,
-- ön kayıt kuyruğu ve anket yanıtları. (UYGULANMADI — önce 20260930200000 uygulanmış olmalı.)
--
-- Güvenlik ilkeleri (klinikten farkı: anonim role HİÇ tablo/fonksiyon yetkisi verilmez):
--  * Herkese açık sayfalar sunucuda service_role ile yazar; bunun öncesinde hız sınırı ve "QR aktif mi" kontrolü yapılır.
--  * Ön kayıt doğrudan müşteri AÇMAZ: kuyruğa düşer, resepsiyon/yönetici onaylayınca müşteri oluşur (spam ve sahte kayıt engeli).
--    Yalnız 18 yaş ve üzeri kendi adına başvurabilir; 18 yaş altı için resepsiyona yönlendirilir (veli akışı panelde).
--  * Onaylanmayan/reddedilen ön kayıtlar 30 gün sonra silinir (KVKK saklama süresini kısa tutar).
--  * Kısa kod yalnız platform yöneticisi değiştirebilir; işletme yöneticisi sızan kodu yenileyebilir (basılı QR'lar geçersiz olur).

-- 1) İşletme kısa kodu ---------------------------------------------------------------------------------------------
ALTER TABLE public.isletme ADD COLUMN IF NOT EXISTS qr_kisa_kod text;

-- 0/O, 1/l/I gibi karışabilen karakterler bilinçli yok (elle kopyalanıp paylaşılırken okunabilirlik).
CREATE OR REPLACE FUNCTION public.qr_kisa_kod_uret()
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  alfabe text := '23456789abcdefghjkmnpqrstuvwxyz';
  kod text;
BEGIN
  LOOP
    kod := '';
    FOR i IN 1..8 LOOP
      kod := kod || substr(alfabe, floor(random() * length(alfabe) + 1)::integer, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.isletme WHERE qr_kisa_kod = kod);
  END LOOP;
  RETURN kod;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.qr_kisa_kod_uret() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.qr_kisa_kod_varsayilan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.qr_kisa_kod IS NULL THEN
    NEW.qr_kisa_kod := public.qr_kisa_kod_uret();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.qr_kisa_kod_varsayilan() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_isletme_qr_kisa_kod ON public.isletme;
CREATE TRIGGER trg_isletme_qr_kisa_kod
  BEFORE INSERT ON public.isletme
  FOR EACH ROW EXECUTE FUNCTION public.qr_kisa_kod_varsayilan();

UPDATE public.isletme SET qr_kisa_kod = public.qr_kisa_kod_uret() WHERE qr_kisa_kod IS NULL;
ALTER TABLE public.isletme ALTER COLUMN qr_kisa_kod SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_isletme_qr_kisa_kod ON public.isletme (qr_kisa_kod);
ALTER TABLE public.isletme DROP CONSTRAINT IF EXISTS isletme_qr_kisa_kod_kurali;
ALTER TABLE public.isletme ADD CONSTRAINT isletme_qr_kisa_kod_kurali CHECK (qr_kisa_kod ~ '^[a-z2-9]{8}$');

-- Kısa kod doğrudan UPDATE ile değiştirilemez (yalnız platform yöneticisi / service_role); yönetici için aşağıdaki RPC vardır.
CREATE OR REPLACE FUNCTION public.isletme_koruma()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan OR NEW.aktif IS DISTINCT FROM OLD.aktif THEN
    RAISE EXCEPTION 'yetki_yetersiz';
  END IF;
  -- Kısa kod: kullanıcı rolüyle (authenticated/anon) doğrudan UPDATE yasak. SECURITY DEFINER fonksiyon (qr_kisa_kod_yenile) kendi
  -- sahibi rolüyle çalıştığı için geçer; böylece değişiklik yalnız o kontrollü yoldan yapılabilir.
  IF NEW.qr_kisa_kod IS DISTINCT FROM OLD.qr_kisa_kod AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'yetki_yetersiz';
  END IF;
  RETURN NEW;
END;
$$;

-- Sızan / istenmeyen kodu yeniler; eski kodlu tüm basılı QR'lar geçersiz olur. Dönüş: yeni kod.
CREATE OR REPLACE FUNCTION public.qr_kisa_kod_yenile()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  v_kod text := public.qr_kisa_kod_uret();
BEGIN
  UPDATE public.isletme SET qr_kisa_kod = v_kod WHERE id = v_isletme;
  RETURN v_kod;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.qr_kisa_kod_yenile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qr_kisa_kod_yenile() TO authenticated;

-- 2) QR aç/kapa ayarı -----------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qr_kod_ayar (
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  tip text NOT NULL CHECK (tip IN ('musteri_on_kayit', 'anket', 'puantaj_giris', 'puantaj_cikis')),
  aktif boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (isletme_id, tip)
);
DROP TRIGGER IF EXISTS trg_qr_kod_ayar_updated_at ON public.qr_kod_ayar;
CREATE TRIGGER trg_qr_kod_ayar_updated_at BEFORE UPDATE ON public.qr_kod_ayar FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.qr_kod_ayar ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qr_kod_ayar FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.qr_kod_ayar TO authenticated;
DROP POLICY IF EXISTS "qr_ayar_select" ON public.qr_kod_ayar;
CREATE POLICY "qr_ayar_select" ON public.qr_kod_ayar FOR SELECT TO authenticated
  USING ((isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin') OR (SELECT public.is_super_admin()));
DROP POLICY IF EXISTS "qr_ayar_insert" ON public.qr_kod_ayar;
CREATE POLICY "qr_ayar_insert" ON public.qr_kod_ayar FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');
DROP POLICY IF EXISTS "qr_ayar_update" ON public.qr_kod_ayar;
CREATE POLICY "qr_ayar_update" ON public.qr_kod_ayar FOR UPDATE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');

-- 3) Hız sınırı (herkese açık uçlar için; sabit pencereli sayaç) ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hiz_siniri_sayac (
  anahtar text NOT NULL,
  pencere_baslangic timestamptz NOT NULL,
  sayac integer NOT NULL DEFAULT 0,
  PRIMARY KEY (anahtar, pencere_baslangic)
);
ALTER TABLE public.hiz_siniri_sayac ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hiz_siniri_sayac FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS hiz_siniri_sayac_pencere_idx ON public.hiz_siniri_sayac (pencere_baslangic);

-- p_artir = true: sayacı 1 artırır, limit aşılmadıysa true döner. p_artir = false: yalnız okur; sayaç < limit ise true.
-- YALNIZ service_role: anon'a açık olsaydı rastgele anahtarlarla meşru kullanıcının sayacı doldurulabilirdi.
CREATE OR REPLACE FUNCTION public.hiz_siniri_kullan(p_anahtar text, p_limit integer, p_pencere_sn integer, p_artir boolean DEFAULT true)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pencere timestamptz;
  v_sayac integer;
BEGIN
  IF p_anahtar IS NULL OR length(p_anahtar) > 200 OR p_limit < 1 OR p_pencere_sn < 1 THEN
    RAISE EXCEPTION 'hiz_siniri_parametre_gecersiz';
  END IF;

  v_pencere := to_timestamp(floor(extract(epoch FROM now()) / p_pencere_sn) * p_pencere_sn);

  IF p_artir THEN
    INSERT INTO public.hiz_siniri_sayac (anahtar, pencere_baslangic, sayac)
    VALUES (p_anahtar, v_pencere, 1)
    ON CONFLICT (anahtar, pencere_baslangic) DO UPDATE SET sayac = public.hiz_siniri_sayac.sayac + 1
    RETURNING sayac INTO v_sayac;

    -- Fırsatçı temizlik (~%1 çağrıda): ayrı bir işe gerek kalmadan tablo şişmez.
    IF random() < 0.01 THEN
      DELETE FROM public.hiz_siniri_sayac WHERE pencere_baslangic < now() - interval '2 days';
    END IF;
    RETURN v_sayac <= p_limit;
  END IF;

  SELECT sayac INTO v_sayac FROM public.hiz_siniri_sayac WHERE anahtar = p_anahtar AND pencere_baslangic = v_pencere;
  RETURN coalesce(v_sayac, 0) < p_limit;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.hiz_siniri_kullan(text, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hiz_siniri_kullan(text, integer, integer, boolean) TO service_role;

-- 4) Müşteri ön kaydı (QR) ----------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.musteri_on_kayit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  ad_soyad text NOT NULL CHECK (char_length(btrim(ad_soyad)) BETWEEN 2 AND 100),
  telefon text NOT NULL CHECK (telefon ~ '^\+90[0-9]{10}$'),
  eposta text CHECK (eposta IS NULL OR eposta ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  dogum_tarihi date CHECK (dogum_tarihi IS NULL OR dogum_tarihi >= DATE '1900-01-01'),
  -- KVKK aydınlatma bildirimi okunmadan kayıt alınmaz.
  kvkk_aydinlatma_verildi boolean NOT NULL CHECK (kvkk_aydinlatma_verildi),
  ticari_ileti_izni boolean NOT NULL DEFAULT false,
  metin_versiyonu text NOT NULL CHECK (char_length(btrim(metin_versiyonu)) > 0),
  durum text NOT NULL DEFAULT 'beklemede' CHECK (durum IN ('beklemede', 'onaylandi', 'reddedildi')),
  musteri_id uuid REFERENCES public.musteri(id) ON DELETE SET NULL,
  red_nedeni text,
  sonuclandiran_kullanici_id uuid REFERENCES public.kullanici(id) ON DELETE SET NULL,
  sonuclandirma_zamani timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Aynı telefondan bekleyen tek ön kayıt olur (aynı formun tekrar gönderilmesi yığılma yapmaz).
CREATE UNIQUE INDEX IF NOT EXISTS uq_on_kayit_bekleyen ON public.musteri_on_kayit (isletme_id, telefon) WHERE durum = 'beklemede';
CREATE INDEX IF NOT EXISTS idx_on_kayit_isletme ON public.musteri_on_kayit (isletme_id, durum, created_at DESC);

DROP TRIGGER IF EXISTS trg_audit_on_kayit ON public.musteri_on_kayit;
CREATE TRIGGER trg_audit_on_kayit AFTER INSERT OR UPDATE ON public.musteri_on_kayit FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.musteri_on_kayit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.musteri_on_kayit FROM anon, authenticated;
GRANT SELECT ON public.musteri_on_kayit TO authenticated;
-- Yazma yetkisi YOK: ekleme yalnız service_role (herkese açık form), sonuçlandırma yalnız aşağıdaki fonksiyon.
DROP POLICY IF EXISTS "on_kayit_select" ON public.musteri_on_kayit;
CREATE POLICY "on_kayit_select" ON public.musteri_on_kayit FOR SELECT TO authenticated
  USING ((isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon')) OR (SELECT public.is_super_admin()));

-- Ön kaydı onaylandı (müşteri oluşturulduktan sonra) veya reddedildi olarak kapatır. Yalnız bekleyen kayıt sonuçlanır.
CREATE OR REPLACE FUNCTION public.on_kayit_sonuclandir(p_id uuid, p_durum text, p_musteri_id uuid DEFAULT NULL, p_red_nedeni text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon']);
  k public.musteri_on_kayit%ROWTYPE;
BEGIN
  IF p_durum NOT IN ('onaylandi', 'reddedildi') THEN
    RAISE EXCEPTION 'durum_gecersiz';
  END IF;
  SELECT * INTO k FROM public.musteri_on_kayit WHERE id = p_id AND isletme_id = v_isletme FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'on_kayit_bulunamadi';
  END IF;
  IF k.durum <> 'beklemede' THEN
    RAISE EXCEPTION 'on_kayit_sonuclanmis';
  END IF;

  IF p_durum = 'onaylandi' THEN
    IF p_musteri_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.musteri WHERE id = p_musteri_id AND isletme_id = v_isletme) THEN
      RAISE EXCEPTION 'musteri_bulunamadi';
    END IF;
  END IF;

  UPDATE public.musteri_on_kayit
     SET durum = p_durum,
         musteri_id = CASE WHEN p_durum = 'onaylandi' THEN p_musteri_id ELSE NULL END,
         red_nedeni = CASE WHEN p_durum = 'reddedildi' THEN nullif(btrim(p_red_nedeni), '') ELSE NULL END,
         sonuclandiran_kullanici_id = auth.uid(),
         sonuclandirma_zamani = now()
   WHERE id = p_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.on_kayit_sonuclandir(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.on_kayit_sonuclandir(uuid, text, uuid, text) TO authenticated;

-- KVKK saklama: sonuçlanmamış (beklemede) ve reddedilen ön kayıtlar p_gun günden eski ise silinir. Günlük bakım işi çağırır.
CREATE OR REPLACE FUNCTION public.on_kayit_temizle(p_gun integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_adet integer;
BEGIN
  IF p_gun IS NULL OR p_gun < 1 THEN
    RAISE EXCEPTION 'gun_gecersiz';
  END IF;
  DELETE FROM public.musteri_on_kayit WHERE durum IN ('beklemede', 'reddedildi') AND created_at < now() - make_interval(days => p_gun);
  GET DIAGNOSTICS v_adet = ROW_COUNT;
  RETURN v_adet;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.on_kayit_temizle(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.on_kayit_temizle(integer) TO service_role;

-- 5) Anket yanıtları --------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.anket_yaniti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  puan smallint NOT NULL CHECK (puan BETWEEN 1 AND 5),
  oneri text CHECK (oneri IS NULL OR char_length(oneri) <= 1000),
  -- Kimlik bilgisi isteğe bağlıdır (anonim yanıt mümkündür).
  ad_soyad text CHECK (ad_soyad IS NULL OR char_length(btrim(ad_soyad)) BETWEEN 2 AND 100),
  telefon text CHECK (telefon IS NULL OR telefon ~ '^\+90[0-9]{10}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_anket_isletme ON public.anket_yaniti (isletme_id, created_at DESC);

ALTER TABLE public.anket_yaniti ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.anket_yaniti FROM anon, authenticated;
GRANT SELECT ON public.anket_yaniti TO authenticated;
DROP POLICY IF EXISTS "anket_select" ON public.anket_yaniti;
CREATE POLICY "anket_select" ON public.anket_yaniti FOR SELECT TO authenticated
  USING ((isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon')) OR (SELECT public.is_super_admin()));

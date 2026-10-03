-- Personel listesinden tek tıkla Giriş / Çıkış (klinikteki hizliPuantajKaydet). Yalnız yönetici; BUGÜN (İstanbul) için.
--  * Giriş: günün kaydı yoksa 'geldi' olarak açılır; kayıt var ve girişi yoksa giriş eklenir (durum 'geldi' olur). Girişi olan güne ikinci giriş yazılmaz.
--  * Çıkış: önce giriş gerekir; çıkışı olan güne ikinci çıkış yazılmaz; çıkış girişten sonra olmalıdır.
--  Mevcut kaydı sessizce ezmez (yanlışlıkla iki tıklama); düzeltme Puantaj Cetveli'nden yapılır. Hakedişi kapanmış ay ve onaylı izin günü reddedilir.
CREATE OR REPLACE FUNCTION public.personel_puantaj_hizli(p_kullanici_id uuid, p_tur text, p_saat time)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin']);
  v_bugun date := public.bugun_istanbul();
  v_mevcut public.personel_puantaj%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_tur IS NULL OR p_tur NOT IN ('giris', 'cikis') OR p_saat IS NULL THEN
    RAISE EXCEPTION 'puantaj_hizli_gecersiz';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kullanici WHERE id = p_kullanici_id AND isletme_id = v_isletme AND rol <> 'super_admin') THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;
  IF public.puantaj_donem_kapali_mi(v_isletme, p_kullanici_id, v_bugun) THEN
    RAISE EXCEPTION 'puantaj_donem_kapali';
  END IF;
  IF public.izin_var_mi(p_kullanici_id, v_bugun) THEN
    RAISE EXCEPTION 'puantaj_izinli_gun';
  END IF;

  SELECT * INTO v_mevcut FROM public.personel_puantaj WHERE kullanici_id = p_kullanici_id AND tarih = v_bugun;

  IF p_tur = 'giris' THEN
    IF FOUND AND v_mevcut.giris_saati IS NOT NULL THEN
      RAISE EXCEPTION 'puantaj_giris_var';
    END IF;
    IF FOUND AND v_mevcut.cikis_saati IS NOT NULL AND p_saat >= v_mevcut.cikis_saati THEN
      RAISE EXCEPTION 'puantaj_saat_gecersiz';
    END IF;
    IF FOUND THEN
      UPDATE public.personel_puantaj SET giris_saati = p_saat, durum = 'geldi', kaydeden_kullanici_id = auth.uid() WHERE id = v_mevcut.id RETURNING id INTO v_id;
    ELSE
      INSERT INTO public.personel_puantaj (isletme_id, kullanici_id, tarih, durum, giris_saati)
      VALUES (v_isletme, p_kullanici_id, v_bugun, 'geldi', p_saat) RETURNING id INTO v_id;
    END IF;
  ELSE
    IF NOT FOUND OR v_mevcut.giris_saati IS NULL THEN
      RAISE EXCEPTION 'puantaj_giris_yok';
    END IF;
    IF v_mevcut.cikis_saati IS NOT NULL THEN
      RAISE EXCEPTION 'puantaj_cikis_var';
    END IF;
    IF p_saat <= v_mevcut.giris_saati THEN
      RAISE EXCEPTION 'puantaj_saat_gecersiz';
    END IF;
    UPDATE public.personel_puantaj SET cikis_saati = p_saat, kaydeden_kullanici_id = auth.uid() WHERE id = v_mevcut.id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_puantaj_hizli(uuid, text, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personel_puantaj_hizli(uuid, text, time) TO authenticated;

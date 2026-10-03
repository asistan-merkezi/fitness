-- Personel KENDİ giriş/çıkışını kendi sistem hesabıyla yapar (ayrı PIN/şifre YOK): oturum açmış kişi, kendi adına BUGÜNÜN puantajını yazar.
-- Saat istemciden alınmaz: sunucunun İstanbul saati (dakikaya yuvarlı) kullanılır; böylece kişi kendi saatini değiştiremez.
-- Kurallar yönetici kısayoluyla (personel_puantaj_hizli) aynıdır: girişi olana ikinci giriş yok, çıkış için önce giriş, çıkış girişten sonra;
-- hakedişi kapanmış ay ve onaylı izin günü reddedilir; mevcut kayıt ezilmez (düzeltme yönetici Puantaj Cetveli'nden).
-- Kişi yalnız KENDİ satırını yazar (auth.uid()); başka birinin kimliği parametre olarak alınmaz.
CREATE OR REPLACE FUNCTION public.personel_puantaj_kendi(p_tur text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon', 'muhasebe', 'antrenor']);
  v_kisi uuid := auth.uid();
  v_bugun date := public.bugun_istanbul();
  v_saat time := date_trunc('minute', now() AT TIME ZONE 'Europe/Istanbul')::time;
  v_mevcut public.personel_puantaj%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_tur IS NULL OR p_tur NOT IN ('giris', 'cikis') THEN
    RAISE EXCEPTION 'puantaj_hizli_gecersiz';
  END IF;
  IF public.puantaj_donem_kapali_mi(v_isletme, v_kisi, v_bugun) THEN
    RAISE EXCEPTION 'puantaj_donem_kapali';
  END IF;
  IF public.izin_var_mi(v_kisi, v_bugun) THEN
    RAISE EXCEPTION 'puantaj_izinli_gun';
  END IF;

  SELECT * INTO v_mevcut FROM public.personel_puantaj WHERE kullanici_id = v_kisi AND tarih = v_bugun;

  IF p_tur = 'giris' THEN
    IF FOUND AND v_mevcut.giris_saati IS NOT NULL THEN
      RAISE EXCEPTION 'puantaj_giris_var';
    END IF;
    IF FOUND AND v_mevcut.cikis_saati IS NOT NULL AND v_saat >= v_mevcut.cikis_saati THEN
      RAISE EXCEPTION 'puantaj_saat_gecersiz';
    END IF;
    IF FOUND THEN
      UPDATE public.personel_puantaj SET giris_saati = v_saat, durum = 'geldi', kaydeden_kullanici_id = v_kisi WHERE id = v_mevcut.id RETURNING id INTO v_id;
    ELSE
      INSERT INTO public.personel_puantaj (isletme_id, kullanici_id, tarih, durum, giris_saati, kaydeden_kullanici_id)
      VALUES (v_isletme, v_kisi, v_bugun, 'geldi', v_saat, v_kisi) RETURNING id INTO v_id;
    END IF;
  ELSE
    IF NOT FOUND OR v_mevcut.giris_saati IS NULL THEN
      RAISE EXCEPTION 'puantaj_giris_yok';
    END IF;
    IF v_mevcut.cikis_saati IS NOT NULL THEN
      RAISE EXCEPTION 'puantaj_cikis_var';
    END IF;
    IF v_saat <= v_mevcut.giris_saati THEN
      RAISE EXCEPTION 'puantaj_saat_gecersiz';
    END IF;
    UPDATE public.personel_puantaj SET cikis_saati = v_saat, kaydeden_kullanici_id = v_kisi WHERE id = v_mevcut.id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.personel_puantaj_kendi(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personel_puantaj_kendi(text) TO authenticated;

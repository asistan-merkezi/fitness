-- Gelirler Takibi (klinik düzeni): fatura öncesi müşteri bilgisi kontrolü + cari alacak özeti.
--  * Fatura (e-Arşiv) için müşterinin e-postası, T.C. kimlik numarası ve adresi (il, ilçe, açık adres) zorunludur. Kontrol
--    fatura_olustur içinde SUNUCUDA zorlanır; eksikse 'fatura_bilgisi_eksik' döner. fatura_bilgi_eksikleri yalnız EKSİK ALAN ADLARINI
--    verir (değerleri değil): muhasebe kişisel veriyi görmeden "şu bilgiler eksik" uyarısı alabilir.
--  * musteri_fatura_bilgisi_tamamla: yalnız GÖNDERİLEN alanları yazar (diğer kimlik/adres/sağlık kolonlarına dokunmaz); yalnız yönetici/resepsiyon.
--  * cari_alacak_ozet: müşteri başına toplam borç, tahsil edilen (ödeme − iade) ve kalan.
-- (UYGULANMADI — önce 20260930220000 uygulanmış olmalı.) fatura_olustur aynı imzayla yeniden tanımlanır (overload oluşmaz). İdempotent tek blok.

-- 1) Eksik fatura bilgisi alanları (iç + dış) -----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fatura_bilgi_eksikleri_ic(p_isletme uuid, p_musteri uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN nullif(btrim(coalesce(m.eposta, '')), '') IS NULL THEN 'eposta' END,
    CASE WHEN h.tc_kimlik_no IS NULL THEN 'tc_kimlik_no' END,
    CASE WHEN nullif(btrim(coalesce(h.il, '')), '') IS NULL OR nullif(btrim(coalesce(h.ilce, '')), '') IS NULL OR nullif(btrim(coalesce(h.adres_detay, '')), '') IS NULL THEN 'adres' END
  ], NULL)
  FROM public.musteri m
  LEFT JOIN public.musteri_hassas h ON h.musteri_id = m.id
  WHERE m.id = p_musteri AND m.isletme_id = p_isletme;
$$;
REVOKE EXECUTE ON FUNCTION public.fatura_bilgi_eksikleri_ic(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fatura_bilgi_eksikleri(p_musteri_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon', 'muhasebe']);
  v_eksik text[];
BEGIN
  v_eksik := public.fatura_bilgi_eksikleri_ic(v_isletme, p_musteri_id);
  IF v_eksik IS NULL THEN
    RAISE EXCEPTION 'musteri_bulunamadi';
  END IF;
  RETURN v_eksik;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fatura_bilgi_eksikleri(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fatura_bilgi_eksikleri(uuid) TO authenticated;

-- 2) Fatura bilgilerini tamamla (yalnız gönderilen alanlar) --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.musteri_fatura_bilgisi_tamamla(
  p_musteri_id uuid,
  p_eposta text DEFAULT NULL,
  p_tc text DEFAULT NULL,
  p_il text DEFAULT NULL,
  p_ilce text DEFAULT NULL,
  p_mahalle text DEFAULT NULL,
  p_adres_detay text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon']);
  v_eposta text := nullif(btrim(coalesce(p_eposta, '')), '');
  v_tc text := nullif(btrim(coalesce(p_tc, '')), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.musteri WHERE id = p_musteri_id AND isletme_id = v_isletme) THEN
    RAISE EXCEPTION 'musteri_bulunamadi';
  END IF;
  IF v_eposta IS NOT NULL AND v_eposta !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'eposta_gecersiz';
  END IF;
  IF v_tc IS NOT NULL AND NOT public.tc_kimlik_gecerli(v_tc) THEN
    RAISE EXCEPTION 'tc_gecersiz';
  END IF;

  IF v_eposta IS NOT NULL THEN
    UPDATE public.musteri SET eposta = v_eposta WHERE id = p_musteri_id;
  END IF;

  INSERT INTO public.musteri_hassas (musteri_id, isletme_id, tc_kimlik_no, il, ilce, mahalle, adres_detay)
  VALUES (p_musteri_id, v_isletme, v_tc, nullif(btrim(coalesce(p_il, '')), ''), nullif(btrim(coalesce(p_ilce, '')), ''), nullif(btrim(coalesce(p_mahalle, '')), ''), nullif(btrim(coalesce(p_adres_detay, '')), ''))
  ON CONFLICT (musteri_id) DO UPDATE SET
    tc_kimlik_no = coalesce(EXCLUDED.tc_kimlik_no, public.musteri_hassas.tc_kimlik_no),
    il = coalesce(EXCLUDED.il, public.musteri_hassas.il),
    ilce = coalesce(EXCLUDED.ilce, public.musteri_hassas.ilce),
    mahalle = coalesce(EXCLUDED.mahalle, public.musteri_hassas.mahalle),
    adres_detay = coalesce(EXCLUDED.adres_detay, public.musteri_hassas.adres_detay);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.musteri_fatura_bilgisi_tamamla(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.musteri_fatura_bilgisi_tamamla(uuid, text, text, text, text, text, text) TO authenticated;

-- 3) fatura_olustur: bilgi kontrolü eklendi (imza aynı) ---------------------------------------------------------------------------------
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
  -- e-Arşiv için alıcı bilgisi tam olmalı (e-posta, T.C. kimlik no, adres).
  IF cardinality(coalesce(public.fatura_bilgi_eksikleri_ic(v_isletme, v_musteri), ARRAY[]::text[])) > 0 THEN
    RAISE EXCEPTION 'fatura_bilgisi_eksik';
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

-- 4) Cari alacak özeti: toplam borç, tahsil edilen (ödeme − iade), kalan -----------------------------------------------------------------
CREATE OR REPLACE VIEW public.cari_alacak_ozet WITH (security_invoker = true) AS
SELECT h.isletme_id, h.musteri_id, o.uye_no, o.ad_soyad,
       sum(CASE WHEN h.tur = 'borc' THEN h.tutar_kurus - h.iskonto_kurus ELSE 0 END)::bigint AS toplam_borc_kurus,
       sum(CASE WHEN h.tur = 'odeme' THEN h.tutar_kurus WHEN h.tur = 'iade' THEN -h.tutar_kurus ELSE 0 END)::bigint AS tahsil_kurus,
       (sum(CASE WHEN h.tur = 'borc' THEN h.tutar_kurus - h.iskonto_kurus ELSE 0 END)
        - sum(CASE WHEN h.tur = 'odeme' THEN h.tutar_kurus WHEN h.tur = 'iade' THEN -h.tutar_kurus ELSE 0 END))::bigint AS kalan_kurus
  FROM public.musteri_bakiye_hareket h
  JOIN public.musteri_ozet o ON o.id = h.musteri_id
 GROUP BY h.isletme_id, h.musteri_id, o.uye_no, o.ad_soyad
HAVING sum(CASE WHEN h.tur = 'borc' THEN 1 ELSE 0 END) > 0;
REVOKE ALL ON public.cari_alacak_ozet FROM anon, authenticated;
GRANT SELECT ON public.cari_alacak_ozet TO authenticated;

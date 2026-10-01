-- Müşteri kartı > "Talep ve Öneriler": müşterinin (telefonla/yüz yüze) ilettiği ders talebi ve antrenör/ders yorumu (puanlı).
-- (UYGULANMADI — önce 20260930160000 uygulanmış olmalı.)
--
-- Klinikteki hasta "Talep ve Öneriler" penceresinin fitness karşılığı:
--  * Ders talebi: bekleyen kuyruk. Resepsiyon "Planlandı" (ders açıldıktan sonra) veya "Reddedildi" ile kapatır.
--  * Ders iptali / erteleme: mevcut ders_seansi_durum / ders_seansi_tasi fonksiyonlarını kullanır (yeni nesne yok).
--  * Antrenör yorumu / ders yorumu: yalnız müşterinin KATILDIĞI derse (geldi/gecikmeli_geldi/derste/tamamlandi), 1-5 puan + metin.
-- Yazma yalnız SECURITY DEFINER fonksiyonlarla; müşteri/işletme bilgisi dersten ve oturumdan türetilir (istemciye güvenilmez).

-- 1) Ders talebi -----------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.musteri_ders_talebi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL,
  tercih_tarih date NOT NULL,
  tercih_saat time,
  antrenor_id uuid,
  not_metni text CHECK (not_metni IS NULL OR char_length(not_metni) <= 500),
  durum text NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'planlandi', 'reddedildi')),
  yanit_kullanici_id uuid REFERENCES public.kullanici(id) ON DELETE SET NULL,
  yanit_tarihi timestamptz,
  olusturan_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (musteri_id, isletme_id) REFERENCES public.musteri (id, isletme_id) ON DELETE RESTRICT,
  FOREIGN KEY (antrenor_id, isletme_id) REFERENCES public.kullanici (id, isletme_id) ON DELETE RESTRICT,
  CONSTRAINT ders_talebi_yanit_kurali CHECK ((durum = 'bekliyor') = (yanit_tarihi IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_ders_talebi_musteri ON public.musteri_ders_talebi (musteri_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ders_talebi_bekleyen ON public.musteri_ders_talebi (isletme_id, created_at) WHERE durum = 'bekliyor';

DROP TRIGGER IF EXISTS trg_ders_talebi_updated_at ON public.musteri_ders_talebi;
CREATE TRIGGER trg_ders_talebi_updated_at
  BEFORE UPDATE ON public.musteri_ders_talebi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.musteri_ders_talebi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.musteri_ders_talebi FROM anon, authenticated;
GRANT SELECT ON public.musteri_ders_talebi TO authenticated;
-- Yazma yetkisi YOK — yalnız aşağıdaki SECURITY DEFINER fonksiyonlar.

DROP POLICY IF EXISTS "ders_talebi_select" ON public.musteri_ders_talebi;
CREATE POLICY "ders_talebi_select" ON public.musteri_ders_talebi FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'))
    OR (SELECT public.is_super_admin())
  );

CREATE OR REPLACE FUNCTION public.ders_talebi_olustur(
  p_musteri_id uuid,
  p_tarih date,
  p_saat time DEFAULT NULL,
  p_antrenor_id uuid DEFAULT NULL,
  p_not text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon']);
  v_id uuid;
BEGIN
  IF p_tarih IS NULL OR p_tarih < public.bugun_istanbul() THEN
    RAISE EXCEPTION 'gecmis_tarih';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.musteri WHERE id = p_musteri_id AND isletme_id = v_isletme AND aktif) THEN
    RAISE EXCEPTION 'musteri_bulunamadi';
  END IF;
  IF p_antrenor_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.kullanici WHERE id = p_antrenor_id AND isletme_id = v_isletme AND rol = 'antrenor' AND aktif) THEN
    RAISE EXCEPTION 'antrenor_bulunamadi';
  END IF;

  INSERT INTO public.musteri_ders_talebi (isletme_id, musteri_id, tercih_tarih, tercih_saat, antrenor_id, not_metni)
  VALUES (v_isletme, p_musteri_id, p_tarih, p_saat, p_antrenor_id, nullif(btrim(p_not), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ders_talebi_olustur(uuid, date, time, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ders_talebi_olustur(uuid, date, time, uuid, text) TO authenticated;

-- Bekleyen talebi kapatır: 'planlandi' (ders açıldı) veya 'reddedildi'. Tekrar yanıtlanamaz.
CREATE OR REPLACE FUNCTION public.ders_talebi_yanitla(p_id uuid, p_durum text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon']);
BEGIN
  IF p_durum IS NULL OR p_durum NOT IN ('planlandi', 'reddedildi') THEN
    RAISE EXCEPTION 'gecersiz_durum';
  END IF;

  UPDATE public.musteri_ders_talebi
     SET durum = p_durum, yanit_kullanici_id = auth.uid(), yanit_tarihi = now()
   WHERE id = p_id AND isletme_id = v_isletme AND durum = 'bekliyor';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talep_bulunamadi';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ders_talebi_yanitla(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ders_talebi_yanitla(uuid, text) TO authenticated;

-- 2) Antrenör / ders yorumu ------------------------------------------------------------------------------------
ALTER TABLE public.ders_seansi DROP CONSTRAINT IF EXISTS ders_seansi_id_isletme_uq;
ALTER TABLE public.ders_seansi ADD CONSTRAINT ders_seansi_id_isletme_uq UNIQUE (id, isletme_id);

CREATE TABLE IF NOT EXISTS public.musteri_yorum (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL,
  ders_id uuid NOT NULL,
  tur text NOT NULL CHECK (tur IN ('antrenor_yorumu', 'ders_yorumu')),
  puan smallint NOT NULL CHECK (puan BETWEEN 1 AND 5),
  yorum text NOT NULL CHECK (char_length(btrim(yorum)) BETWEEN 1 AND 1000),
  olusturan_kullanici_id uuid DEFAULT auth.uid() REFERENCES public.kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (musteri_id, isletme_id) REFERENCES public.musteri (id, isletme_id) ON DELETE RESTRICT,
  FOREIGN KEY (ders_id, isletme_id) REFERENCES public.ders_seansi (id, isletme_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_musteri_yorum_musteri ON public.musteri_yorum (musteri_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_musteri_yorum_ders ON public.musteri_yorum (ders_id);

ALTER TABLE public.musteri_yorum ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.musteri_yorum FROM anon, authenticated;
GRANT SELECT ON public.musteri_yorum TO authenticated;

DROP POLICY IF EXISTS "musteri_yorum_select" ON public.musteri_yorum;
CREATE POLICY "musteri_yorum_select" ON public.musteri_yorum FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) IN ('isletme_admin', 'resepsiyon'))
    OR (SELECT public.is_super_admin())
  );

-- Yorumlar silinmez/değiştirilmez (yazma yetkisi yok; tablo sahibi dışında UPDATE/DELETE yolu yok).
CREATE OR REPLACE FUNCTION public.musteri_yorum_ekle(p_ders_id uuid, p_tur text, p_puan integer, p_yorum text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isletme uuid := public.rol_zorunlu(ARRAY['isletme_admin', 'resepsiyon']);
  v_ders public.ders_seansi%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_tur IS NULL OR p_tur NOT IN ('antrenor_yorumu', 'ders_yorumu') THEN
    RAISE EXCEPTION 'yorum_turu_gecersiz';
  END IF;
  IF p_puan IS NULL OR p_puan < 1 OR p_puan > 5 THEN
    RAISE EXCEPTION 'puan_gecersiz';
  END IF;
  IF p_yorum IS NULL OR btrim(p_yorum) = '' THEN
    RAISE EXCEPTION 'yorum_gerekli';
  END IF;

  SELECT * INTO v_ders FROM public.ders_seansi WHERE id = p_ders_id AND isletme_id = v_isletme;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ders_bulunamadi';
  END IF;
  IF v_ders.durum NOT IN ('geldi', 'gecikmeli_geldi', 'derste', 'tamamlandi') THEN
    RAISE EXCEPTION 'yorum_icin_katilim_gerekli';
  END IF;

  INSERT INTO public.musteri_yorum (isletme_id, musteri_id, ders_id, tur, puan, yorum)
  VALUES (v_isletme, v_ders.musteri_id, v_ders.id, p_tur, p_puan, btrim(p_yorum))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.musteri_yorum_ekle(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.musteri_yorum_ekle(uuid, text, integer, text) TO authenticated;

-- Kontrol:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename IN ('musteri_ders_talebi', 'musteri_yorum') ORDER BY 1;

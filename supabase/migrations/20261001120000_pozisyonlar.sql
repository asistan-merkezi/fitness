-- Ayarlar > Personel Tanımlama: departman bazlı pozisyon kataloğu (klinikteki "pozisyonlar" yapısının fitness uyarlaması).
-- (UYGULANMADI — önce 20260930100000 uygulanmış olmalı.)
--
-- * pozisyon_sablonlari: platform geneli referans katalog (salt-okunur; yalnız migration ile değişir).
-- * pozisyonlar: işletme bazlı kopya. Yeni pozisyonlar varsayılan PASİF ve sistem erişimi KAPALI gelir; işletme yöneticisi
--   çalıştığı unvanları açar. Silinmez, yalnız pasife alınır; bağlı aktif personeli olan pozisyon pasife/erişimsiz yapılamaz.
-- * kullanici.pozisyon_id: personelin (hesap sahibinin) unvanı. Pozisyon seçildiyse kullanıcının rolü pozisyonun varsayılan
--   rolüyle aynı olmalıdır; pozisyon yalnız aktif ve sistem erişimi açıksa atanır. Kendi pozisyonunu kişi değiştiremez.
-- * Ücret tipi (aylik_maas | maas_ve_prim) ve puantaj modu bilgidir; hakediş hesabı personel_profil'den yürür.

-- 1) Platform şablonları ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pozisyon_sablonlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad text NOT NULL UNIQUE,
  grup text NOT NULL,
  sira integer NOT NULL DEFAULT 0,
  varsayilan_rol text NOT NULL DEFAULT 'antrenor' CHECK (varsayilan_rol IN ('isletme_admin', 'resepsiyon', 'antrenor', 'muhasebe')),
  ucret_tipi text NOT NULL DEFAULT 'aylik_maas' CHECK (ucret_tipi IN ('aylik_maas', 'maas_ve_prim')),
  puantaj_modu text NOT NULL DEFAULT 'gunluk' CHECK (puantaj_modu IN ('gunluk', 'esnek', 'takipsiz')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pozisyon_sablonlari ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pozisyon_sablonlari FROM anon, authenticated;
GRANT SELECT ON public.pozisyon_sablonlari TO authenticated;
DROP POLICY IF EXISTS "pozisyon_sablonlari_select" ON public.pozisyon_sablonlari;
CREATE POLICY "pozisyon_sablonlari_select" ON public.pozisyon_sablonlari FOR SELECT TO authenticated USING (true);

-- 6 departman, 20 unvan. Rol: rolü olmayan unvanlarda (diyetisyen, temizlik, teknik...) en kısıtlı rol 'antrenor' yer tutucudur;
-- bu unvanlar sistem erişimi KAPALI gelir ve erişim açılmadıkça hesap atanamaz.
INSERT INTO public.pozisyon_sablonlari (ad, grup, sira, varsayilan_rol, ucret_tipi, puantaj_modu) VALUES
  ('İşletme Sahibi',                              'Yönetim Departmanı',                 110, 'isletme_admin', 'aylik_maas',   'esnek'),
  ('Genel Müdür',                                 'Yönetim Departmanı',                 120, 'isletme_admin', 'aylik_maas',   'esnek'),
  ('Salon Müdürü / İşletme Müdürü',               'Yönetim Departmanı',                 130, 'isletme_admin', 'aylik_maas',   'esnek'),
  ('Resepsiyon Sorumlusu',                        'Ön Büro & Satış Departmanı',         210, 'resepsiyon',    'aylik_maas',   'gunluk'),
  ('Müşteri İlişkileri ve Satış Danışmanı',       'Ön Büro & Satış Departmanı',         220, 'resepsiyon',    'aylik_maas',   'gunluk'),
  ('Ön Büro Elemanı',                             'Ön Büro & Satış Departmanı',         230, 'resepsiyon',    'aylik_maas',   'gunluk'),
  ('Head Coach / Başantrenör',                    'Eğitmen Kadrosu (Fitness & Stüdyo)', 310, 'antrenor',      'maas_ve_prim', 'gunluk'),
  ('Personal Trainer (Bireysel Fitness Eğitmeni)','Eğitmen Kadrosu (Fitness & Stüdyo)', 320, 'antrenor',      'maas_ve_prim', 'gunluk'),
  ('Salon Saha Eğitmeni',                         'Eğitmen Kadrosu (Fitness & Stüdyo)', 330, 'antrenor',      'maas_ve_prim', 'gunluk'),
  ('Pilates / Reformer Eğitmeni',                 'Eğitmen Kadrosu (Fitness & Stüdyo)', 340, 'antrenor',      'maas_ve_prim', 'gunluk'),
  ('Grup Dersi Eğitmeni (Spinning, Zumba, Boks, Crossfit vb.)', 'Eğitmen Kadrosu (Fitness & Stüdyo)', 350, 'antrenor', 'maas_ve_prim', 'gunluk'),
  ('Diyetisyen / Beslenme Uzmanı',                'Sağlık & Beslenme Departmanı',       410, 'antrenor',      'maas_ve_prim', 'gunluk'),
  ('Spor Fizyoterapisti',                         'Sağlık & Beslenme Departmanı',       420, 'antrenor',      'maas_ve_prim', 'gunluk'),
  ('Spor Masörü',                                 'Sağlık & Beslenme Departmanı',       430, 'antrenor',      'maas_ve_prim', 'gunluk'),
  ('Muhasebe Sorumlusu',                          'Finans & İdari İşler Departmanı',    510, 'muhasebe',      'aylik_maas',   'esnek'),
  ('Finans Uzmanı',                               'Finans & İdari İşler Departmanı',    520, 'muhasebe',      'aylik_maas',   'esnek'),
  ('Cafe / Barista / Protein Bar Sorumlusu',      'Destek & Hizmet Departmanı',         610, 'resepsiyon',    'aylik_maas',   'gunluk'),
  ('Mağaza / Ekipman Satış Sorumlusu',            'Destek & Hizmet Departmanı',         620, 'resepsiyon',    'aylik_maas',   'gunluk'),
  ('Temizlik ve Hijyen Personeli',                'Destek & Hizmet Departmanı',         630, 'antrenor',      'aylik_maas',   'gunluk'),
  ('Teknik Bakım ve Onarım Sorumlusu',            'Destek & Hizmet Departmanı',         640, 'antrenor',      'aylik_maas',   'esnek')
ON CONFLICT (ad) DO NOTHING;

-- 2) İşletme pozisyonları --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pozisyonlar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  sablon_id uuid REFERENCES public.pozisyon_sablonlari(id) ON DELETE SET NULL,
  ad text NOT NULL CHECK (char_length(btrim(ad)) BETWEEN 2 AND 100),
  grup text NOT NULL CHECK (char_length(btrim(grup)) >= 2),
  sira integer NOT NULL DEFAULT 999,
  aktif boolean NOT NULL DEFAULT false,
  sistem_erisimi boolean NOT NULL DEFAULT false,
  varsayilan_rol text NOT NULL DEFAULT 'antrenor' CHECK (varsayilan_rol IN ('isletme_admin', 'resepsiyon', 'antrenor', 'muhasebe')),
  ucret_tipi text NOT NULL DEFAULT 'aylik_maas' CHECK (ucret_tipi IN ('aylik_maas', 'maas_ve_prim')),
  puantaj_modu text NOT NULL DEFAULT 'gunluk' CHECK (puantaj_modu IN ('gunluk', 'esnek', 'takipsiz')),
  ozel_mi boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (isletme_id, ad),
  UNIQUE (id, isletme_id)
);

CREATE INDEX IF NOT EXISTS idx_pozisyonlar_isletme ON public.pozisyonlar (isletme_id, sira);

DROP TRIGGER IF EXISTS trg_pozisyonlar_updated_at ON public.pozisyonlar;
CREATE TRIGGER trg_pozisyonlar_updated_at
  BEFORE UPDATE ON public.pozisyonlar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- Yalnız değişiklikler denetlenir (şablondan toplu tohumlama denetim kaydını doldurmasın).
DROP TRIGGER IF EXISTS trg_audit_pozisyonlar ON public.pozisyonlar;
CREATE TRIGGER trg_audit_pozisyonlar
  AFTER UPDATE ON public.pozisyonlar
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

ALTER TABLE public.pozisyonlar ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pozisyonlar FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pozisyonlar TO authenticated;
-- DELETE yok: pozisyon silinmez, yalnız pasife alınır.

DROP POLICY IF EXISTS "pozisyonlar_select" ON public.pozisyonlar;
CREATE POLICY "pozisyonlar_select" ON public.pozisyonlar FOR SELECT TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) OR (SELECT public.is_super_admin()));
DROP POLICY IF EXISTS "pozisyonlar_insert" ON public.pozisyonlar;
CREATE POLICY "pozisyonlar_insert" ON public.pozisyonlar FOR INSERT TO authenticated
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');
DROP POLICY IF EXISTS "pozisyonlar_update" ON public.pozisyonlar;
CREATE POLICY "pozisyonlar_update" ON public.pozisyonlar FOR UPDATE TO authenticated
  USING (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
  WITH CHECK (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin');

-- Tenant ve şablon kimliği değiştirilemez; bağlı AKTİF personeli olan pozisyon pasife veya erişimsize alınamaz.
CREATE OR REPLACE FUNCTION public.pozisyon_koruma()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.isletme_id IS DISTINCT FROM OLD.isletme_id THEN
    RAISE EXCEPTION 'isletme_degistirilemez';
  END IF;
  IF (OLD.aktif AND NOT NEW.aktif) OR (OLD.sistem_erisimi AND NOT NEW.sistem_erisimi) THEN
    IF EXISTS (SELECT 1 FROM public.kullanici k WHERE k.pozisyon_id = NEW.id AND k.aktif) THEN
      RAISE EXCEPTION 'pozisyon_personel_bagli';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.pozisyon_koruma() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pozisyon_koruma ON public.pozisyonlar;
CREATE TRIGGER trg_pozisyon_koruma
  BEFORE UPDATE ON public.pozisyonlar
  FOR EACH ROW EXECUTE FUNCTION public.pozisyon_koruma();

-- 3) Personel (kullanici) - pozisyon bağı ----------------------------------------------------------------------
ALTER TABLE public.kullanici ADD COLUMN IF NOT EXISTS pozisyon_id uuid;
ALTER TABLE public.kullanici DROP CONSTRAINT IF EXISTS kullanici_pozisyon_fk;
ALTER TABLE public.kullanici ADD CONSTRAINT kullanici_pozisyon_fk
  FOREIGN KEY (pozisyon_id, isletme_id) REFERENCES public.pozisyonlar (id, isletme_id);
CREATE INDEX IF NOT EXISTS idx_kullanici_pozisyon ON public.kullanici (pozisyon_id) WHERE pozisyon_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.kullanici_pozisyon_kurali()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_poz public.pozisyonlar%ROWTYPE;
BEGIN
  -- Pozisyonu (boşaltmak dahil) yalnız işletme yöneticisi değiştirir; kimse kendi pozisyonunu değiştiremez.
  IF TG_OP = 'UPDATE' AND NEW.pozisyon_id IS DISTINCT FROM OLD.pozisyon_id
     AND auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    IF public.current_rol() IS DISTINCT FROM 'isletme_admin' OR NEW.id = auth.uid() THEN
      RAISE EXCEPTION 'yetki_yetersiz';
    END IF;
  END IF;

  IF NEW.pozisyon_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Yalnız pozisyon veya rol değiştiğinde (ya da yeni kayıtta) denetlenir; eski kayıtların sonradan pasifleşmesi engellenmez.
  IF TG_OP = 'UPDATE' AND NEW.pozisyon_id IS NOT DISTINCT FROM OLD.pozisyon_id AND NEW.rol IS NOT DISTINCT FROM OLD.rol THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_poz FROM public.pozisyonlar WHERE id = NEW.pozisyon_id AND isletme_id = NEW.isletme_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pozisyon_bulunamadi';
  END IF;
  IF NOT v_poz.aktif OR NOT v_poz.sistem_erisimi THEN
    RAISE EXCEPTION 'pozisyon_atanamaz';
  END IF;
  IF NEW.rol IS DISTINCT FROM v_poz.varsayilan_rol THEN
    RAISE EXCEPTION 'pozisyon_rol_uyumsuz';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.kullanici_pozisyon_kurali() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_kullanici_pozisyon_kurali ON public.kullanici;
CREATE TRIGGER trg_kullanici_pozisyon_kurali
  BEFORE INSERT OR UPDATE ON public.kullanici
  FOR EACH ROW EXECUTE FUNCTION public.kullanici_pozisyon_kurali();

-- 4) Şablonlardan işletme pozisyonları: yeni işletmeye otomatik + mevcutlara tamamlama -------------------------
CREATE OR REPLACE FUNCTION public.isletme_pozisyonlari_olustur(p_isletme_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.pozisyonlar (isletme_id, sablon_id, ad, grup, sira, varsayilan_rol, ucret_tipi, puantaj_modu)
  SELECT p_isletme_id, s.id, s.ad, s.grup, s.sira, s.varsayilan_rol, s.ucret_tipi, s.puantaj_modu
  FROM public.pozisyon_sablonlari s
  ON CONFLICT (isletme_id, ad) DO NOTHING;
$$;
REVOKE EXECUTE ON FUNCTION public.isletme_pozisyonlari_olustur(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.isletme_pozisyon_tohumla()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.isletme_pozisyonlari_olustur(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.isletme_pozisyon_tohumla() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_isletme_pozisyon_tohumla ON public.isletme;
CREATE TRIGGER trg_isletme_pozisyon_tohumla
  AFTER INSERT ON public.isletme
  FOR EACH ROW EXECUTE FUNCTION public.isletme_pozisyon_tohumla();

SELECT public.isletme_pozisyonlari_olustur(i.id) FROM public.isletme i;

-- Kontrol:
-- SELECT grup, count(*) FROM public.pozisyonlar GROUP BY grup ORDER BY min(sira);

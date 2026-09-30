-- Giriş kuralı (klinikle aynı): yönetici (isletme_admin/super_admin) E-POSTA + şifre ile,
-- diğer tüm roller (resepsiyon/antrenör/muhasebe) TELEFON + şifre ile girer.
-- Klinikten tek fark: telefon -> e-posta çözümü anonim role AÇILMAZ. RPC yalnız service_role'e
-- verilir, giriş eylemi sunucuda çağırır; böylece telefon numarasından personelin e-postası
-- dışarıya sızdırılamaz.

ALTER TABLE public.kullanici ADD COLUMN IF NOT EXISTS telefon text;

-- Son 10 hane: +90 / 0 / boşluk farklarını yutar.
CREATE OR REPLACE FUNCTION public.telefon_normalize(p_telefon text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT NULLIF(right(regexp_replace(coalesce(p_telefon, ''), '\D', '', 'g'), 10), '');
$$;

-- Aynı numarayla iki kullanıcı olamaz (işletmeler arası dahil: giriş anında işletme bilinmez).
CREATE UNIQUE INDEX IF NOT EXISTS idx_kullanici_telefon_normalize
  ON public.kullanici (public.telefon_normalize(telefon))
  WHERE public.telefon_normalize(telefon) IS NOT NULL;

-- Yönetici dışındaki roller için telefon zorunlu (giriş yolu bu). NULL tuzağı: IS NOT NULL ile.
ALTER TABLE public.kullanici DROP CONSTRAINT IF EXISTS kullanici_personel_telefon_zorunlu;
ALTER TABLE public.kullanici ADD CONSTRAINT kullanici_personel_telefon_zorunlu
  CHECK (rol IN ('super_admin', 'isletme_admin') OR public.telefon_normalize(telefon) IS NOT NULL) NOT VALID;

CREATE OR REPLACE FUNCTION public.personel_giris_epostasi(p_telefon text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.email::text
    FROM public.kullanici k
    JOIN auth.users u ON u.id = k.id
   WHERE k.rol NOT IN ('isletme_admin', 'super_admin')
     AND k.aktif
     AND public.telefon_normalize(k.telefon) = public.telefon_normalize(p_telefon)
     AND public.telefon_normalize(p_telefon) IS NOT NULL
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.personel_giris_epostasi(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.personel_giris_epostasi(text) TO service_role;

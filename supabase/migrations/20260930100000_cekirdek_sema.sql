-- Çekirdek şema: işletme (tenant), kullanıcı/rol, yardımcı fonksiyonlar, sayaç, audit log.
-- (UYGULANMADI — Supabase projesi açıldıktan sonra test/branch'te dene, sonra canlıya al.)
--
-- Kurallar: tüm ad/kolon ASCII Türkçe snake_case; her tenant tablosunda isletme_id + RLS;
-- SECURITY DEFINER fonksiyonlarda SET search_path = ''; policy'lerde (select ...) sarmalama.
-- Roller: super_admin | isletme_admin | resepsiyon | antrenor | muhasebe

-- 1) Ortak yardımcılar -------------------------------------------------------------
-- "Bugün" İstanbul takvim günüdür (Supabase DB UTC'dedir; current_date UTC gününü verir).
CREATE OR REPLACE FUNCTION public.bugun_istanbul()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$ SELECT (now() AT TIME ZONE 'Europe/Istanbul')::date $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Arama için Türkçe normalizasyon: İ/I/ı/i -> i, ş->s, ğ->g, ü->u, ö->o, ç->c, küçük harf.
CREATE OR REPLACE FUNCTION public.tr_normalize(p_metin text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT lower(translate(coalesce(p_metin, ''), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc')) $$;

-- 2) İşletme (tenant) ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.isletme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad text NOT NULL CHECK (char_length(btrim(ad)) >= 2),
  plan text NOT NULL DEFAULT 'baslangic' CHECK (plan IN ('baslangic', 'orta', 'buyuk')),
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_isletme_updated_at ON public.isletme;
CREATE TRIGGER trg_isletme_updated_at
  BEFORE UPDATE ON public.isletme
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Kullanıcı (auth.users ile 1:1 profil) ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.kullanici (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  isletme_id uuid REFERENCES public.isletme(id) ON DELETE CASCADE,
  ad_soyad text NOT NULL CHECK (char_length(btrim(ad_soyad)) >= 2),
  rol text NOT NULL CHECK (rol IN ('super_admin', 'isletme_admin', 'resepsiyon', 'antrenor', 'muhasebe')),
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- super_admin tenant'lar üstüdür; diğer herkes bir işletmeye bağlıdır.
  CONSTRAINT kullanici_isletme_zorunlu CHECK (rol = 'super_admin' OR isletme_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_kullanici_isletme_id ON public.kullanici(isletme_id);

DROP TRIGGER IF EXISTS trg_kullanici_updated_at ON public.kullanici;
CREATE TRIGGER trg_kullanici_updated_at
  BEFORE UPDATE ON public.kullanici
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Tenant / rol yardımcıları (RLS'in tek kaynağı) -----------------------------------------
-- SECURITY DEFINER: kullanici tablosunun kendi RLS'inde özyinelemeye düşmemek için.
CREATE OR REPLACE FUNCTION public.current_isletme_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT k.isletme_id FROM public.kullanici k WHERE k.id = auth.uid() AND k.aktif
$$;

CREATE OR REPLACE FUNCTION public.current_rol()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT k.rol FROM public.kullanici k WHERE k.id = auth.uid() AND k.aktif
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT k.rol = 'super_admin' FROM public.kullanici k WHERE k.id = auth.uid() AND k.aktif), false)
$$;

REVOKE EXECUTE ON FUNCTION public.current_isletme_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_rol() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_isletme_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_rol() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- 5) Kullanıcı kolon koruması: yetki yükseltme ve tenant değiştirme engellenir -------------------
CREATE OR REPLACE FUNCTION public.kullanici_koruma()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- service_role / postgres (auth.uid() null) ve super_admin serbest.
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.isletme_id IS DISTINCT FROM OLD.isletme_id THEN
    RAISE EXCEPTION 'isletme_degistirilemez';
  END IF;
  IF NEW.rol = 'super_admin' THEN
    RAISE EXCEPTION 'yetki_yetersiz';
  END IF;

  -- rol/aktif değişikliği yalnız işletme yöneticisi tarafından ve kendi kaydında DEĞİL.
  IF NEW.rol IS DISTINCT FROM OLD.rol OR NEW.aktif IS DISTINCT FROM OLD.aktif THEN
    IF public.current_rol() IS DISTINCT FROM 'isletme_admin' OR NEW.id = auth.uid() THEN
      RAISE EXCEPTION 'yetki_yetersiz';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kullanici_koruma ON public.kullanici;
CREATE TRIGGER trg_kullanici_koruma
  BEFORE UPDATE ON public.kullanici
  FOR EACH ROW EXECUTE FUNCTION public.kullanici_koruma();

-- isletme.plan yalnızca super_admin/service_role tarafından değişir.
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_isletme_koruma ON public.isletme;
CREATE TRIGGER trg_isletme_koruma
  BEFORE UPDATE ON public.isletme
  FOR EACH ROW EXECUTE FUNCTION public.isletme_koruma();

-- 6) RLS: isletme ve kullanici ---------------------------------------------------------------
ALTER TABLE public.isletme ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kullanici ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.isletme, public.kullanici FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.isletme TO authenticated;
GRANT SELECT, UPDATE ON public.kullanici TO authenticated;

DROP POLICY IF EXISTS "isletme_select_kendi" ON public.isletme;
CREATE POLICY "isletme_select_kendi" ON public.isletme
  FOR SELECT TO authenticated
  USING (id = (SELECT public.current_isletme_id()) OR (SELECT public.is_super_admin()));

DROP POLICY IF EXISTS "isletme_update_admin" ON public.isletme;
CREATE POLICY "isletme_update_admin" ON public.isletme
  FOR UPDATE TO authenticated
  USING (
    (id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
    OR (SELECT public.is_super_admin())
  )
  WITH CHECK (
    (id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
    OR (SELECT public.is_super_admin())
  );

DROP POLICY IF EXISTS "kullanici_select" ON public.kullanici;
CREATE POLICY "kullanici_select" ON public.kullanici
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR isletme_id = (SELECT public.current_isletme_id())
    OR (SELECT public.is_super_admin())
  );

-- Kendi adını güncelleyebilir; rol/aktif/isletme değişikliği tetikleyiciyle korunur.
DROP POLICY IF EXISTS "kullanici_update" ON public.kullanici;
CREATE POLICY "kullanici_update" ON public.kullanici
  FOR UPDATE TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
    OR (SELECT public.is_super_admin())
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    OR (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
    OR (SELECT public.is_super_admin())
  );
-- INSERT/DELETE: policy yok (yalnız service_role — auth.admin.createUser akışı).

-- 7) Sayaç (üye numarası vb.) — yalnız SECURITY DEFINER fonksiyonla erişilir ------------------------
CREATE TABLE IF NOT EXISTS public.isletme_sayac (
  isletme_id uuid NOT NULL REFERENCES public.isletme(id) ON DELETE CASCADE,
  ad text NOT NULL,
  deger bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (isletme_id, ad)
);
ALTER TABLE public.isletme_sayac ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.isletme_sayac FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.sonraki_sayac(p_isletme_id uuid, p_ad text)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.isletme_sayac (isletme_id, ad, deger)
  VALUES (p_isletme_id, p_ad, 1)
  ON CONFLICT (isletme_id, ad) DO UPDATE SET deger = public.isletme_sayac.deger + 1
  RETURNING deger
$$;
REVOKE EXECUTE ON FUNCTION public.sonraki_sayac(uuid, text) FROM PUBLIC, anon, authenticated;

-- 8) Audit log (v2): yalnız alan ADLARI saklanır, ham değerler (PII/sağlık) ASLA ---------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY,
  isletme_id uuid,
  kullanici_id uuid,
  tablo text NOT NULL,
  kayit_id text,
  islem text NOT NULL CHECK (islem IN ('INSERT', 'UPDATE', 'DELETE')),
  degisen_alanlar text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS public.audit_log_varsayilan PARTITION OF public.audit_log DEFAULT;

ALTER TABLE public.audit_log_varsayilan ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_audit_log_isletme_zaman ON public.audit_log (isletme_id, created_at DESC);

-- Verilen ayın (İstanbul) bölümünü oluşturur; yoksa. Cron ile ayın 1'inde gelecek ay için çağrılır.
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
  EXECUTE format(
    'CREATE TABLE public.%I PARTITION OF public.audit_log FOR VALUES FROM (%L) TO (%L)',
    v_ad, v_baslangic, v_bitis
  );
  -- Bölüme DOĞRUDAN erişim üst tablonun RLS'ini atlar: bölüm kapatılır (yalnız üst tablo okunur).
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_ad);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v_ad);
  RETURN v_ad;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_log_bolum_olustur(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_log_bolum_olustur(date) TO service_role;

-- Genel audit tetikleyicisi: tabloda isletme_id kolonu olmalı (isletme tablosunun kendisi hariç).
CREATE OR REPLACE FUNCTION public.audit_kaydet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_yeni jsonb;
  v_eski jsonb;
  v_alanlar text[];
  v_kayit jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_kayit := to_jsonb(OLD);
  ELSE
    v_kayit := to_jsonb(NEW);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_yeni := to_jsonb(NEW);
    v_eski := to_jsonb(OLD);
    SELECT coalesce(array_agg(k ORDER BY k), '{}')
      INTO v_alanlar
      FROM jsonb_object_keys(v_yeni) AS k
     WHERE v_yeni -> k IS DISTINCT FROM v_eski -> k AND k <> 'updated_at';
    -- Değişen alan yoksa (yalnız updated_at) kayıt düşme.
    IF coalesce(array_length(v_alanlar, 1), 0) = 0 THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.audit_log (isletme_id, kullanici_id, tablo, kayit_id, islem, degisen_alanlar)
  VALUES (
    coalesce((v_kayit ->> 'isletme_id')::uuid, CASE WHEN TG_TABLE_NAME = 'isletme' THEN (v_kayit ->> 'id')::uuid END),
    auth.uid(),
    TG_TABLE_NAME,
    v_kayit ->> 'id',
    TG_OP,
    v_alanlar
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_kaydet() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_log, public.audit_log_varsayilan FROM anon, authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

DROP POLICY IF EXISTS "audit_log_select" ON public.audit_log;
CREATE POLICY "audit_log_select" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    (isletme_id = (SELECT public.current_isletme_id()) AND (SELECT public.current_rol()) = 'isletme_admin')
    OR (SELECT public.is_super_admin())
  );
-- INSERT/UPDATE/DELETE: policy yok; yalnız audit_kaydet() (SECURITY DEFINER) yazar.

SELECT public.audit_log_bolum_olustur(public.bugun_istanbul());
SELECT public.audit_log_bolum_olustur((public.bugun_istanbul() + interval '1 month')::date);

DROP TRIGGER IF EXISTS trg_audit_kullanici ON public.kullanici;
CREATE TRIGGER trg_audit_kullanici
  AFTER INSERT OR UPDATE OR DELETE ON public.kullanici
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

DROP TRIGGER IF EXISTS trg_audit_isletme ON public.isletme;
CREATE TRIGGER trg_audit_isletme
  AFTER UPDATE ON public.isletme
  FOR EACH ROW EXECUTE FUNCTION public.audit_kaydet();

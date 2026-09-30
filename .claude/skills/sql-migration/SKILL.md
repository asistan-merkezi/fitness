---
name: sql-migration
description: Supabase/PostgreSQL migration üretim standartları. Kullanıcı yeni tablo, kolon, RLS policy, trigger, function, index veya herhangi bir veritabanı şema değişikliği istediğinde MUTLAKA bu skill'i kullan. "Migration yaz", "tablo ekle", "SQL bloğu hazırla", "RLS policy", "şema değişikliği" gibi ifadeler geçtiğinde de kullan. Supabase SQL Editor'e tek seferde yapıştırılabilir, idempotent, güvenli migration blokları üretir.
---

# SQL Migration

Supabase (PostgreSQL) için üretilen tüm migration'larda uygulanacak standartlar. Projeye özel detaylar (tablo adları, tenant kolonu, helper function'lar, roller) projenin CLAUDE.md dosyasında tanımlıdır — bu skill "nasıl yapılır"ı, CLAUDE.md "bu projede ne var"ı taşır. Migration yazmadan önce CLAUDE.md'deki şema bilgisine bak.

## Temel prensipler

1. **Tek blok, copy-paste hazır**: Migration her zaman TEK bir SQL bloğu olarak verilir. Kullanıcı bunu Supabase SQL Editor'e yapıştırıp bir kez çalıştırır. Parça parça, "önce şunu sonra bunu çalıştır" şeklinde verme.
2. **Idempotent**: Blok ikinci kez çalıştırıldığında hata vermemeli. Bunun için:
   - `CREATE TABLE IF NOT EXISTS`
   - `CREATE INDEX IF NOT EXISTS`
   - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
   - `DROP POLICY IF EXISTS ...` sonra `CREATE POLICY ...`
   - `CREATE OR REPLACE FUNCTION`
   - Trigger için: `DROP TRIGGER IF EXISTS ... ON tablo;` sonra `CREATE TRIGGER ...`
   - Enum için: `DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
3. **Açıklamalı**: Bloğun başına ne yaptığını özetleyen bir yorum satırı, mantıksal bölümlerin arasına `-- 1) ...`, `-- 2) ...` şeklinde numaralı yorumlar ekle.
4. **Türkçe isimlendirme**: Tablo ve kolon adları Türkçe, snake_case, Türkçe karakter KULLANMADAN yazılır (ör. `musteriler`, `kayit_tarihi`, `siparis_kalemleri`). Evrensel teknik alanlar (`id`, `created_at`, `updated_at`) İngilizce kalır. Proje farklı bir konvansiyon tanımladıysa CLAUDE.md'deki geçerlidir.

## Standart tablo şablonu

Her yeni tablo şunları içerir:

```sql
CREATE TABLE IF NOT EXISTS ornek_tablo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- multi-tenant projede: projenin tenant kolonu zorunlu (CLAUDE.md'ye bak)
  tenant_id uuid NOT NULL REFERENCES tenant_tablosu(id) ON DELETE CASCADE,
  -- ... alan kolonları ...
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- Primary key: `uuid` + `gen_random_uuid()`
- Zaman damgaları: `timestamptz`, `created_at` ve `updated_at` her tabloda
- Foreign key'lerde `ON DELETE` davranışını bilinçli seç ve yorumla belirt (CASCADE / SET NULL / RESTRICT)
- `updated_at` için ortak trigger function kullan (projede zaten varsa yenisini yazma):

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP TRIGGER IF EXISTS trg_ornek_tablo_updated_at ON ornek_tablo;
CREATE TRIGGER trg_ornek_tablo_updated_at
  BEFORE UPDATE ON ornek_tablo
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

## RLS (Row Level Security)

Her tabloda RLS AÇIK olmalı. Migration'da tablo oluşturduktan hemen sonra:

```sql
ALTER TABLE ornek_tablo ENABLE ROW LEVEL SECURITY;
```

Multi-tenant projelerde policy'ler projenin helper function'larına dayanır. Tipik desen: tenant id döndüren bir function (ör. `current_tenant_id()`), rol döndüren bir function (ör. `current_rol()`) ve admin kontrolü (ör. `is_super_admin()`). Projede tanımlı olanların adlarını CLAUDE.md'den al; yoksa bu deseni öner ve önce helper function'ları oluştur.

Policy şablonu (her işlem türü için ayrı, isimleri açıklayıcı):

```sql
DROP POLICY IF EXISTS "ornek_tablo_select_kendi_tenant" ON ornek_tablo;
CREATE POLICY "ornek_tablo_select_kendi_tenant" ON ornek_tablo
  FOR SELECT USING (tenant_id = current_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "ornek_tablo_insert_kendi_tenant" ON ornek_tablo;
CREATE POLICY "ornek_tablo_insert_kendi_tenant" ON ornek_tablo
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
```

Kurallar:
- SELECT / INSERT / UPDATE / DELETE için ayrı policy yaz; hepsini tek `FOR ALL` içine sıkıştırma (rol bazlı ayrım gerekebilir).
- UPDATE policy'de hem `USING` hem `WITH CHECK` yaz.
- Rol kısıtı gerekiyorsa rolleri açıkça listele: `current_rol() IN ('admin', 'yonetici')` — geçerli rol adları CLAUDE.md'de.
- Tek kullanıcılı / tenant'sız projelerde `auth.uid()` bazlı sahiplik policy'si kullan: `USING (user_id = auth.uid())`.
- Service role (scraper/cron gibi backend işleri) RLS'i zaten bypass eder; bunun için policy yazmaya gerek yok, ama yorumla belirt.
- **Performans:** policy içinde `auth.uid()` ve helper function çağrılarını `(select ...)` ile sarmala (`tenant_id = (select current_tenant_id())`); böylece satır başına değil sorgu başına bir kez değerlendirilir.
- **SECURITY DEFINER** fonksiyonlarda her zaman `SET search_path = ''` (veya `public, pg_temp`) ver ve nesneleri şema adıyla çağır; aksi halde search_path üzerinden yetki yükseltilebilir.

## Index'ler

- Her foreign key kolonuna index: `CREATE INDEX IF NOT EXISTS idx_ornek_tablo_tenant_id ON ornek_tablo(tenant_id);`
- Sık filtrelenen kolonlara (tarih, durum) index öner.
- Tekillik gerekiyorsa `UNIQUE INDEX` kullan ve idempotent scraper/upsert akışları için `ON CONFLICT` hedefi olacak şekilde tasarla.

## Veri migration'ları (backfill / veri düzeltme)

- Şema değişikliği ile veri değişikliğini AYNI blokta ver ama bölüm yorumlarıyla ayır.
- Toplu update'lerde etkilenecek satır sayısını önce tahmin ettiren bir `SELECT count(*)` sorgusunu yorum satırı olarak bloğun üstüne ekle (kullanıcı isterse önce onu çalıştırır).
- Geri dönüşü olmayan işlemler (DROP TABLE, DROP COLUMN, kolon tipi daraltma) için bloğun en üstüne büyük harfle uyarı yorumu yaz ve mümkünse önce yedek tablo öner: `CREATE TABLE _yedek_ornek_tablo AS SELECT * FROM ornek_tablo;`

## Çıktı formatı

1. Kısa bir açıklama (1-2 cümle, ne yapıyor)
2. Tek SQL bloğu (yukarıdaki tüm kurallara uygun)
3. Bloğun sonunda doğrulama sorgusu yorumu: `-- Kontrol: SELECT ... ;`
4. Varsa dikkat edilecekler (kısa madde listesi, en fazla 3 madde)
5. Canlı projede blok yalnızca SQL Editor'e bırakılmaz: aynı içerik `supabase/migrations/<zaman>_<ad>.sql` olarak repoya da yazılır (tekrarlanabilirlik, staging'de deneme, deploy-checklist). Dosya adı zaman damgası mevcut migration'larla çakışmamalıdır.

Uzun açıklamalar yazma; kullanıcı deneyimli bir geliştirici, SQL bloğunun kendisi ve yorum satırları yeterli.

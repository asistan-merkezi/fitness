---
name: saas-patterns
description: Multi-tenant SaaS mimari desenleri. Kullanıcı multi-tenant yapı, tenant izolasyonu, rol/yetki sistemi, üyelik-davet akışı, tenant bazlı ayarlar, abonelik/plan yapısı veya yeni bir SaaS modülü tasarlamak istediğinde MUTLAKA bu skill'i kullan. "Multi-tenant", "tenant", "rol sistemi", "yetkilendirme tasarımı", "yeni modül ekle", "SaaS mimarisi", "müşteri hesapları birbirinden ayrılsın" gibi ifadeler geçtiğinde de kullan. Supabase + Next.js üzerinde güvenli tenant izolasyonu ve tutarlı rol mimarisi üretir.
---

# SaaS Patterns

Supabase + Next.js üzerinde multi-tenant SaaS mimarisi standartları. Projeye özel detaylar (tenant kavramının adı, rol listesi, modüller, plan yapısı) CLAUDE.md'dedir — bu skill evrensel deseni taşır. Yeni modül/özellik tasarlarken önce CLAUDE.md'deki mevcut yapıya bak ve ona uy; ikinci bir desen icat etme.

## Tenant modeli

Varsayılan desen: **paylaşımlı şema + tenant kolonu + RLS** (Supabase için doğru varsayılan; şema-per-tenant veya db-per-tenant bu ölçekte gereksiz karmaşıklıktır).

Çekirdek tablolar:

```
tenantlar            # tenant ana kaydı (ad, durum, ayarlar)
kullanici_profilleri # auth.users'a 1:1 profil (ad, telefon...)
tenant_uyelikleri    # kullanıcı ↔ tenant junction: (user_id, tenant_id, rol)
```

Kurallar:

- Kullanıcı-tenant ilişkisi HER ZAMAN junction tablosu üzerinden kurulur (bir kullanıcı birden çok tenant'a, farklı rollerle üye olabilir). Rolü `auth.users` metadata'sına veya profile gömme.
- Tenant'a ait HER tabloda `tenant_id` kolonu bulunur (uuid, NOT NULL, FK, ON DELETE CASCADE) — "bu tablo zaten X üzerinden tenant'a bağlı" diyerek atlama; RLS ve sorgu basitliği için doğrudan kolon her tabloda olmalı.
- Aktif tenant bağlamı tek bir helper function'dan okunur (ör. `current_tenant_id()`, SECURITY DEFINER; `SET search_path = ''` ile tanımlanır ve policy'lerde `(select current_tenant_id())` biçiminde çağrılır — sql-migration). Adı projede tanımlıysa CLAUDE.md'den al. Kullanıcı çok tenant'lıysa aktif tenant seçimi profil/cookie'de tutulur ve helper bunu okur.

## İzolasyon katmanları

Tenant izolasyonu üç katmanda birden sağlanır; hiçbiri diğerinin yerine geçmez:

1. **RLS (asıl güvenlik)**: her tenant tablosunda `tenant_id = current_tenant_id()` politikası. Detaylı migration kuralları için `sql-migration` skill'i geçerlidir.
2. **Uygulama katmanı**: server action ve sorgular yine de `tenant_id` filtresi ile yazılır (RLS'e körlemesine yaslanma — hem performans hem okunabilirlik).
3. **UI katmanı**: kullanıcıya yalnızca üyesi olduğu tenant'ların verisi ve menüleri gösterilir.

Sık hata: yeni tabloya RLS eklemeyi unutmak. Yeni tablo = tenant kolonu + RLS + FK index, üçü birlikte gelir.

## Rol ve yetki sistemi

- Roller veritabanında, tenant üyeliği üzerinde tutulur: `tenant_uyelikleri.rol`. Rol listesi projeye özeldir (CLAUDE.md'de); yaygın iskelet: platform sahibi (`super_admin`, tenant'lar üstü) + tenant içi roller (yönetici, operasyon, muhasebe, salt-okur gibi).
- `super_admin` tenant üyeliğinden BAĞIMSIZ kontrol edilir (ayrı flag/tablo) ve RLS politikalarında `OR is_super_admin()` ile açılır.
- Yetki kontrolü üç yerde tutarlı olmalı: RLS policy + server action (`requireRole` deseni — bkz. `auth-flow` skill) + UI görünürlüğü.
- Yetki matrisi büyüyorsa rol → izin eşlemesini tek bir sabit/tabloda tanımla; kod içine dağınık `if (rol === '...')` blokları yayma.

## Modül tasarımı

Yeni bir modül (ör. randevular, faturalar, görevler) eklerken standart paket:

1. **Şema**: modül tabloları (tenant kolonu + RLS + index'ler dahil)
2. **Tipler**: `types/` altında tablo tipleri
3. **Sorgu/Action katmanı**: modülün server action'ları (auth + rol kontrolü içeride)
4. **UI**: liste sayfası → detay → oluştur/düzenle formu sırasıyla
5. **Menü/route**: rol bazlı menü görünürlüğü

Modüller arası bağımlılıkta FK kullan ama silme davranışını bilinçli seç; "kayıt silinince geçmiş rapor bozulmasın" gereken yerlerde hard delete yerine `durum` kolonu ile soft delete/arşiv deseni tercih et.

## Tenant ayarları ve özelleştirme

- Tenant bazlı ayarlar için ayrı `tenant_ayarlari` tablosu veya tenant tablosunda `jsonb` kolon kullan; az sayıda, tipli ayar varsa kolon, esnek/değişken yapı varsa `jsonb`.
- Özellik açma/kapama (feature flag) gerekiyorsa tenant ayarında boolean alanlar; plan bazlı kısıt varsa plan tanımına bağla.

## Plan / abonelik iskeleti (gerekiyorsa)

- `planlar` (ad, limitler, fiyat) + tenant'ta `plan_id` ve `plan_bitis` alanları.
- Limit kontrolü (kullanıcı sayısı, kayıt sayısı vb.) server action'da merkezi bir `checkPlanLimit()` yardımcısıyla yapılır; UI'da da limit dolunca açıklayıcı Türkçe mesaj gösterilir.
- Ödeme sağlayıcısı entegrasyonu ayrı iştir; şemayı sağlayıcıdan bağımsız tasarla (webhook ile `plan_bitis` güncelleme deseni).

## Onboarding / davet akışı

- Yeni tenant kurulumu tek transaction mantığında: tenant kaydı + kurucu kullanıcının üyeliği (yönetici rolüyle) + varsayılan ayarlar birlikte oluşturulur.
- Kullanıcı daveti deseni: davet tablosu (e-posta, tenant_id, rol, token, son geçerlilik) → davet e-postası (bkz. `email-service` skill) → kabul sayfasında hesap oluştur/bağlan → üyelik kaydı. Davet token'ı tek kullanımlık ve süreli olmalı.

## Çıktı formatı

- Mimari önerilerde önce kısa gerekçeli özet (2-3 cümle), sonra şema/kod.
- Şema değişikliği içeren işlerde `sql-migration` skill formatında tek SQL bloğu üret.
- Yeni modül taleplerinde yukarıdaki 5 adımlık paketi sırayla, dosya yollarıyla ver.

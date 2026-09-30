---
name: code-standards
description: Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase projelerinde kod üretim standartları. Kullanıcı yeni sayfa, component, API route, server action, hook veya herhangi bir frontend/backend kodu istediğinde MUTLAKA bu skill'i kullan. "Component yaz", "sayfa ekle", "API route oluştur", "form yap", "kod yaz" gibi ifadeler geçtiğinde de kullan. Tutarlı dosya yapısı, isimlendirme, tip güvenliği ve Supabase erişim desenleri üretir.
---

# Code Standards

Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase stack'i için kod üretim standartları. Projeye özel detaylar (tablo adları, roller, marka renkleri, route yapısı) projenin CLAUDE.md dosyasındadır — bu skill evrensel "nasıl"ı taşır. Kod yazmadan önce CLAUDE.md'ye bak.

## Dil ve isimlendirme

- **UI metinleri Türkçe** (buton, başlık, hata mesajı, placeholder). Kod tarafı (değişken, function, type adları) İngilizce.
- Dosya adları: component'ler `PascalCase.tsx`, diğerleri `kebab-case.ts`.
- Route klasörleri Türkçe olabilir (`/musteriler`, `/ayarlar`) — projedeki mevcut konvansiyona uy.
- Boolean'lar `is/has/can` öneki alır; event handler'lar `handle` öneki alır (`handleSubmit`).

## Dosya yapısı

Varsayılan yerleşim (projede farklısı varsa CLAUDE.md geçerli):

```
app/                  # App Router sayfaları, layout'lar, route handler'lar
components/           # Paylaşılan component'ler
  ui/                 # Temel UI parçaları (Button, Input, Modal...)
lib/                  # Yardımcılar
  supabase/           # Supabase client'ları (server/client ayrımı)
  utils.ts            # Genel yardımcı fonksiyonlar
types/                # Paylaşılan TypeScript tipleri
```

- Bir component yalnızca tek sayfada kullanılıyorsa o route klasöründe `_components/` altında tutulabilir; ikinci kullanımda `components/`a taşı.
- Dosya 300 satırı geçiyorsa bölmeyi düşün.

## TypeScript kuralları

- `any` KULLANMA; tip bilinmiyorsa `unknown` + daraltma.
- Veri modelleri için `interface` yerine `type` tercih et, tutarlı ol.
- Supabase sorgu sonuçlarını mutlaka tiplendir; tablo tipleri `types/` altında tek yerde tanımlanır ve her yerde oradan import edilir.
- Nullable alanları tipte açıkça göster (`string | null`), UI'da güvenli işle.

## Server / Client ayrımı (App Router)

- Varsayılan Server Component; `"use client"` yalnızca gerçekten gerektiğinde (state, event, browser API).
- **Sürüm notu:** bu skill Next 14 örnekleriyle yazıldı. Next 15+/16'da `cookies()`, `headers()`, `params`, `searchParams` asenkrondur (`await`) ve `middleware.ts` yerine `proxy.ts` kullanılır; projenin sürümü CLAUDE.md'de yazar, örnekler ona uyarlanır. Supabase tablo tipleri elle yazılmak yerine `supabase gen types typescript` çıktısından üretilip `types/` altına alınır.
- Veri çekme öncelik sırası: Server Component içinde doğrudan Supabase → Server Action (mutasyon) → Route Handler (webhook/harici erişim). Client'tan doğrudan fetch en son çare.
- Supabase client'ları ayrı dosyalarda: server için cookie tabanlı client (`lib/supabase/server.ts`), client component'ler için browser client (`lib/supabase/client.ts`). İkisini karıştırma.
- `SUPABASE_SERVICE_ROLE_KEY` yalnızca server tarafında kullanılır, ASLA client bundle'a sızmamalı. `NEXT_PUBLIC_` öneki sadece gerçekten public değerlerde.

## Mutasyonlar ve formlar

- Mutasyonlar Server Action ile yapılır; action içinde:
  1. Auth kontrolü (oturum var mı, rol yetkili mi — roller CLAUDE.md'de)
  2. Girdi doğrulama (zod tercih edilir)
  3. Supabase işlemi + hata yakalama
  4. `revalidatePath()` / `revalidateTag()`
  5. Kullanıcıya Türkçe sonuç mesajı döndür (`{ success, message }` deseni)
- Formlarda loading durumu göster (buton disabled + "Kaydediliyor..."), hata mesajını formun yanında Türkçe göster.
- Silme gibi geri dönüşsüz işlemlerde onay iste (confirm modal).

## Hata yönetimi

- Supabase çağrılarında `error`'ı asla sessizce yutma; logla (`console.error` + anlamlı bağlam) ve kullanıcıya genel Türkçe mesaj göster ("Bir hata oluştu, lütfen tekrar deneyin").
- Teknik hata detayını (SQL mesajı vb.) kullanıcıya GÖSTERME.
- Route handler'larda uygun HTTP status kodu döndür.

## Tailwind / UI kuralları

- Inline style kullanma; her şey Tailwind class'ları ile.
- Marka renkleri Tailwind config'de tanımlanır (`primary`, `secondary` gibi semantik adlarla) ve class'larda semantik ad kullanılır — hex kodu doğrudan class içine yazma. Renk değerleri CLAUDE.md'de.
- Mobil öncelikli tasarım: önce mobil görünüm, sonra `md:` / `lg:` breakpoint'leri.
- Tekrarlanan class kombinasyonları için component çıkar; `@apply` kullanma.
- Erişilebilirlik: buton yerine div kullanma, form elemanlarına label ver, anlamlı `alt` metni yaz.

## Çıktı formatı

- Kodu dosya yoluyla birlikte ver: her bloğun başında `// app/musteriler/page.tsx` gibi yorum.
- Birden fazla dosya değişiyorsa önce 1-2 cümlelik plan, sonra dosya dosya kod.
- Mevcut kodu değiştirirken tüm dosyayı değil, değişen bölümü net bağlamla ver (Claude Code kullanılıyorsa doğrudan edit talimatı yeterli).
- Kurulum gereken paket varsa komutunu ekle (`npm install zod`).

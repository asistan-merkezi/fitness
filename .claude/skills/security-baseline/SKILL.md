---
name: security-baseline
description: Web uygulaması güvenlik taban çizgisi (rate limiting, input validation, CORS, güvenlik header'ları, dosya yükleme güvenliği, log hijyeni, LLM çağrı güvenliği). Kullanıcı güvenlik iyileştirmesi, rate limit, input validation, XSS/injection koruması, CORS ayarı, dosya upload güvenliği, API güvenliği veya güvenlik denetimi istediğinde MUTLAKA bu skill'i kullan. "Güvenli mi", "rate limit ekle", "validation yap", "güvenlik kontrolü", "header ekle", "upload güvenliği" gibi ifadeler geçtiğinde de kullan. Yeni endpoint, form veya upload eklerken de otomatik uygulanır. Next.js + Supabase için pratik, denetlenebilir güvenlik standartları üretir.
---

# Security Baseline

Her projede geçerli güvenlik taban çizgisi (Next.js 14 + Supabase + Vercel).

## 1. Rate limiting

- Public API route'ları ve auth endpoint'leri (login, kayıt, şifre sıfırlama) rate limit'siz yayına çıkmaz.
- Standart: Upstash Redis + `@upstash/ratelimit` (Vercel'de çalışır) veya Vercel WAF kuralları.
- Katmanlar: IP bazlı genel limit + kullanıcı bazlı limit (auth sonrası) + hassas endpoint'lerde sıkı limit (ör. login: 5 deneme/dk).
- Limit aşımında 429 + `Retry-After` header'ı; log'a kaydet.

## 2. Sunucu tarafı input validation

- **Her** API route ve server action girdisi Zod ile doğrulanır — client-side validation sadece UX'tir, güvenlik değildir.
- Şema "whitelist" yaklaşımıyla yazılır: beklenen alanlar tanımlanır, fazlası `strict()` ile reddedilir.
- String alanlarda max length zorunlu; sayısal alanlarda aralık; ID'lerde format (uuid).
- SQL injection: Supabase client parametrize eder, ancak `rpc` içine ham string birleştirme yasak.
- XSS: kullanıcı içeriği render edilirken `dangerouslySetInnerHTML` yasak; zorunluysa DOMPurify ile sanitize.
- SSRF: kullanıcıdan gelen URL'ye sunucudan istek atılıyorsa (webhook hedefi, URL'den görsel çekme, scraper) izinli alan adı listesi uygula, iç ağ/metadata adreslerini (127.0.0.0/8, 10.0.0.0/8, 169.254.169.254 vb.) engelle, yönlendirmeleri takip etme.

## 3. CORS

- API route'larda CORS varsayılan olarak **kapalı** (same-origin). Açılması gerekiyorsa origin whitelist ile — `*` production'da yasak.
- Webhook endpoint'leri CORS'a değil imza doğrulamaya güvenir (bkz. api-integration).

## 4. Güvenlik header'ları

`next.config.js` headers ile tüm sayfalara:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains` — `preload` yalnızca tüm alt alan adları kalıcı HTTPS'e hazırsa ve bilinçli kararla eklenir (preload listesinden çıkmak aylar sürer)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (iframe gömme ihtiyacı yoksa)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`: kullanılmayan API'ler kapalı (camera, microphone, geolocation)
- CSP: en azından `frame-ancestors 'none'`; tam CSP kademeli sıkılaştırılır (önce report-only).

## 5. Dosya yükleme güvenliği

- Uzantıya değil **MIME type + magic bytes** kontrolüne güven; whitelist yaklaşımı (sadece izin verilen tipler).
- Max boyut sunucuda zorlanır (client'taki limit yetmez).
- Dosya adı asla olduğu gibi kullanılmaz: UUID ile yeniden adlandır, path traversal (`../`) imkânsızlaşır.
- Storage bucket'ları private varsayılan; public URL yerine signed URL (süreli) tercih edilir.
- Yüklenen dosya asla execute edilebilir konuma yazılmaz.

## 6. Hata ve log hijyeni

- Kullanıcıya dönen hata mesajı **jenerik** ("Bir hata oluştu"); stack trace, SQL hatası, iç yapı bilgisi asla sızmaz.
- Log'lara **asla** yazılmaz: şifreler, token'lar, API key'ler, kişisel veriler (TC, kart no). Gerekirse maskele (`sk-...son4hane`).
- `console.log` ile hassas obje dump'ı yasak; production log'ları yapılandırılmış (JSON) ve seviyeli olur.
- Auth hataları ayrımsız: "e-posta veya şifre hatalı" (hangisi olduğunu söyleme — enumeration koruması).

## 7. LLM çağrı güvenliği

- Kullanıcı girdisi prompt'a **ayrılmış blokta** eklenir (delimiter/XML tag ile); sistem talimatıyla aynı düzlemde birleştirilmez.
- LLM çıktısı da girdi gibi güvensizdir: Zod ile parse edilir, doğrudan SQL/HTML/komut olarak çalıştırılmaz.
- LLM'e gönderilen veride hassas alanlar (şifre hash'i, token, tam kart no) filtrelenir.
- LLM'e verilen araçlar en az yetkiyle tanımlanır; kullanıcı adına yazma işlemi onay kapısından geçer (approval-workflow).
- Maliyet koruması: kullanıcı başına LLM çağrı limiti (rate limit ile aynı altyapı).

## 8. Deploy öncesi güvenlik kontrolü

Bu liste deploy-checklist skill'inin güvenlik bölümünü besler:

- [ ] Yeni endpoint'lerde Zod validation + rate limit var mı?
- [ ] Yeni tabloda RLS açık ve policy'ler yazılı mı? (RLS'siz tablo yayına çıkmaz)
- [ ] Env değişkenlerinde `NEXT_PUBLIC_` sızıntısı var mı?
- [ ] Hata mesajları iç bilgi sızdırıyor mu?
- [ ] Upload varsa tip/boyut/isim kontrolü tam mı?
- [ ] `npm audit` critical/high temiz mi?

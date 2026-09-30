---
name: auth-flow
description: Supabase Auth ile kimlik doğrulama ve yetkilendirme akışları üretim standartları. Kullanıcı giriş/kayıt sayfası, şifreli giriş, magic link, şifre sıfırlama, oturum yönetimi, middleware koruması, rol bazlı yetkilendirme veya korumalı sayfa istediğinde MUTLAKA bu skill'i kullan. "Login yap", "giriş ekranı", "auth ekle", "şifremi unuttum", "rol kontrolü", "sayfayı koru" gibi ifadeler geçtiğinde de kullan. Next.js 14 App Router + Supabase Auth için güvenli, eksiksiz auth akışları üretir.
---

# Auth Flow

Next.js 14 (App Router) + Supabase Auth için kimlik doğrulama ve yetkilendirme standartları. Projeye özel detaylar (roller, tenant yapısı, yönlendirme hedefleri, e-posta şablonları) CLAUDE.md'dedir — bu skill evrensel akışı taşır.

## Giriş yöntemi seçimi

Projeye göre uygun yöntemi seç (CLAUDE.md'de belirtilmişse onu kullan):

- **E-posta + şifre**: İç kullanıcılı, rol bazlı SaaS panelleri için varsayılan.
- **Magic link**: Şifre yönetimi istenmeyen, seyrek girişli uygulamalar için. Callback route'u zorunlu.
- İkisi birlikte de sunulabilir; giriş sayfasında sekme/geçiş ile.

## Temel mimari kuralları

- Supabase client ayrımı şart: server tarafında cookie tabanlı client (`@supabase/ssr` ile `lib/supabase/server.ts`), client component'lerde browser client (`lib/supabase/client.ts`).
- Oturum tazeleme `middleware.ts` içinde yapılır — her istekte session cookie'sini yenileyen standart `@supabase/ssr` deseni.
- Korumalı alanlar iki katmanda savunulur:
  1. **Middleware**: oturum yoksa `/giris`e yönlendir (kaba koruma, UX için).
  2. **Sayfa/Action içinde**: `getUser()` ile doğrula (gerçek güvenlik burada — middleware tek başına güvenlik katmanı DEĞİLDİR).
- Server tarafında kimlik doğrularken `getUser()` kullan, `getSession()`a güvenme (`getUser()` token'ı Supabase'e doğrulatır).
- **Sürüm notu (Next 16 / güncel Supabase):** Next 16'da `middleware.ts` yerine `proxy.ts` kullanılır (aynı `@supabase/ssr` oturum yenileme deseni, yeni dosya adı); `cookies()`/`headers()`/`params` asenkrondur (`await`). Projede JWT signing keys açıksa Supabase yerel JWT doğrulaması için `getClaims()`'i öneriyor — güncel Supabase dokümanına bak ve kararı CLAUDE.md'ye yaz; `getUser()` her durumda geçerli ve en katı seçenektir.
- Asıl veri güvenliği RLS'tedir; auth katmanı UX + ilk savunma hattıdır. "Middleware var, RLS'e gerek yok" ASLA kabul edilmez.

## Standart akışlar

### Giriş (şifreli)

- `/giris` sayfası: e-posta + şifre formu, Türkçe etiketler ve hatalar.
- Hata mesajları genel tutulur: "E-posta veya şifre hatalı" — hangisinin yanlış olduğunu söyleme (enumeration koruması).
- Başarılı girişte rol/tenant'a göre yönlendirme (hedefler CLAUDE.md'de).
- Loading durumu: buton disabled + "Giriş yapılıyor...".

### Kayıt

- Kayıt herkese açık mı, davetle mi? CLAUDE.md'ye bak; SaaS panellerde genelde davet/admin oluşturma modeli geçerlidir — bu durumda public kayıt sayfası YAPMA.
- Public kayıt varsa: şifre en az 8 karakter, e-posta doğrulama akışı (`emailRedirectTo` ile callback), "doğrulama e-postası gönderildi" ekranı.

### Magic link

- `signInWithOtp({ email, options: { emailRedirectTo } })` + `/auth/callback` route handler'ı (`exchangeCodeForSession`).
- Callback sonrası yönlendirme hedefi query param ile taşınabilir (`?next=/panel`), ama open redirect'e karşı yalnızca kendi origin'ine izin ver.

### Şifre sıfırlama

- "Şifremi unuttum" → `resetPasswordForEmail` (redirect: `/sifre-yenile`) → yeni şifre formu → `updateUser({ password })`.
- Var olmayan e-posta için de aynı mesajı göster: "Eğer bu e-posta kayıtlıysa sıfırlama bağlantısı gönderildi."

### Çıkış

- Server Action ile `signOut()` + `/giris`e redirect. Client tarafında yalnızca çağrı yap, temizliği server'a bırak.

## Rol bazlı yetkilendirme

- Roller veritabanında tutulur (profil/üyelik tablosu — adları CLAUDE.md'de), ASLA yalnızca client state'te değil.
- Rol kontrolü için tek bir yardımcı kullan (ör. `requireRole(['admin'])` deseni): oturum + rol kontrolünü yapar, yetkisizse redirect/hata döndürür. Her sayfada kopyala-yapıştır kontrol bloğu yazma.
- UI'da yetkisiz öğeleri gizlemek yeterli DEĞİLDİR; server action ve RLS'te de aynı kontrol olmalı.
- Multi-tenant projelerde rol her zaman tenant bağlamıyla birlikte kontrol edilir (kullanıcı X tenant'ında admin, Y'de değil).

## Güvenlik kontrol listesi

Her auth işi tesliminde şunlar sağlanmış olmalı:

- [ ] `SERVICE_ROLE_KEY` client'a sızmıyor
- [ ] Server tarafında `getUser()` ile doğrulama var
- [ ] Hata mesajları kullanıcı enumeration'a izin vermiyor
- [ ] Redirect hedefleri open redirect'e kapalı
- [ ] Korumalı her mutasyon (server action) kendi auth kontrolünü yapıyor
- [ ] RLS politikaları auth katmanından bağımsız olarak veriyi koruyor

## Çıktı formatı

- Dosya yoluyla birlikte kod ver (`// middleware.ts`, `// app/giris/page.tsx` ...).
- Akış birden çok dosyaya yayılıyorsa önce 2-3 maddelik akış özeti, sonra dosyalar.
- Gerekli env değişkenlerini ve Supabase Dashboard ayarlarını (redirect URL whitelist gibi) sonda kısa "Kurulum" notu olarak listele.

---
name: email-service
description: Resend ile transactional e-posta gönderim standartları. Kullanıcı e-posta gönderme, bildirim maili, hoş geldin e-postası, şifre sıfırlama maili, e-posta şablonu, domain doğrulama veya Resend entegrasyonu istediğinde MUTLAKA bu skill'i kullan. "Mail gönder", "e-posta ekle", "Resend bağla", "bildirim maili", "e-posta şablonu" gibi ifadeler geçtiğinde de kullan. Next.js + Resend için güvenli, teslim edilebilirliği yüksek e-posta altyapısı üretir.
---

# Email Service (Resend)

Next.js projelerinde Resend ile transactional e-posta gönderim standartları. Projeye özel detaylar (domain, from adresleri, şablon içerikleri, hangi olayda hangi mail) CLAUDE.md'dedir — bu skill evrensel kurulum ve gönderim desenini taşır.

## Kurulum ve yapılandırma

- Paket: `npm install resend`. React şablonları kullanılacaksa: `npm install @react-email/components`.
- API key `RESEND_API_KEY` env değişkeninde; YALNIZCA server tarafında kullanılır (server action / route handler). Client'tan asla mail gönderilmez.
- **Bölge/veri konumu**: Avrupa kullanıcı verisi işleniyorsa Resend'in EU bölgesini tercih et (dashboard'dan domain eklerken seçilir). Projede bölge belirtilmişse CLAUDE.md'ye uy.
- Tek bir gönderim yardımcısı oluştur (`lib/email.ts`): Resend client'ı burada kur, tüm gönderimler bu dosyadaki fonksiyonlar üzerinden yapılır. Sayfalara dağınık `new Resend()` çağrısı YAPMA.

## Domain ve teslim edilebilirlik

- Production'da mutlaka doğrulanmış özel domain kullan; `onboarding@resend.dev` yalnızca geliştirme içindir.
- Domain doğrulama adımlarını kullanıcıya net ver: Resend dashboard → Domains → domain ekle → verilen SPF ve DKIM (ve varsa MX/Return-Path) kayıtlarını DNS'e ekle (Cloudflare kullanılıyorsa proxy KAPALI, yalnızca DNS). Doğrulama tamamlanmadan gönderim yapma.
- From adresi deseni: insan-okur ad + doğrulanmış domain → `"Uygulama Adı <bildirim@ornekdomain.com>"`. Adresler CLAUDE.md'de tanımlıysa onları kullan.
- Kullanıcının yanıtlaması istenen maillerde `replyTo` ekle; noreply kültürü yerine mümkünse gerçek bir adres tercih et.

## Gönderim deseni

Standart yardımcı fonksiyon yapısı:

```typescript
// lib/email.ts
import { Resend } from 'resend';

// Lazy oluştur: modül seviyesinde `new Resend(...)` key yoksa constructor'da hata atar
// ve Next build'i import anında düşer (env'siz CI/preview).
let client: Resend | null = null;
function getResend(): Resend {
  client ??= new Resend(process.env.RESEND_API_KEY);
  return client;
}

type SendResult = { success: boolean; message: string };

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<SendResult> {
  try {
    const { error } = await getResend().emails.send({
      from: process.env.EMAIL_FROM!, // "Uygulama <bildirim@domain.com>"
      ...params,
    });
    if (error) {
      console.error('Resend error:', error);
      return { success: false, message: 'E-posta gönderilemedi.' };
    }
    return { success: true, message: 'E-posta gönderildi.' };
  } catch (err) {
    console.error('Email send failed:', err);
    return { success: false, message: 'E-posta gönderilemedi.' };
  }
}
```

Kurallar:

- Her mail türü için ayrı, anlamlı isimli fonksiyon: `sendHosgeldinEmail()`, `sendTeklifEmail()` — hepsi içeride `sendEmail()`i çağırır.
- **Mail gönderimi ana işlemi bloke etmemeli**: kayıt/sipariş kaydedildikten SONRA mail gönder; mail hata verirse işlemi geri alma, logla ve devam et. Kritik bildirimlerde başarısızlığı kullanıcıya nazikçe belirt.
- Toplu gönderimde (çok alıcı) `batch` endpoint'ini kullan veya alıcıları `bcc` yerine ayrı ayrı gönder — alıcılar birbirini GÖRMEMELİ.
- Rate limit'e karşı toplu işlerde araya küçük gecikme koy veya kuyruk mantığı öner.

## Şablonlar

- Basit mailler için inline HTML string yeterli; çok şablonlu projelerde `@react-email/components` ile `emails/` klasöründe React şablonları kullan.
- Şablon dili Türkçe (proje farklı belirtmediyse). Konu satırı kısa ve net: "Şifre sıfırlama bağlantınız", "Yeni kayıt: {ad}".
- HTML şablon temelleri: 600px genişlik, inline CSS, tek sütun, mobil uyum; görsele değil metne dayan (görseller engellenebilir). Önemli bağlantıyı belirgin buton + altına düz link olarak ver.
- Zorunlu içerik: gönderen kimliği net olmalı; pazarlama niteliği taşıyan maillerde abonelikten çıkma yolu ekle (transactional maillerde şart değil).
- **Türkiye, ticari ileti:** pazarlama/kampanya e-postası 6563 sayılı Kanun gereği alıcının onayına ve İYS (İleti Yönetim Sistemi) kaydına dayanır; onaysız alıcıya gönderilmez. Transactional mailler (şifre sıfırlama, sipariş bilgisi) bu kapsamın dışındadır. Ayrıntı: kvkk-legal.
- Retry eden gönderim akışlarında çift mail riskine karşı Resend'in idempotency key desteğini kullan (güncel SDK dokümanına bak).

## Test ve doğrulama

- Geliştirmede gerçek kullanıcı adreslerine gönderme; kendi test adresini kullan.
- Teslim sonrası kontrol: Resend dashboard → Emails bölümünden delivered/bounced durumunu doğrula.
- Bounce/complaint oranı yüksekse gönderimi durdur ve DNS kayıtlarını + içerik spam skorunu kontrol et.

## Çıktı formatı

- Dosya yoluyla kod ver (`// lib/email.ts`, `// emails/hosgeldin.tsx` ...).
- Sonda kısa "Kurulum" notu: gerekli env değişkenleri (`RESEND_API_KEY`, `EMAIL_FROM`), DNS adımları (gerekiyorsa), test önerisi.

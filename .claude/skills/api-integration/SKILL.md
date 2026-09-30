---
name: api-integration
description: Dış API ve üçüncü parti servis entegrasyonu üretim standartları (REST API, OAuth, webhook, SDK sarmalayıcı). Kullanıcı bir dış servise bağlanma, API client yazma, webhook alma, OAuth bağlantısı, token yönetimi, rate limit/retry stratejisi veya entegrasyon hatası çözme istediğinde MUTLAKA bu skill'i kullan. "API'ye bağlan", "entegrasyon yaz", "webhook kur", "token yenile", "dış servisten veri çek", "SDK sarmala" gibi ifadeler geçtiğinde de kullan. Dayanıklı, güvenli, değiştirilebilir dış servis katmanları üretir.
---

# API Integration

Dış servis entegrasyonlarında mimari ve güvenlik standartları (Next.js 14 + Supabase).

## 1. Sağlayıcı başına tek sarmalayıcı modül

- Her dış servis için tek modül: `src/lib/integrations/<provider>.ts` (büyürse klasör).
- Uygulamanın geri kalanı sağlayıcının SDK'sını veya endpoint'lerini **asla doğrudan çağırmaz** — sadece sarmalayıcının fonksiyonlarını kullanır.
- Amaç: sağlayıcı değişirse (ör. farklı bir kur API'si) tek dosya değişir.

## 2. Dış şema içeri sızmaz (boundary transform)

- Sağlayıcının yanıt şeması uygulama içine taşınmaz. Sarmalayıcı sınırda dönüşüm yapar:
  1. Ham yanıt **Zod** ile parse edilir (beklenmeyen yapı = anlaşılır hata).
  2. Uygulamanın kendi domain tipine dönüştürülerek döndürülür.
- Uygulama içinde `data.attributes.price_cents` gibi sağlayıcı alan adları görünüyorsa sınır delinmiştir.

## 3. Kimlik bilgileri

- API key'ler yalnızca sunucu tarafında: env değişkeni, `NEXT_PUBLIC_` öneki asla kullanılmaz.
- Sarmalayıcı modülün başına `import 'server-only'` konur — client bundle'a sızma derlemede yakalanır.
- OAuth token'ları veritabanında **şifrelenmiş** saklanır (Supabase Vault veya pgcrypto); düz metin token kolonu yasak.
- Token yenileme **tek noktadan**: sarmalayıcı içinde `getValidToken()` benzeri tek fonksiyon; süresi dolmuşsa yeniler, eşzamanlı yenileme yarışına karşı korumalıdır. Uygulamanın başka hiçbir yeri refresh akışını bilmez.

## 4. Dayanıklılık standartları

Her dış çağrıda:
- **Timeout**: varsayılan 10 sn (AbortController). Sonsuz bekleme yok.
- **Retry + backoff**: yalnızca geçici hatalarda (429, 5xx, ağ hatası) en fazla 3 deneme, üstel bekleme (1s → 2s → 4s) + jitter. 4xx (429 hariç) retry edilmez.
- **Hata sınıflandırması**: sarmalayıcı hataları üç sınıfa ayırıp fırlatır: `RetryableError` (geçici), `ClientError` (bizim istek hatalı), `AuthError` (kimlik/token). Çağıran taraf sınıfa göre davranır.
- **Idempotency key**: yazma işlemlerinde (ödeme, sipariş, gönderim) sağlayıcı destekliyorsa idempotency key gönderilir; retry çift kayıt üretmez.
- **Circuit breaker** (yoğun kullanılan servislerde): art arda N hata sonrası devre açılır, X süre boyunca çağrı yapılmadan hızlı hata dönülür; süre sonunda tek deneme ile devre kapanır. Serverless'ta bellek içi durum çağrılar arasında korunmaz; devre durumu Redis/DB'de tutulur veya bu desen atlanıp timeout + retry ile yetinilir.

## 5. Webhook alma standartları

- **İmza doğrulama zorunlu**: sağlayıcının imza header'ı (HMAC vb.) doğrulanmadan payload işlenmez. Doğrulama başarısızsa 401, log'a kaydet.
- İmza **ham body** üzerinden hesaplanır: Next.js route handler'da önce `await req.text()` ile ham metni oku, doğruladıktan SONRA `JSON.parse` et; önce `req.json()` çağrılırsa imza eşleşmez. Karşılaştırmada sabit zamanlı karşılaştırma (`timingSafeEqual`) kullan.
- **Hızlı ack, asenkron işle**: webhook handler 200'ü hemen döner (payload'ı `webhook_events` tablosuna ham kaydettikten sonra); asıl işleme arka planda/cron ile yapılır (serverless'ta yanıt döndükten sonra biten fire-and-forget iş kesilebilir: `waitUntil`/`after()` veya kuyruk/cron kullan). Sağlayıcı timeout'una takılıp duplicate teslimat tetiklenmez.
- **Idempotent işleme**: her event, sağlayıcının event ID'siyle unique kayıt edilir; aynı event ikinci kez gelirse sessizce atlanır.
- Test için: sağlayıcının test/sandbox event'leri prod tablosuna işlenmez (mode alanı kontrol edilir).

## 6. Versiyon sabitleme

- API versiyonu her zaman **açıkça sabitlenir** (URL'de `/v2/`, header'da version pinning). "Latest" kullanılmaz.
- Sarmalayıcının başına yorum: kullanılan versiyon + dokümantasyon linki + son gözden geçirme tarihi.

## Dosya iskeleti

```
src/lib/integrations/
  binance.ts          ← sarmalayıcı (server-only)
  binance.types.ts    ← domain tipleri + Zod şemaları
src/app/api/webhooks/
  binance/route.ts    ← imza doğrula → ham kaydet → 200 → asenkron işle
```

## Kontrol listesi (yeni entegrasyon)

- [ ] Sarmalayıcı modül tek mi, `server-only` mi?
- [ ] Zod sınır dönüşümü var mı, dış şema içeri sızıyor mu?
- [ ] Timeout + sınıflandırılmış hata + retry politikası tanımlı mı?
- [ ] Token'lar şifreli mi, refresh tek noktada mı?
- [ ] Webhook imzası doğrulanıyor mu, işleme idempotent mi?
- [ ] API versiyonu sabitlenmiş mi?

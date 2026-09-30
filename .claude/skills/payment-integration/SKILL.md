---
name: payment-integration
description: Ödeme entegrasyonu üretim standartları — Türkiye'deki lisanslı ödeme kuruluşları (sanal POS), QR ile ödeme, abonelik tahsilatı, fiziki POS/ÖKC senkronizasyonu, iade-iptal akışları ve günlük mutabakat. Kullanıcı ödeme alma, sanal POS bağlama, iyzico/PayTR tarzı entegrasyon, QR ödeme, abonelik ödemesi, 3D Secure, iade/iptal akışı, ödeme webhook'u veya mutabakat istediğinde MUTLAKA bu skill'i kullan. "Ödeme entegre et", "sanal POS", "kart ile ödeme", "iade akışı", "ödeme webhook", "mutabakat", "chargeback" gibi ifadeler geçtiğinde de kullan. Genel API tekniği api-integration'a tabidir — bu skill paranın söz konusu olduğu yerdeki ek disiplinleri taşır. PCI kapsamını daraltan, çift kayıt tutmayan, mutabakatı zorunlu kılan ödeme katmanları üretir.
---

# Payment Integration (Ödeme Entegrasyonu)

Para hareketi olan tüm entegrasyonların standartları. Genel dış servis kuralları (wrapper, retry, webhook imzası) api-integration'dan gelir — burada yalnızca ödemeye özgü SIKILAŞTIRMALAR vardır. Fiyat/paket kararı pricing'e, iptal-iade hukuki metinleri kvkk-legal'e aittir.

## Temel ilkeler

1. **Kart verisine asla dokunma**: Kart numarası bizim sunucumuza, veritabanımıza ve loglarımıza HİÇBİR biçimde girmez. Ödeme kuruluşunun hosted form/iframe/SDK çözümü kullanılır; PCI-DSS kapsamı ödeme kuruluşunda kalır. "Kartı biz alıp API'ye iletelim" tasarımı reddedilir.
2. **Yalnızca lisanslı kuruluş**: Türkiye'de TCMB lisanslı ödeme/e-para kuruluşları veya banka sanal POS'u kullanılır. Lisanssız aracıyla para akışı kurulmaz; hangi kuruluşun seçileceği güncel koşullarla (komisyon, hakediş süresi, sektör kabulü — restoran gibi sektörlerde farklılaşır) karşılaştırılarak önerilir, güncel bilgi web'den doğrulanır.
3. **Ödeme durumu tek doğruluk kaynağından**: Sipariş "ödendi"ye YALNIZCA ödeme kuruluşundan doğrulanmış sinyalle geçer (imzası doğrulanmış webhook veya sunucudan yapılan sorgulama). Kullanıcının tarayıcısından dönen "başarılı" parametresiyle sipariş kapatılmaz. Doğrulama sırasında kuruluşun bildirdiği **tutar ve para birimi** siparişin beklenen değeriyle karşılaştırılır; uyuşmazlık kabul edilmez, insan kuyruğuna düşer. Webhook imzası ham body üzerinden doğrulanır (api-integration).
4. **Para tutarları integer**: Tüm tutarlar kuruş cinsinden tamsayı saklanır ve hesaplanır; float ile para hesabı yasak. Para birimi kolonu her tutarın yanında durur.
5. **Idempotency zorunlu**: Her ödeme isteği idempotency key taşır; webhook işleme idempotenttir (aynı event iki kez gelirse ikinci işlem no-op). Çift tahsilat, çift sipariş, çift iade yapısal olarak imkânsız kılınır.

## Durum makinesi ve kayıt

- Ödeme durumları kısıtlı geçişli durum makinesidir: `pending → authorized → captured → refunded/partially_refunded` + `failed/cancelled`. Serbest metin durum yasak (approval-workflow durum makinesi disipliniyle aynı).
- Her durum geçişi insert-only ödeme olay tablosuna yazılır: kim/ne tetikledi, ödeme kuruluşu referans no, ham yanıtın güvenli özeti. Ödeme kaydı asla UPDATE ile "düzeltilmez" — düzeltme yeni olaydır.
- Loglarda maskeleme: kart son 4 hane + kuruluş referansı loglanabilir; CVV, tam PAN, 3DS şifreleri hiçbir yerde (security-baseline log hijyeni).

## İade, iptal ve chargeback

- İade her zaman orijinal ödeme kaydına bağlanır; tutar toplamı orijinali aşamaz (kısmi iadeler toplamda kontrol edilir).
- İade yetkisi rol bazlıdır ve approval-workflow'dan geçer (eşik üstü iadeler insan onayı ister); agent'lar iade BAŞLATAMAZ, yalnızca önerir.
- Chargeback (ters ibraz) süreci için kanıt paketi hazır tutulur: sipariş kaydı, teslim/ifa kanıtı, iletişim geçmişi — talep geldiğinde toplanmaya başlanmaz.
- QR/masa ödemede kısmi ödeme ve hesap bölüşme durumları baştan tasarlanır: adisyon toplamı ↔ tahsilat toplamı eşitliği her kapanışta doğrulanır.

## Fiziki POS / ÖKC gerçeği

- Türkiye'de fiziki satışta ÖKC (yeni nesil yazar kasa POS) mevzuatı vardır; platform, ÖKC'nin yerine geçmez — onunla YAN YANA çalışacak şekilde tasarlanır (adisyon platformda, mali kayıt ÖKC/e-belgede). Bu sınır mimari dokümanda açıkça yazılır ve mali müşavir onayı gereken noktalar işaretlenir.
- Fiziki POS tahsilatları platforma manuel/entegre işlenirken kaynak etiketi taşır (nakit / fiziki POS / online) — mutabakat bu etiketlerle yapılır.

## Günlük mutabakat (reconciliation)

- Her gün otomatik mutabakat çalışır: platform kayıtları ↔ ödeme kuruluşu raporu. Eşleşmeyen her kayıt (tutarda fark, bizde olup onlarda olmayan, tersi) ayrı listelenir.
- Mutabakat sonucu telegram-bot formatıyla raporlanır (✅ eşleşen / ⚠️ fark / ❌ eksik); fark sıfırlanmadan dönem kapatılmaz.
- Hakediş (payout) takibi ayrı yapılır: kuruluşun yatırdığı toplam ↔ o döneme ait net tahsilat − komisyon. Komisyon oranı sözleşmedekiyle karşılaştırılır.

## Test ve yayın

- Ödeme akışı sandbox'ta uçtan uca test edilmeden production anahtarı yazılmaz; testing skill'i kapsamında en az: başarılı ödeme, 3DS red, webhook gecikmesi, çift webhook, kısmi iade senaryoları.
- Production anahtarları yalnızca sunucu tarafında ve secret yönetiminde (enforcement-hooks sızıntı taraması kapsamında); anahtar rotasyon prosedürü sop-builder formatında yazılır.

---
name: testing
description: Next.js + Supabase projelerinde test yazım ve strateji standartları (Vitest + React Testing Library + Playwright). Kullanıcı test yazma, test stratejisi, unit/integration/e2e test, RLS testi, regresyon testi, coverage veya CI test gate istediğinde MUTLAKA bu skill'i kullan. "Test yaz", "test ekle", "bunu test edelim", "coverage", "e2e", "RLS'i test et", "flaky test" gibi ifadeler geçtiğinde de kullan. Davranış odaklı, bakımı kolay, CI'a bağlanabilir test setleri üretir.
---

# Testing

Next.js 14 + TypeScript + Supabase projelerinde test standartları.

## Araç seti ve piramit

| Katman | Araç | Kapsam | Oran (yaklaşık) |
|---|---|---|---|
| Unit | Vitest | Saf fonksiyonlar, hesaplama, dönüşüm, validasyon | %70 |
| Component/Integration | Vitest + React Testing Library | Form davranışı, koşullu render, hook'lar | %20 |
| E2E | Playwright | Kritik kullanıcı akışları (giriş, teklif oluşturma, onay) | %10 |

Piramidi tersine çevirme: E2E test yavaş ve kırılgandır, sadece paranın/verinin aktığı kritik yolculuklara yazılır.

Not: asenkron Server Component'ler Vitest + React Testing Library ile doğrudan render edilemez; mantığı saf fonksiyona veya ayrı bir (senkron) bileşene çıkarıp onu test et, sayfanın bütününü Playwright ile doğrula. Server Action içindeki iş mantığı da ayrı fonksiyona alınıp unit test edilir.

## Temel ilkeler

### 1. Davranış > Coverage
- Coverage yüzdesi hedef değildir; hedef, davranışın doğrulanmasıdır.
- Test adı davranışı anlatır: `"KDV oranı %20 iken brüt tutarı doğru hesaplar"` — `"test calculateTotal"` değil.
- Implementasyon detayını test etme (internal state, private fonksiyon); dışarıdan gözlenen sonucu test et.

### 2. Deterministik çekirdeği test et
- Skorlama, metraj hesabı, fiyatlandırma, tarih/saat mantığı gibi **deterministik iş mantığı** birincil test hedefidir.
- **LLM çıktısı unit test edilmez.** LLM yanıtları için test yerine **şema validasyonu** yazılır (Zod ile): yapı doğru mu, zorunlu alanlar var mı, değerler aralıkta mı. İçeriğin "doğruluğu" assert edilmez.
- LLM çağrısı yapan fonksiyonların testi: LLM mock'lanır, mock yanıt üzerinden akışın (parse, kayıt, hata yolu) doğru işlediği doğrulanır.

### 3. RLS ve tenant izolasyonu testi
Multi-tenant projelerde en kritik test sınıfı budur:
- İki test tenant'ı oluştur (seed script ile).
- Tenant A'nın kullanıcısı ile Tenant B'nin verisine SELECT/INSERT/UPDATE/DELETE dene — hepsi **boş sonuç veya hata** dönmeli.
- Rol bazlı erişim: her rol için erişebildiği ve erişemediği en az bir tablo test edilir.
- Bu testler Supabase'e gerçek bağlantıyla (test projesi/branch) koşulur; RLS mock'lanarak test edilemez.

### 4. Regresyon kuralı
- Production'da yakalanan her bug, düzeltilmeden **önce** o bug'ı üreten bir test yazılır (kırmızı), sonra düzeltilir (yeşil).
- Test dosyasına yorum: `// Regresyon: <kısa bug tanımı, tarih>`.

### 5. Flaky teste sıfır tolerans
- Kararsız (bazen geçen bazen kalan) test tespit edilirse aynı gün ya düzeltilir ya silinir. `retry` ile maskeleme yasak.
- Yaygın nedenler: gerçek zamana bağımlılık (sabit saat mock'la), sıralamaya bağımlılık (testler bağımsız olmalı), paylaşılan state (her test kendi verisini kurar/temizler).

## Dosya düzeni

```
src/
  lib/pricing.ts
  lib/pricing.test.ts        ← unit test kaynak dosyanın yanında
tests/
  integration/               ← RLS ve Supabase entegrasyon testleri
  e2e/                       ← Playwright akışları
```

## CI entegrasyonu

- `npm run test` (Vitest) her PR'da koşar; kırmızı test merge'i bloklar.
- RLS entegrasyon testleri ve Playwright, main'e merge öncesi koşar.
- Deploy öncesi test durumu **deploy-checklist** skill'indeki kontrol listesine bağlıdır: testler geçmeden deploy yok.

## Yazma sırası (yeni özellik)

1. Deterministik çekirdek fonksiyonu ve unit testini birlikte yaz.
2. Tablo/RLS değişikliği varsa izolasyon testini ekle.
3. Kullanıcıya dokunan kritik akışsa tek bir E2E senaryo ekle.
4. Coverage raporuna değil, "bu özellik bozulursa hangi test kırmızı yanar?" sorusuna bak — cevap yoksa test eksiktir.

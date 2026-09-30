---
name: accounting-sync
description: Resmi muhasebe entegrasyonu standartları — e-Fatura/e-Arşiv süreçleri, ön muhasebe/muhasebe programlarıyla (Logo, Mikro, Paraşüt vb.) senkronizasyon, KDV ayrımları, cari hesap eşleme ve dönemsel mutabakat. Kullanıcı muhasebe programına bağlanma, e-Fatura kesme/aktarma, fatura senkronu, cari eşleştirme, KDV raporu, muhasebe mutabakatı veya "muhasebeye otomatik aksın" tipi bir istek geldiğinde MUTLAKA bu skill'i kullan. "Muhasebeyle senkronize et", "e-Fatura entegrasyonu", "Logo'ya aktar", "Paraşüt bağla", "cari hesap", "KDV kırılımı", "mali müşavire rapor" gibi ifadeler geçtiğinde de kullan. Teknik API katmanı api-integration'a, para tahsilatı payment-integration'a tabidir — bu skill mali kayıtların doğruluğu ve senkron disiplinini taşır. Hiçbir çıktı mali müşavir onayının yerine geçmez.
---

# Accounting Sync (Resmi Muhasebe Senkronizasyonu)

Platform verisinin resmi muhasebe dünyasıyla senkronizasyon standartları. **Kesin çizgi: platform ön muhasebe/operasyon kaydı tutar; resmi defter, beyanname ve vergisel yorum mali müşavirin alanıdır. Mevzuata dokunan her tasarım kararı "mali müşavir onayı gerekli" etiketiyle teslim edilir.**

## Temel ilkeler

1. **Tek yön, tek sahip**: Her veri türünün tek doğruluk kaynağı ve tek akış yönü baştan tanımlanır (satış kaydı: platform → muhasebe; cari bakiye: muhasebe → platform gösterimi). Çift yönlü serbest senkron ("kim son yazdıysa o") mali veride yasaktır — çakışmada hangi tarafın kazandığı belirsiz olamaz.
2. **Mali kayıt değişmez (immutable)**: Muhasebeye aktarılan kayıt platformda sonradan sessizce değiştirilemez. Düzeltme, muhasebe mantığıyla yapılır: ters kayıt/iade faturası gibi YENİ kayıt üretilir; orijinal + düzeltme zinciri izlenebilir kalır (payment-integration'ın insert-only olay disipliniyle aynı).
3. **Aktarım durumu izlenir**: Her aktarılabilir kayıt durum taşır: `bekliyor → aktarıldı (karşı sistem referans no'suyla) → doğrulandı / hata`. "Gitti mi bilmiyoruz" kaydı kabul edilmez; hata kuyruğu boşalmadan dönem kapanmaz.
4. **Tutar disiplini payment-integration ile ortak**: kuruş-integer, KDV hariç tutar + KDV tutarı + KDV oranı ayrı kolonlar. Toplamdan geriye KDV "sökmek" yerine kalem bazında ileri hesap; yuvarlama farkları kalem değil belge düzeyinde tek satırda gösterilir.

## e-Belge süreçleri (e-Fatura / e-Arşiv)

- e-Belge kesimi GİB'e doğrudan değil, entegratör/özel entegratör veya muhasebe programının kendi e-belge modülü üzerinden kurgulanır; hangi mimarinin seçildiği (platform entegratöre mi, muhasebe programına mı belge kestiriyor) tasarım dokümanında tek cümleyle nettir.
- Alıcının e-Fatura mükellefi olup olmadığı belge kesiminden ÖNCE sorgulanır (mükellefse e-Fatura, değilse e-Arşiv) — yanlış tip belge en yaygın hata kaynağıdır.
- Belge numarası, ETTN/UUID ve entegratör yanıtı kayıtla birlikte saklanır; reddedilen/hatalı belgeler ayrı kuyrukta insan kararına düşer, otomatik yeniden kesim yapılmaz.
- İptal/iade belgeleri mevzuat kurallarına tabidir ve süre sınırları vardır — bu akışlar "iptal butonu" olarak değil, mali müşavir onaylı prosedür (sop-builder formatında) olarak tasarlanır.
- Restoran senaryosu netliği: ÖKC fişiyle belgelenen satış ile e-belge kesilen satış AYRI akışlardır; aynı satışın iki kez belgelenmesi (fiş + fatura mükerrerliği) yapısal olarak engellenir.

## Muhasebe programı senkronu (Logo/Mikro/Paraşüt vb.)

- api-integration wrapper kuralı geçerli: program başına tek modül, dış şema içeri sızmaz — platformun kendi kanonik "belge/cari/kalem" modeli vardır, her programa adaptörle çevrilir. Program değişimi (Paraşüt → Logo) adaptör değişimidir, veri modeli değişimi değil.
- **Cari eşleme**: platform müşterisi ↔ muhasebe carisi eşlemesi kalıcı tabloda tutulur (VKN/TCKN anahtar); eşleşemeyen kayıt tahmine dayalı eşlenmez, insan onay kuyruğuna düşer.
- **Hesap planı eşlemesi**: platform kategorileri → muhasebe hesap kodları eşlemesi mali müşavirle birlikte, konfigürasyon olarak tanımlanır; koda gömülü hesap kodu yasak.
- Toplu aktarım idempotenttir (data-pipeline upsert kuralı): aynı dönemin yeniden aktarımı mükerrer kayıt üretmez.

## Dönemsel mutabakat ve raporlama

- Aylık otomatik mutabakat: platform satış toplamları ↔ muhasebedeki karşılıkları, KDV oranı kırılımıyla; payment-integration'ın tahsilat mutabakatıyla birleşik tek özet (satış ↔ tahsilat ↔ muhasebe üçlü karşılaştırması).
- Mali müşavire giden dönem raporu standart pakettir: dönem satışları (belge tipi ve KDV kırılımıyla), iade/iptaller, eşleşmeyen kayıtlar listesi — ai-report yorum katmanı ekleyebilir ama sayılar her zaman deterministik sorgudan gelir (sql-queries).
- Ortaklıklı işletme senaryosunda pay sahiplerine mali görünürlük salt-okunur rapor katmanıdır; muhasebe verisinde rol bazlı erişim saas-patterns RLS kurallarıyla zorlanır.

## Test ve yayın

- Senkron akışları önce test ortamı/test firmasıyla doğrulanır; gerçek mali veriyle "deneme" yapılmaz.
- Yeni entegrasyonun ilk canlı dönemi gölge modda çalışır: platform aktarım DOSYASI üretir, mali müşavir manuel kontrolle işler; en az bir dönem sıfır farkla kapanmadan otomatik aktarım açılmaz.

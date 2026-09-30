---
name: pdf-generation
description: Web uygulamasından PDF üretim standartları (teklif, fatura, rapor, sözleşme, form çıktıları). Kullanıcı PDF oluşturma, PDF indirme butonu, teklif/rapor PDF'i, form çıktısı, Puppeteer/html2canvas ile PDF, sunucu tarafı PDF veya PDF şablonu istediğinde MUTLAKA bu skill'i kullan. "PDF oluştur", "PDF indir", "teklifi PDF yap", "rapor çıktısı al", "form çıktısı", "yazdırılabilir versiyon" gibi ifadeler geçtiğinde de kullan. Mobil uyumlu, Türkçe karakter sorunsuz, çok sayfalı PDF üretimi sağlar.
---

# PDF Generation

Web uygulamalarından PDF üretim standartları (teklif, fatura, rapor, elle doldurulan form tipi belgeler). Projeye özel detaylar (belge şablonları, marka öğeleri, alan içerikleri) CLAUDE.md'dedir — bu skill evrensel üretim desenini taşır.

## Yöntem seçimi

**Varsayılan: sunucu tarafı gerçek PDF (Puppeteer + `@sparticuz/chromium`).**

Karar sorusu — "metin seçilebilir olmalı mı?" DEĞİL, şu:

> **Belgede modern CSS var mı? (Tailwind v3+/v4, CSS Grid `col-span-N`, `oklch()`, `color-mix()`, custom property'li renkler)**

Varsa **html2canvas KULLANMA.** html2canvas tarayıcının layout motorunu yeniden implemente eder ve eksikleri vardır: ekranda doğru görünen sayfa PDF'te sessizce kırılır. Bu hata sınıfı yamalanarak çözülmez, her yamada bir sonraki eksik özellik çıkar.

1. **Sunucu tarafı gerçek PDF (Puppeteer + `@sparticuz/chromium`)** — varsayılan:
   - Layout motoru gerçek Chrome'dur; CSS ne ise PDF'te o çıkar.
   - Metin seçilebilir/aranabilir, dosya küçük (tipik form < 200KB).
   - Tarayıcı başlık/altbilgisi (URL, sayfa no, tarih) `page.pdf()` içinde zaten varsayılan olarak KAPALI (`displayHeaderFooter: false`) — `window.print()`'ten kaçmak için html2canvas'a geçmeye gerek yok.
   - Bedeli: Vercel function limitleri (süre, bellek, bundle boyutu) ve cold start. Aşağıdaki tuzak listesine uy.
2. **Client-side görüntü tabanlı (html2canvas + jsPDF)** — yalnızca dar bir durumda:
   - Belge basit CSS'le yazılmışsa (düz flex/blok, hex/rgb renkler, grid span yok) VE sunucu maliyeti istenmiyorsa.
   - Metin seçilemez, dosya 3-10 kat büyür.
   - Tailwind v4 kullanan bir projede bu yolu seçiyorsan `html2canvas-pro` fork'unu kullan (oklch/color-mix destekli); yine de grid span sorunu çözülmez.
3. **Programatik çizim (`pdf-lib`/`jspdf`)** — yalnızca çok basit, sabit düzenli tablolarda. Türkçe font gömme zorunlu; karmaşık tasarımda HTML → PDF tercih et.

## html2canvas'ın bilinen kırılma noktaları

Bu yolu seçtiysen ya da devraldığın kodda varsa, bilinen kırılmalar:

- **Tailwind v4 renkleri:** `color-mix(in oklab, ...)` / `oklch()` parse edilemez → üretim sessizce başarısız olur veya renkler bozulur. `html2canvas-pro` bunu çözer, diğerlerini çözmez.
- **CSS Grid `col-span-N`** (`grid-column: span N`) desteklenmez → element sınırsız genişlikte hesaplanır, içerik sağdan kesilir. Ekranda sorun görünmez.
- **`display: none`** ile gizlenmiş şablon boş canvas verir; `position: absolute; left: -9999px` kullan.
- **Harici/CORS'suz görseller** sessizce boş çıkar.

**Teşhis yöntemi (tahmin etme, ölç):** Playwright ile gerçek Chromium'da şablonun kök elementini ve tüm doğrudan çocuklarını ölç — `offsetWidth`, `scrollWidth`, `getBoundingClientRect().width`. Üçü eşitse **CSS doğrudur, sorun html2canvas'tadır**; CSS'i yamalamaya çalışma, yöntem 1'e geç.

## Puppeteer + Vercel kurulum tuzakları

Bunlar sırayla en çok zaman kaybettiren maddelerdir:

- **Sürüm eşleştirme (en kritik):** `puppeteer-core` ile `@sparticuz/chromium` AYNI Chrome sürümüne exact-pin edilmeli. Uyumsuzluk CDP protokol hatası verir ve hata mesajı yanıltıcıdır. Doğrulanmış çift: `puppeteer-core@25.1.0` + `@sparticuz/chromium@149.0.0` (Chrome 149). `npm update` bunu tekrar bozabilir — pinli tut.
- **`headless`:** yeni sürümlerde `chromium.args` zaten shell-mode flag'i içerir; `headless: true` yerine `headless: "shell"` kullan, çakışan mod verme.
- **Auth arkasındaki sayfalar:** `page.goto()` KULLANMA — login ekranını PDF'e basar. HTML'i sunucuda string olarak render edip `page.setContent(html, { waitUntil: 'networkidle0' })` kullan.
- **`setContent` ile göreli yollar kırılır:** logoyu base64 data URI olarak göm, CSS'i inline `<style>` olarak göm. Harici stylesheet/görsel linki yüklenmez.
- **Font eksikliği (Lambda):** Chromium'un Lambda derlemesinde sistem fontu minimaldir. Türkçe karakterler genelde sorunsuzdur ama garanti için `chromium.font(...)` veya `@font-face` ile base64 gömülü font kullan. Yerelde doğru görünüp production'da bozulan hataların çoğu budur.
- **Emoji KULLANMA:** `⚠` `🩸` gibi emoji karakterlerinin glyph'i emoji font'undan gelir; Lambda'da o font yoktur → boş kutu çıkar veya hiç görünmez. Bunun yerine **inline SVG ikon** kullan (`stroke="currentColor"`, 16-18px). Emoji font'u gömme — ~10MB'dır ve siyah-beyaz baskıda renkli emoji zaten anlamsızdır.
- **Route yapılandırması:** `export const runtime = 'nodejs'` (edge DEĞİL), `export const maxDuration = 60`, function memory 1769MB. Chromium cold start tek başına 3-6 saniye.
- **Bundle'a dahil etme:** `next.config` içinde `serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core']` (Next 14'te `experimental.serverComponentsExternalPackages`). Eksikse çalışma anında "Could not find Chromium" / ENOENT.
- **Kod hijyeni:** `chromium.executablePath()` **await** edilmeli (edilmezse Promise geçer, hata mesajı yanıltıcı olur); `browser.close()` `finally` bloğunda olmalı; route'ta `console.error` ile gerçek hata loglanmalı — sessiz 500 teşhis edilemez.
- **Sayfa kırılımı CSS ile:** `@media print { .bolum { break-after: page; } .bolum:last-child { break-after: auto; } .satir { break-inside: avoid; } }`. Sabit px genişlik verme — A4 genişliğini `format: 'A4'` belirler, içerik akar.

## Client-side desen (html2canvas + jsPDF)

Yalnızca yöntem 2'yi seçtiysen geçerlidir.

**Şablon component kuralları:**
- PDF görünümü ayrı bir component'tir (`TeklifPdfSablonu` gibi), sabit genişlikte tasarlanır (A4: 794px, 96dpi).
- Ekran dışında konumlandır (`position: absolute; left: -9999px`), `display: none` kullanma.
- Görseller CORS güvenli olmalı; şablonda hex/rgb renk kullan.
- Tam genişlikteki bölümlerde CSS Grid span yerine `flex flex-col` kullan.

**Çok sayfalı üretim:**
- Her sayfa AYRI DOM bloğu (`.pdf-sayfa`, A4 oranında sabit yükseklik), her blok ayrı `html2canvas` çağrısıyla yakalanıp `jsPDF.addPage()` ile eklenir. Satır ortasından bölünmeyi kökten çözer.
- Dinamik içerikte kalemleri sayfa kapasitesine göre grupla; kapasiteyi içerik yüksekliğinden hesapla.
- `scale: 2` (baskı netliği), JPEG `quality 0.9` (PNG dosyayı 3-5 kat büyütür).

**İndirme (mobil uyumluluk kritik):**
- Masaüstü: `pdf.save('dosya-adi.pdf')`.
- iOS Safari `save()` ile sorunludur: blob URL + yeni sekme veya `navigator.share`. Android WebView'da blob + anchor click daha güvenilir.
- Desen: `navigator.canShare` → share sheet → blob URL indirme → son çare yeni sekme. "İndiriliyor..." durumu göster.
- Dosya adı tarihli, Türkçe karakter ve boşluksuz: `teklif-{no}-{yyyy-mm-dd}.pdf`.

Not: Sunucu tarafı üretimde indirme, route'un `Content-Disposition: attachment; filename="..."` header'ıyla döndürülmesiyle olur; yukarıdaki mobil akış gerekmez.

## Belge tasarım standartları

### Ortak (her belge tipi)
- Yazdırma dostu: beyaz zemin, koyu metin; büyük renk blokları mürekkep israfıdır, marka rengini vurgu olarak kullan.
- Türkçe format: `Intl.NumberFormat('tr-TR')` ile para/sayı (`1.250,00 ₺`), tarih `gg.aa.yyyy`.
- Satır/tablo ortasından sayfa bölünmesi yok (`break-inside: avoid`).

### Ticari belgeler (teklif, fatura, makbuz, sözleşme)
- **HER sayfada** üstbilgi (logo + belge adı) ve altbilgi (sayfa no, tarih, iletişim) — sayfalar ayrı dolaşabildiği için her sayfanın kime ait olduğu anlaşılmalı.
- İlk sayfada belge kimliği bloğu (no, tarih, taraflar) net şekilde.
- Tablo başlık satırı her sayfada tekrar eder; sayısal kolonlar sağa hizalı.
- Toplam/özet bloğu son sayfada: ara toplam, KDV, genel toplam ayrı satırlar.

### Elle doldurulan formlar (hasta kayıt, başvuru, anket)
- **Logo ve başlık yalnızca 1. sayfada** — tekrar eden üstbilgi doldurma alanını daraltır. Çok sayfalı ve ayrılma riski varsa sadece küçük altbilgi (`s. 2/3`), logo değil.
- Belgenin bütünlüğünü son sayfadaki imza bloğu sağlar.
- Doldurma çizgileri arası en az 10mm (el yazısı için); çizgi açık gri (`#d1d5db` civarı), 1px.
- Checkbox en az 12×12px, etiketle arası boşluk yeterli.
- Onay/rıza metinleri küçük punto olabilir ama okunabilirlik sınırının altına inme.
- Bölüm başlıkları arasında tek ayırıcı yeter; üst üste çizgi görsel gürültüdür.

## Kalite kontrol listesi

- [ ] **PDF gerçekten indirilip AÇILDI** — `tsc --noEmit` / `lint` / `build` temizliği yeterli DEĞİL
- [ ] **Canlıya çıkmadan önce Vercel preview deployment'ta test edildi**
- [ ] Metin seçilebilir/aranabilir (sunucu tarafı üretimde Ctrl+F ile bir kelime bulunuyor)
- [ ] Türkçe karakterler tüm alanlarda doğru
- [ ] Emoji karakteri yok; ikonlar inline SVG
- [ ] Hiçbir metin sağ/alt kenardan kesilmiyor; tüm sayfalar aynı genişlikte
- [ ] Satır/tablo ortasından sayfa bölünmesi yok
- [ ] Logo ve görseller çıktıda görünüyor
- [ ] Dosya boyutu makul (form < 500KB, teklif < 2MB)
- [ ] Para/tarih formatları tr-TR
- [ ] (Client-side seçildiyse) iOS ve Android'de indirme test edildi

## Çıktı formatı

- Kod dosya yollarıyla: şablon (server component / HTML string üreteci) + route (`/api/.../pdf`) + varsa indirme yardımcısı ayrı ve net.
- Kurulum: `npm install puppeteer-core@25.1.0 @sparticuz/chromium@149.0.0 --save-exact` (client-side seçildiyse `npm install jspdf html2canvas-pro`).
- Sürüm pinlemesinin NEDEN exact olduğunu koda kısa yorumla yaz — sonraki `npm update` bunu bozmasın.

---
name: brand-ui
description: Marka kimliği ve UI tutarlılık standartları (renk paleti, tipografi, animasyon, yerleşim, arka plan, component görünümü, Türkçe arayüz dili). Kullanıcı arayüz tasarımı, tema/renk sistemi, landing page görünümü, dashboard tasarımı, animasyon, dark mode, component stili veya marka tutarlılığı istediğinde MUTLAKA bu skill'i kullan. "Tasarımı güzelleştir", "renkleri ayarla", "tema kur", "arayüzü düzenle", "landing tasarla", "animasyon ekle", "jenerik durmasın", "dashboard görünümü" gibi ifadeler geçtiğinde de kullan. Tailwind üzerinde semantik, tutarlı, jenerik olmayan profesyonel marka arayüzleri üretir.
---

# Brand UI

Marka kimliği ve UI tutarlılığı standartları (Tailwind CSS üzerinde). Projeye özel değerler (paletin hex kodları, font aileleri, logo dosyaları, ton) CLAUDE.md'dedir — bu skill değerlerin NASIL sisteme bağlanacağını ve tutarlı kullanılacağını taşır. Kod tarafı kuralları için `code-standards` geçerlidir; bu skill görünüme odaklanır.

## Renk sistemi

**Semantik katman zorunlu**: hex kodları doğrudan class'larda kullanılmaz; Tailwind config'te (veya CSS değişkenlerinde) semantik adlarla tanımlanır ve her yerde o adlar kullanılır:

```
primary        # marka ana rengi (CTA, vurgu, aktif durum)
secondary      # ikincil marka rengi (rozet, ikincil vurgu)
success / warning / danger / info   # durum renkleri
```

- Her semantik rengin ton skalası türetilir (50-950); açık tonlar zemin/hover, koyu tonlar metin olarak kullanılır.
- **Kullanım oranı**: arayüzün büyük çoğunluğu nötr (beyaz/gri skalası); marka rengi vurgu içindir. "Her yer mor" markalaşma değil yorgunluktur — primary'yi CTA, aktif menü, önemli rozetlerde tut.
- Durum renkleri marka paletinden BAĞIMSIZ evrenseldir: success yeşil, danger kırmızı ailesinde kalır; kullanıcı alışkanlığıyla oynama.
- Erişilebilirlik: metin/zemin kontrastı normal metinde en az 4.5:1 (büyük başlıkta 3:1). Marka rengi açıksa üzerine beyaz metin koymadan önce kontrast doğrula; gerekirse metin için koyu tonu kullan.

## Tipografi

- En fazla 2 font ailesi: başlık + gövde (tek aile de olur, ağırlıkla ayrışır). `next/font` ile yüklenir, Türkçe karakter desteği İLK kontroldür (ğ/ş/ı/İ örnek metinle bakılır).
- Ölçek disiplini: Tailwind'in hazır ölçeği kullanılır (`text-sm/base/lg/xl/2xl...`); keyfi `text-[17px]` değerleri YASAK. Sayfa başlığı, bölüm başlığı, gövde, yardımcı metin için sabit eşleme belirle ve her sayfada aynı kullan.
- Gövde metni `text-base` altına düşmez (mobil okunabilirlik); yardımcı/etiket metinler `text-sm`, en küçük `text-xs` yalnızca rozet/damga.

## Boşluk, köşe, gölge

- Spacing yalnızca Tailwind ölçeğinden (`p-4`, `gap-6`...); keyfi piksel yok. Kart içi dolgu, kartlar arası boşluk, bölüm arası boşluk için üçlü standart seç (ör. `p-6 / gap-4 / space-y-10`) ve sapma.
- Köşe yarıçapı tek karakterde: proje ya `rounded-lg` ailesi ya `rounded-xl` ailesi kullanır — aynı ekranda karışık yarıçap olmaz. Buton ve input yarıçapı eşleşir.
- Gölge ölçülü: kart `shadow-sm`, açılır menü/modal `shadow-lg`; dekoratif ağır gölgeler kullanılmaz. Zemin ayrımı önce açık gri zemin + beyaz kart deseniyle sağlanır.

## Component görünüm standartları

- **Buton hiyerarşisi**: primary (dolu, marka rengi) / secondary (kenarlıklı) / ghost (çıplak) — sayfada TEK primary aksiyon. Yıkıcı işlemler danger renkli. Tüm butonlarda hover + focus-visible + disabled durumları tanımlı.
- **Form**: her alanda label (placeholder label DEĞİLDİR), hata mesajı alanın hemen altında danger renginde, focus ring marka renginde. Zorunlu alan işareti tutarlı.
- **Tablo/liste**: başlık satırı ayrışık (zemin veya ağırlıkla), satır hover'ı, sayısal kolon sağa hizalı, boş durum tasarımı ("Henüz kayıt yok" + eylem önerisi) zorunlu.
- **Durum görünümleri her ekranda**: loading (skeleton veya spinner), boş, hata. Bunlar tasarlanmadan ekran bitmiş sayılmaz.
- Rozet/etiket renkleri anlam taşır ve projede tek sözlüğe bağlanır (ör. durum → renk eşlemesi tek dosyada).

## Türkçe arayüz dili

- Tüm UI metinleri Türkçe; ton CLAUDE.md'de tanımlı değilse "siz" ile net-kibar profesyonel.
- Buton metinleri fiilli ve sonuç söyler: "Kaydet", "Teklif Oluştur" — "Tamam/Gönder" belirsizliği yerine.
- Tarih/para/sayı formatları `Intl.*('tr-TR')` ile; elle string formatlanmaz.
- Onay diyalogları sonucu açıkça söyler: "Bu kaydı silmek geri alınamaz. Silinsin mi?" + butonlar "Vazgeç / Sil".

## Animasyon

- **İki katman**: basit durum geçişleri (hover, focus, renk/gölge) Tailwind `transition-*` ile; sıralı/orkestre edilmiş hareket (liste elemanlarının kademeli girişi, sayfa geçişi, layout değişimi) Framer Motion ile. Basit iş için Framer Motion yüklenmez.
- **Amaçsız animasyon yok**: her hareket bir şey anlatır — durum değişti, yeni içerik geldi, dikkat buraya. Süs olsun diye dönen/zıplayan öğe eklenmez.
- Süre disiplini: mikro etkileşimler 150-200ms, giriş/çıkış 200-300ms, sahne geçişleri en fazla 400ms. Ease olarak `ease-out` (giriş) / `ease-in` (çıkış) varsayılan.
- Hover'da tek özellik değişmez, ölçülü kombinasyon kullanılır (ör. hafif `translate-y` + gölge derinliği) — sadece renk değişen "cansız hover" yerine; ama `scale-110` gibi abartı da yok.
- `prefers-reduced-motion` her zaman desteklenir: Framer Motion'da `useReducedMotion`, CSS'te `motion-reduce:` varyantı.
- Layout kaymasına (CLS) yol açan animasyon yasak; giriş animasyonları `transform/opacity` üzerinde kalır.

## Anti-jenerik yerleşim

Varsayılan AI çıktısı hep aynıdır: ortalanmış hero + dört eşit kart + üç kolon footer. Bunu kırmak için:

- **Eşit kart grid'i son çare**: içerik gerçekten eşdeğer 3-4 öğeyse kullanılır. Değilse hiyerarşi kur — bir öğe büyük (öne çıkan), diğerleri küçük; veya 2/3 + 1/3 asimetrik bölünme; veya liste + detay deseni.
- **Editoryal ritim**: bölümler aynı şablonun kopyası olmaz. Metin-sol/görsel-sağ → tam genişlik ifade → dar kolon metin gibi değişen ritim; her bölümde farklı bir yerleşim kararı.
- **Beyaz alan cesareti**: her pikseli doldurma. Başlık etrafında nefes, bölümler arası belirgin boşluk (`py-16`+ landing'de) profesyonelliğin kendisidir.
- **Tip ölçeğinde kontrast**: hero başlığı gövdeden çok belirgin büyük olur (`text-5xl`+ masaüstünde); "her şey text-xl" düzlüğü jenerikliğin ana sebebi.
- **Hizalama çeşitliliği**: her şeyi ortalama. Landing'de sola hizalı başlık + asimetrik yerleşim çoğu zaman ortalanmış varyanttan daha karakterli.
- Bu kararlar marka tonuna bağlıdır (CLAUDE.md): kurumsal ürün ölçülü asimetri, içerik/medya markası daha cesur editoryal düzen kaldırır.

## Arka plan ve doku (jenerik gradyan yerine)

- **Mor-pembe gradyan varsayılanı YASAK** — "AI yaptı" imzasıdır. Arka plan kararı marka paletinden türer.
- Tercih sırası: (1) sade nötr zemin + güçlü tipografi, (2) marka renginin çok açık tonu / ton-üstü-ton geometri, (3) kodla üretilen özgün doku.
- Kodla üretilen doku seçenekleri (ağır kütüphane gerektirmez): SVG desen (nokta/çizgi grid, topografik eğriler), CSS ile ince gürültü/grain, tek `<canvas>` ile deterministik üretken desen (seed sabit — her yüklemede aynı görünüm, marka tutarlılığı).
- Kurallar: doku arka planda kalır (düşük kontrast, `opacity-[0.03-0.08]` aralığı), metin okunabilirliğini asla bozmaz, `prefers-reduced-motion`'da animasyonlu varyant durur, canvas dekoratifse `aria-hidden`.

## Slop denetimi ve mevcut sistemi devralma

Mevcut bir arayüzü iyileştirirken iki kural:

**1. Önce devral, sonra düzelt** — mevcut tasarım sisteminin ÜZERİNE YAZMA:
- İşe başlamadan mevcut sistemi çıkar: Tailwind config'teki semantik renkler, kullanılan font ölçeği, köşe yarıçapı ailesi, spacing standardı. Düzeltmeler BU sistemin diliyle yapılır.
- Sistem yoksa (her component'e keyfi değer yazılmışsa) önce sistem borcu kapatılır (semantik katman kurulur), görsel rötuş sonra.
- "Baştan tasarlayayım" refleksi yasak: kullanıcı yeniden tasarım istemedikçe iş, mevcut karakteri koruyarak temizliktir.

**2. Slop denetimi** — "AI yapımı" görünümün somut sinyalleri; iyileştirme talebinde bu liste taranır:
- [ ] Mor-pembe/mavi-mor gradyan hero zemini
- [ ] Dört eşit kart grid'i + her kartta ikon-başlık-metin aynı kalıp
- [ ] Her bölüm ortalanmış, hizalama çeşitliliği yok
- [ ] Tip ölçeği düz (başlık/gövde kontrastı zayıf), her şey benzer boyutta
- [ ] Keyfi değerler: `text-[17px]`, rastgele `mt-[13px]` — ölçek disiplini yok
- [ ] Aynı ekranda karışık köşe yarıçapı / tutarsız gölge kullanımı
- [ ] Boşluk ritmi tutarsız: kimi bölüm sıkışık, kimi anlamsız geniş
- [ ] Cansız hover (yalnızca renk) veya hiç etkileşim durumu yok
- [ ] Emoji'nin ikon yerine kullanılması, stok görünümlü jenerik görseller
- [ ] Loading/boş/hata durumları tasarlanmamış

Çıktı: ihlal listesi (nerede, hangi kural) → mevcut sistem diliyle düzeltme kodu → düzeltme sonrası kontrol listesinin temiz hali. "Güzelleştirdim" değil, madde madde gerekçeli değişiklik.

Claude Code'da Playwright MCP kuruluysa tasarım işi "kod yazdım, bitti" ile kapanmaz:

1. Sayfayı tarayıcıda aç, ekran görüntüsü al (masaüstü + mobil viewport)
2. Görüntüyü bu skill'in kurallarına göre denetle: hiyerarşi net mi, boşluk ritmi tutarlı mı, jenerik desenlere düşülmüş mü, durum görünümleri var mı
3. Sorunları düzelt, tekrar görüntü al — kural ihlali kalmayana kadar döngü
4. Son görüntüleri kullanıcıya sun; onay kullanıcıda

MCP yoksa aynı denetim kullanıcının paylaştığı ekran görüntüsü üzerinden yapılır.

## Dark mode (istenirse)

- Semantik katman doğru kurulduysa dark mode CSS değişkeni/`dark:` varyantı işidir; component'lere tek tek renk yazılmışsa önce o borç temizlenir.
- Dark'ta saf siyah zemin yerine koyu gri (`gray-900/950`), metin saf beyaz yerine `gray-100`; marka renginin dark uyumlu tonu ayrıca seçilir (açık zemindeki ton koyuda cıyak kalabilir).

## Çıktı formatı

- Tema kurulum işi: Tailwind config bloğu + semantik kullanım örnekleri dosya yollarıyla.
- Ekran tasarım işi: önce yerleşim özeti (2-3 cümle), sonra component kodu; loading/boş/hata durumları dahil.
- Mevcut arayüz iyileştirmede: tespit listesi (neyin neden değiştiği) + değişen kod — "güzelleştirdim" değil gerekçeli değişiklik.

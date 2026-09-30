---
name: adres-girisi
description: Türkiye adres girişi (il/ilçe/mahalle kademeli seçim + serbest metin) üretim standartları. Kullanıcı adres alanı, il-ilçe-mahalle dropdown'ı, teslimat/fatura adresi, öğrenci/müşteri adresi, adres formu veya adres veritabanı şeması istediğinde MUTLAKA bu skill'i kullan. "Adres ekle", "il ilçe seçimi", "mahalle dropdown", "adres alanı", "teslimat adresi", "adres kaydet" gibi ifadeler geçtiğinde de kullan. Form deseni code-standards'a, şema sql-migration'a, kişisel veri kuralları kvkk-legal'e tabidir — bu skill adres alanının kendine özgü kademeli seçim, veri kaynağı ve normalizasyon disiplinini taşır.
---

# Adres Girişi

## Temel ilke

Adres iki parçadır ve **asla tek serbest metin kutusu olmaz**:

| Parça | Yapı | Neden |
|---|---|---|
| **İdari kademe** — il / ilçe / mahalle | Kapalı liste, kademeli (cascade) | Filtrelenebilir, gruplanabilir, raporlanabilir |
| **Serbest metin** — sokak / apartman / site / no / daire | textarea | Standardize edilemez, kullanıcıya bırakılır |

Tek `adres text` kolonu = "İstanbul'daki öğrencileri listele" sorusu bir daha asla cevaplanamaz. Bu geri dönülemez bir hatadır.

## Veri kaynağı

`turkey-neighbourhoods` npm paketi (veya eşdeğeri) — build-time statik veri.

- Tek bir `src/lib/turkiye-adres.ts` modülünde sarmalanır; paketin API'si forma sızmaz (bkz. api-integration sınır dönüşümü ilkesi).
- Dışa açılan yüzey sabittir:
  - `ILLER` — tüm iller (alfabetik, Türkçe collation ile)
  - `getIlceler(ilAdi)` — seçilen ile göre ilçeler
  - `getMahalleler(ilAdi, ilceAdi)` — seçilen il+ilçeye göre mahalleler
- Paket değişirse yalnız bu modül değişir.
- Veri **runtime'da API'den çekilmez** — statik, sürümlenmiş, offline çalışır.

## Form deseni

Kademeli seçim `react-hook-form`'a **bağlanmaz**, ayrı `useState` ile tutulur; kaydederken payload'a eklenir.

```ts
const [il, setIl] = useState('')
const [ilce, setIlce] = useState('')
const [mahalle, setMahalle] = useState('')
```

Zorunlu kurallar:

1. **Sıfırlama zinciri** — il değişince ilçe *ve* mahalle sıfırlanır; ilçe değişince mahalle sıfırlanır. Atlanırsa "Ankara / Nilüfer" gibi imkânsız kayıtlar oluşur.
2. **Disabled zinciri** — ilçe dropdown'ı il seçilmeden, mahalle dropdown'ı ilçe seçilmeden `disabled`.
3. **Placeholder** — her dropdown'ın ilk seçeneği `"Seçiniz"`; disabled durumda `"Önce il seçiniz"` gibi nedeni söyleyen metin.
4. **Türkçe arama** — mahalle listeleri uzun (bazı ilçelerde 100+). Aranabilir select kullanılır; arama `toLocaleLowerCase('tr-TR')` ile normalize edilir (İ/ı tuzağı).
5. **Serbest metin** `react-hook-form` ile yönetilir, zod'da `.optional()`, label `"Sokak / Apartman / Site / No"`.

## Şema

```sql
il          text,
ilce        text,
mahalle     text,
adres_detay text
```

- İsim (ad) olarak saklanır, kod olarak değil — paket kodları sürüm arası değişebilir, isimler kullanıcıya gösterilebilir haldedir.
- **Ayrı kolonlar**, tek JSON değil — index ve `GROUP BY` gerekir.
- İl bazlı raporlama yapılacaksa `il` kolonuna index.
- Adres zorunlu değilse üçü de nullable; **kısmi doldurma serbesttir** (il var, mahalle yok normaldir) — DB'de zorunluluk yerine formda uyarı.

Şema değişikliği `sql-migration`'a tabidir.

## Normalizasyon

- Kayıttan önce `trim()`, çoklu boşluk teke indirilir.
- İl/ilçe/mahalle isimleri **paketten geldiği şekliyle** yazılır, elle büyük/küçük harf dönüşümü yapılmaz (`İ`/`I` bozulur).
- Serbest metin olduğu gibi saklanır, yalnızca trim edilir.

## Çoklu adres

Bir kayda birden fazla adres gerekiyorsa (fatura / teslimat / ev / iş) ayrı `adresler` tablosu + `tip` kolonu + `varsayilan boolean`; ana tabloya `adres2`, `adres3` kolonu eklenmez.

## Gizlilik

Adres kişisel veridir:
- Aydınlatma metninde işlenen veri kategorileri arasında **açıkça** sayılır.
- Log ve hata mesajlarına adres yazılmaz (bkz. security-baseline log hijyeni).
- Silme talebinde adres kayıtları da silinir; sipariş/fatura gibi yasal saklama yükümlülüğü olan kayıtlarda saklama süresi ayrıca belirlenir.

Metin üretimi ve saklama süreleri `kvkk-legal`'e tabidir.

## Sık hatalar

- İl değişince alt seçimleri sıfırlamamak → tutarsız kayıt
- Mahalleyi tek `select` içinde tüm ülke için render etmek → sayfa donar
- Adresi tek `text` kolonunda saklamak → raporlama imkânsız
- `toLowerCase()` kullanmak (`toLocaleLowerCase('tr-TR')` yerine) → "İstanbul" araması sonuç vermez
- Paketi doğrudan component içinde import etmek → değiştirilemez bağımlılık

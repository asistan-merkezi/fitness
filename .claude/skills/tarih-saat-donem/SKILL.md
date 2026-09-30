---
name: tarih-saat-donem
description: Türkiye projelerinde saat dilimi (hep Europe/Istanbul) ve gün/ay/yıl dönem süzme standartları — tarih-saat kaydetme/gösterme, "bugün/bu ay/bu yıl" hesabı, gün-ay-yıl görünümü ve önceki/sonraki gezinme, rapor dönem aralığı, date ve timestamptz kolon sorguları, DB'deki current_date, cron/zamanlanmış iş saatleri. Kullanıcı tarih filtresi, dönem seçici, gün/ay/yıl süzme, rapor aralığı, randevu/puantaj saati, cron zamanı, "bugünün kayıtları", "bu ayın raporu" veya saat kayması hatası istediğinde MUTLAKA bu skill'i kullan. "Ay filtresi", "yıl seç", "günlük görünüm", "saat yanlış", "cron ne zaman çalışır", "dün gece kaydettim yanlış güne düştü" gibi ifadeler geçtiğinde de kullan. Şema sql-migration'a, rapor sorguları sql-queries'e, zamanlanmış iş iskeleti data-pipeline'a tabidir — bu skill saat dilimi ve dönem sınırı disiplinini taşır.
---

# Tarih, Saat ve Dönem Süzme

Tek kural: **her saat hesabı İstanbul'a göre yapılır, hiçbir yerde sunucunun/DB'nin/tarayıcının ambient saat dilimine güvenilmez.** Vercel sunucusu ve Supabase DB UTC'dedir; İstanbul UTC+3 olduğu için 00:00-03:00 arası girilen her kayıt yanlış güne, 31 Aralık gecesi yanlış yıla düşebilir. Türkiye 2016'dan beri DST uygulamıyor, ama offset (`+03:00`) koda gömülmez — her zaman `Europe/Istanbul` adı ve `date-fns-tz` kullanılır.

## 1. Tek modül, tek sabit

- Saat dilimi tek sabitte tutulur (`CLINIC_TZ = "Europe/Istanbul"`, klinik referansı `lib/datetime.ts`); `"Europe/Istanbul"` metni başka dosyaya yazılmaz, sabit import edilir.
- Tüm dönüşümler bu modüldeki fonksiyonlardan geçer: `toUTC`, `formatTime`, `formatDate`, `formatDateTime`, `formatDateForInput`, `bugunIstanbulTarihi`, `startOfDayUTC`, `endOfDayUTC`. Yeni ihtiyaç modüle eklenir, sayfada yeniden yazılmaz.
- İki kolon tipi karıştırılmaz: **an** (`timestamptz`, UTC saklanır, İstanbul'da gösterilir) ve **takvim günü** (`date`, saatsiz; vade, doğum, satış tarihi). Randevu saati an'dır; vade tarihi takvim günüdür.

## 2. Yasaklı kalıplar

| Yasak | Neden | Yerine |
|---|---|---|
| `new Date().toISOString().slice(0,10)` | UTC günü verir; 00:00-03:00 arası dünü gösterir (özellikle `<input type="date">` defaultValue) | `bugunIstanbulTarihi()` |
| `new Date().getFullYear()/getMonth()/getDate()/getHours()` | Sunucuda UTC; yıl/ay/gün sınırında 3 saat yanlış | İstanbul'dan türet (`formatInTimeZone(now, TZ, "yyyy")`) — `simdikiYilIstanbul()` gibi yardımcı |
| Çıplak `new Date("2026-07-28T14:30")` | Ortamın saat dilimine bağlı yorumlanır | `toUTC("2026-07-28T14:30")` |
| `date.setHours(0,0,0,0)` ile gün başı | Sunucu TZ'sinde gün başı | `startOfDayUTC(date)` |
| `lte bitis 23:59:59` | Son saniyeyi ve milisaniyeleri kaçırır | Üst sınır exclusive: `lt` + ertesi günün 00:00'ı |
| `new Date(ms + 3*3600*1000)` ile elle kaydırma | Kırılgan, okunmaz | `formatInTimeZone` / `fromZonedTime` |

Denetim: `grep -rnE "new Date\(\)\.(toISOString|getFullYear|getMonth|getDate|getHours)" app lib components`. Eşleşen her satır hata adayıdır.

## 3. Dönem süzme (gün / ay / yıl)

**Tek aralık tipi, yarı açık `[başlangıç, bitiş)`.** Bütün raporlar, listeler ve grafikler aynı tipi kullanır:

```ts
type Donem = {
  baslangic: string;      // UTC ISO — timestamptz kolonları için   (gte)
  bitis: string;          // UTC ISO, exclusive                      (lt)
  baslangicTarih: string; // "yyyy-MM-dd" — date kolonları için      (gte)
  bitisTarih: string;     // "yyyy-MM-dd", exclusive                 (lt)
  etiket: string;         // "Eylül 2026" — tr-TR, timeZone: TZ
};
// raporGunDonemi("2026-09-30"), raporAyDonemi(2026, 9), raporYilDonemi(2026)
```

- **timestamptz** kolonunu `baslangic/bitis` ile, **date** kolonunu `baslangicTarih/bitisTarih` ile süz. Yanlış çifti kullanmak sessiz kayma üretir.
- Ay/gün aritmetiği UTC öğle vakti "güvenli an" üzerinden yapılır (`Date.UTC(yil, ay, gun, 12)`): İstanbul'un gün sınırı bu anı asla iki güne bölmez. Ay parametresinde **1-12 mi 0-11 mi** imzada ve yorumda açık yazılır (`raporAyDonemi` 1-12, `ayBaslangiciUTC` 0-indeksli).
- **URL, tek doğruluk kaynağıdır**: gün `?tarih=YYYY-MM-DD`, ay `?ay=YYYY-MM`, yıl `?yil=YYYY`. Dönem server component'te bu param'dan hesaplanır; paylaşılabilir ve geri tuşuyla çalışır.
- Bozuk/eksik param hata değil **varsayılan** üretir: bugün / bu ay / bu yıl (İstanbul'a göre). Regex ile doğrula (`/^\d{4}-\d{2}$/`), `Number` dönüşümünden sonra 1-12 ve makul yıl aralığını da kontrol et.
- Önceki/sonraki gezinme hazır param üretir (`oncekiParam`, `sonrakiParam`); yıl/ay taşması (Ocak-1 = Aralık) takvim aritmetiğiyle çözülür, `ay - 1` ile elle değil.
- Seçici arayüzü: Gün · Ay · Yıl görünüm sekmesi + önceki/sonraki + "Bugün" düğmesi. Etiket `toLocaleDateString("tr-TR", { month: "long", year: "numeric", timeZone: TZ })`; gün etiketinde de `timeZone` verilir.
- Gün kırılımıyla gruplama (yıllık grafik, günlük döküm): JS'te `formatDateForInput(utcIso)` ile İstanbul gününe çevirip grupla; DB'de `(kolon AT TIME ZONE 'Europe/Istanbul')::date` ile grupla. `date_trunc('day', kolon)` çıplak kullanılmaz (UTC günü verir).
- Yıllık 12 ay kırılımı `yilinAylari(yil)` gibi tek yardımcıdan gelir; her sayfa kendi döngüsünü yazmaz.

## 4. Veritabanı tarafı

- Supabase DB UTC'dedir. `current_date`, `now()::date`, `CURRENT_DATE` **UTC gününü** verir — kolon `DEFAULT current_date`, `gecerlilik_bitis_tarihi >= current_date` gibi kullanımlar İstanbul 00:00-03:00 arasında dünü görür.
- Doğrusu: `(now() AT TIME ZONE 'Europe/Istanbul')::date`. Tekrarlandığı için tek fonksiyona alınır:

```sql
CREATE OR REPLACE FUNCTION bugun_istanbul() RETURNS date
LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT (now() AT TIME ZONE 'Europe/Istanbul')::date $$;
-- kolon: tarih date NOT NULL DEFAULT public.bugun_istanbul()
```

- DB'nin genel `timezone` ayarını değiştirmek çözüm sayılmaz (tüm `timestamptz` gösterimlerini ve mevcut varsayımları kaydırır). Dönüşüm açık yazılır.
- `timestamp without time zone` kolon kullanılmaz; an her zaman `timestamptz`.

## 5. Zamanlanmış işler (cron)

- Vercel Cron, GitHub Actions `schedule`, `pg_cron` **UTC**'de çalışır. İstanbul saatinden 3 çıkar: 06:00 İstanbul = `0 3 * * *`. **Gece yarısına yakın işlerde gün değişir:** `0 22 * * *` UTC = ertesi gün 01:00 İstanbul.
- `vercel.json` yorum kabul etmez; her cron'un İstanbul karşılığı iş dosyasının başındaki yorumda ve CLAUDE.md'deki cron tablosunda yazılır (yol | cron ifadesi | İstanbul saati | ne yapar).
- İşin içinde "hangi gün/ay/dönem" sorusu **İstanbul'a göre** hesaplanır (`ayAraligi()` gibi); `new Date().getMonth()` kullanılmaz. Ayın 1'inde çalışan "önceki dönemi kapat" işi UTC'ye göre hesaplarsa ay başı gecesi yanlış dönemi kapatır.
- Cron işi idempotent yazılır (data-pipeline kuralı); gecikmeli veya çift tetiklenmeye dayanır. Hobby planda Vercel cron saat hassasiyeti yoktur (belirtilen saat içinde herhangi bir an) ve günde bir sınırı vardır; hassas saat gerekiyorsa planı/zamanlayıcıyı güncel dokümandan doğrula.
- Kullanıcıya gönderilen zamanlı bildirim (randevu hatırlatma) saatini İstanbul'a göre hesaplayıp UTC'ye çevirerek kuyruğa yazar; "yarın 09:00" `toUTC("yyyy-MM-ddT09:00")` ile üretilir.

## 6. Saat girişi ve gösterimi

- Form: `<input type="datetime-local">` / `date` / `time` değeri **İstanbul yerel zamanı** kabul edilir, kaydetmeden önce `toUTC` ile çevrilir; form'a geri doldururken `formatDateForInput` / `formatTimeForInput`.
- Gösterim: her zaman İstanbul formatı (`dd.MM.yyyy`, `HH:mm`); `toLocaleString()` parametresiz kullanılmaz (tarayıcı/sunucu TZ'sine bağlıdır). Hastanın/personelin cihazı yabancı saat dilimindeyse bile klinik saati gösterilir.
- Kayıt anı verilmemiş bir `date` alanına saat eklemek gerekiyorsa (ödeme kaydı): gün formdan, saat **şimdinin İstanbul saatinden** alınır (`tarihiSimdikiSaatleUTC`).
- Canlı saat/zaman çizelgesi bileşenleri (client) `formatClock` kullanır; `Date.now()` ms farkları serbesttir, takvim alanları (`getHours()`) değildir.

## 7. Zorunlu testler

Saat fonksiyonu yazan her iş şu sınır testlerini ekler (`vi.setSystemTime` ile sabit saat):

- `2026-09-30T21:30:00Z` (= 01 Ekim 00:30 İstanbul): "bugün", "bu ay", "günlük aralık" Ekim'e ait.
- `2026-12-31T21:30:00Z` (= 01 Ocak 2027 00:30 İstanbul): "bu yıl" 2027.
- `[baslangic, bitis)` bitişinde tam gece yarısı kaydı bir sonraki döneme düşer (çift sayım/kayıp yok).
- Şubat (28/29 gün) ve yıl geçişi gezinmesi (Ocak ← Aralık).
- `CLINIC_TZ === "Europe/Istanbul"` (sabit yanlışlıkla değişmesin).

## Çıktı formatı

Kod dosya yollarıyla: dönem yardımcısı + sayfa (param okuma, fallback) + seçici bileşen. DB değişikliği varsa sql-migration formatında tek blok. Sonda kısa "saat dilimi kontrol listesi": yasaklı kalıp grep'i temiz mi, `current_date` kaldı mı, cron'ların İstanbul karşılığı yazıldı mı, sınır testleri var mı.

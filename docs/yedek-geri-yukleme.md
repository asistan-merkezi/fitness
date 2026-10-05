# Yedek ve Geri Yükleme Provası

Yedeğin var olması yetmez; **geri yüklenebildiği denenmemiş yedek, yedek sayılmaz.** Bu prova canlıya çıkmadan önce bir kez, sonra **üç ayda bir** yapılır ve sonucu en alttaki tabloya yazılır.

> Supabase panelindeki menü adları ve plan koşulları zamanla değişebilir; adımları uygularken güncel Supabase dokümanını ("Backups", "Point-in-Time Recovery") kontrol edin.

## 1. Yedekleme ayarları (bir kez)
1. **Project Settings → Add-ons → Point in Time Recovery (PITR)**: açın. PITR, son N gün içinde **dakika hassasiyetinde** herhangi bir ana dönmeyi sağlar ("dün 14:05'te yanlışlıkla silinen kayıt"). Ücretli eklentidir; ücretli plan gerektirir.
2. PITR açılmazsa en az ücretli plandaki **günlük yedekler** devrede olmalıdır (**Database → Backups**'ta son yedeklerin listelendiğini görün). Ücretsiz planda otomatik yedek **yoktur**: canlı veri ücretsiz planda tutulmamalıdır.
3. **Neler yedeğe GİRER**: tüm Postgres veritabanı — uygulama tabloları, `auth` şeması (kullanıcı hesapları), audit log bölümleri.
   **Neler GİRMEZ**: Storage dosyaları (ör. `isletme-logo` kovasındaki logolar). Logolar yeniden yüklenebilir; ileride sözleşme/belge dosyası saklanırsa ayrı bir dosya yedeği planlanmalıdır.

## 2. Prova (üç ayda bir, ~30 dk)
Canlı projeye **dokunmadan** yapılır.

1. **Database → Backups**'tan bir geri yükleme noktası seçin ve **yeni bir projeye geri yükleyin** ("Restore to a new project"). Bu seçenek yoksa test projesine geri yükleyin. **Canlı projenin üzerine geri yükleme provada YAPILMAZ.**
2. Geri yüklenen projede **SQL Editor**'de aşağıdaki doğrulama sorgularını çalıştırın. Aynı sorguları canlıda da çalıştırın; fark yalnız yedek anından sonraki kayıtlar kadar olmalıdır.

```sql
-- a) Ana tablolardaki kayıt sayıları
SELECT 'isletme' AS tablo, count(*) FROM public.isletme
UNION ALL SELECT 'kullanici', count(*) FROM public.kullanici
UNION ALL SELECT 'auth.users', count(*) FROM auth.users
UNION ALL SELECT 'musteri', count(*) FROM public.musteri
UNION ALL SELECT 'uyelik', count(*) FROM public.uyelik
UNION ALL SELECT 'musteri_bakiye_hareket', count(*) FROM public.musteri_bakiye_hareket
UNION ALL SELECT 'ders_seansi', count(*) FROM public.ders_seansi
UNION ALL SELECT 'gider', count(*) FROM public.gider
UNION ALL SELECT 'personel_hesap_hareket', count(*) FROM public.personel_hesap_hareket;

-- b) Para: işletme başına cari bakiye toplamı ve son hareket zamanı (canlıyla aynı ana kadar birebir tutmalı)
SELECT isletme_id, sum(bakiye_kurus) AS toplam_bakiye_kurus FROM public.musteri_bakiye GROUP BY isletme_id ORDER BY isletme_id;
SELECT max(islem_zamani) AS son_cari_hareket FROM public.musteri_bakiye_hareket;

-- c) Değişmez defter tetikleyicileri ve RLS geri yüklemeden sonra da yerinde mi?
SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_hareket_degismez', 'trg_kasa_dengeleme_degismez') ORDER BY 1;
SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity ORDER BY 1;  -- BOŞ dönmeli
```

3. Geri yüklenen projeye uygulamayı bağlayıp deneyin: yerelde `.env.local`'e **geri yüklenen projenin** URL ve anahtarlarını yazın → `npm run dev` → bir yönetici hesabıyla giriş yapın, bir müşteri kartını, Kasa ekranını ve Raporlar'ı açın.
4. Geri yüklenen projeyi silin (ücret işlemesin) ve `.env.local`'i eski haline getirin.

## 3. Gerçek felaket anında
1. **Önce durun**: yeni kayıt girilmesini durdurun (işletmelere haber verin). Geri yükleme, seçilen andan sonraki kayıtları siler.
2. Hangi ana dönüleceğini belirleyin (hatadan hemen önceki dakika — PITR varsa).
3. Mümkünse önce **yeni projeye** geri yükleyip doğrulayın (bölüm 2), sonra karar verin: ya canlıyı o ana döndürün ya da kayıp kayıtları yeni projeden elle taşıyın.
4. Geri yükleme sonrası `/api/saglik` 200 dönmeli; cron'ların ertesi gün çalıştığını kontrol edin.
5. Kişisel veri etkilendiyse (sızıntı/kayıp) KVKK bildirim yükümlülüğü için avukata danışın (72 saat sınırı).

## Prova kaydı

| Tarih | Yapan | Geri yükleme noktası | Sayılar canlıyla tutarlı mı | Uygulama açıldı mı | Not |
|---|---|---|---|---|---|
| | | | | | |

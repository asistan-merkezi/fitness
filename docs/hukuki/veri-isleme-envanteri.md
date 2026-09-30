# Veri işleme envanteri

> ⚠️ **TASLAK — avukat incelemesi olmadan yayınlanmaz.** Kaynak: `supabase/migrations/` şeması (20260930…). "TANIMSIZ" = kodda henüz karar yok.

| Veri | Kaynak (tablo.kolon) | Amaç | Hukuki sebep (öneri — avukat teyit eder) | Kimler görür | Saklama |
|---|---|---|---|---|---|
| Ad soyad, telefon, e-posta, doğum tarihi, cinsiyet | `musteri.*` | Üyelik sözleşmesi, iletişim, yaş kontrolü (18 yaş altı) | Sözleşmenin ifası | işletme yöneticisi, resepsiyon | TANIMSIZ — karar gerekli |
| T.C. kimlik no, adres (il/ilçe/mahalle/detay) | `musteri_hassas.*` | Fatura/e-belge, yasal yükümlülük | Yasal yükümlülük / sözleşme | işletme yöneticisi, resepsiyon | TANIMSIZ (vergi saklama süreleri) |
| Acil durum kişisi (ad, telefon) | `musteri_hassas.acil_durum_*` | Acil durumda ulaşma | Meşru menfaat / açık rıza (avukat karar verir) | yönetici, resepsiyon | TANIMSIZ |
| **Sağlık beyanı, sakatlık bayrakları, sağlık notu** (ÖZEL NİTELİKLİ) | `musteri_hassas.saglik_*`, `musteri.risk_bayraklari` | Antrenman güvenliği, spora uygunluk | **Açık rıza** (uygulamada rıza olmadan kaydedilemez) | yönetici, resepsiyon | TANIMSIZ |
| Veli/vasi bilgisi ve onayı (18 yaş altı) | `musteri_veli.*`, `musteri_onam(veli_onayi)` | Reşit olmayan üyelik | Veli rızası / sözleşme | yönetici, resepsiyon | TANIMSIZ |
| Üyelik ve satış kayıtları | `uyelik`, `uyelik_dondurma`, `uyelik_paketi` | Hizmet sunumu | Sözleşmenin ifası | yönetici, resepsiyon, muhasebe (salt okuma) | Yasal saklama süresi |
| Cari hareketler (borç/ödeme/iade, yöntem, tutar) | `musteri_bakiye_hareket` | Tahsilat, muhasebe | Yasal yükümlülük / sözleşme | yönetici, resepsiyon, muhasebe | Yasal saklama (defter değişmezdir) |
| Giriş kayıtları (zaman, sonuç, red nedeni) | `giris_kaydi` | Hak düşümü, güvenlik, denetim | Sözleşmenin ifası / meşru menfaat | yönetici, resepsiyon | TANIMSIZ |
| Onam kayıtları (kim, ne zaman, hangi metin sürümü) | `musteri_onam` | İspat | Yasal yükümlülük (ispat) | yönetici, resepsiyon | Onam süresince + zamanaşımı |
| Denetim izi (yalnız değişen ALAN ADLARI; değer yok) | `audit_log` | Güvenlik, hesap verebilirlik | Meşru menfaat | yalnız işletme yöneticisi | Aylık bölümlerle; süre TANIMSIZ |
| Personel hesabı (ad, rol, e-posta) | `kullanici`, Supabase Auth | Erişim yönetimi | Sözleşme / meşru menfaat | yönetici | İş ilişkisi + yasal süre |

## Alt işleyiciler / yurt dışı aktarım (doldurulacak)
- **Supabase** (veritabanı, kimlik doğrulama; bölge: Frankfurt öneri) — yurt dışı aktarım mekanizması (KVKK m.9, 2024 değişikliği) avukatla netleştirilir.
- **Vercel** (barındırma, işlem günlükleri) — aynı.
- Sonradan eklenecekler: e-posta/SMS sağlayıcı, ödeme kuruluşu, muhasebe/e-belge (Paraşüt).

## Uygulama–metin uyumsuzluk kontrolü
- Sağlık verisi açık rıza olmadan DB seviyesinde reddedilir (`musteri_olustur`, `musteri_hassas`).
- 18 yaş altı için veli bilgisi + veli onayı zorunludur (İstanbul takvim gününe göre).
- Müşteri **silme/anonimleştirme** ve **veri taşıma** akışları henüz YOKTUR (ilgili kişi hakları, KVKK m.11) — metinde söz verilmeden önce geliştirilmelidir.
- Saklama süresi dolunca otomatik silme/anonimleştirme işi YOKTUR.

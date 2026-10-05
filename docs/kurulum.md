# Kurulum (Supabase + Vercel)

Bu adımlar **sizin** Supabase projenizde yapılır; anahtarlar asla repoya yazılmaz (repo public).

## 1. Supabase projesi
1. supabase.com → yeni proje (bölge: Frankfurt `eu-central-1`). Test ve canlı için **ayrı iki proje** önerilir.
2. **Authentication → Providers → Email**: "Allow new users to sign up" **kapalı** (hesapları yalnız yönetici açar), e-posta+şifre açık.
3. **Project Settings → API**: URL, `anon` anahtarı ve `service_role` anahtarı (gizli) değerlerini not edin.
4. JWT imza anahtarı: mümkünse asimetrik (JWT Signing Keys) — `getClaims()` yerelde doğrulama yapar; yoksa Auth sunucusuna gider (yavaş ama doğru).

## 2. Migration'lar (sırayla, test projesinde önce)
`supabase/migrations/` altındaki dosyalar zaman sırasıyla uygulanır:

| Dosya | İçerik |
|---|---|
| `20260930100000_cekirdek_sema.sql` | işletme, kullanıcı, rol yardımcıları, audit log |
| `20260930110000_musteri.sql` | müşteri, hassas veri, veli, onam, arama |
| `20260930120000_cari.sql` | değişmez cari defter, bakiye, kasa özeti |
| `20260930130000_uyelik.sql` | paket, üyelik, dondurma, satış/iptal fonksiyonları |
| `20260930140000_check_in.sql` | giriş kaydı, check-in, iptal |
| `20260930160000_ders_seansi.sql` | alan/stüdyo, ders seansı (çakışma kontrolü), ders hakkı/borç, paket kapsamı |
| `20260930170000_personel_hakedis.sql` | personel maaş/prim profili, aylık hakediş, dönem kapatma, personel hesap defteri |
| `20260930180000_personel_izin.sql` | izin talep-onay akışı, yıllık izin bakiyesi, resmi tatiller, izinli antrenöre ders atanamaması |
| `20260930190000_sirket_bilgileri.sql` | şirket bilgileri (adres, vergi, yetkili, çalışma saatleri, logo), banka hesapları, IBAN doğrulama, logo depolama kovası |
| `20260930200000_mesajlasma.sql` | SMS/WhatsApp/Mail kuralları, kuyruk, merkez kredi aynası, zamanlanmış tarama yardımcıları |
| `20260930210000_qr_kodlari.sql` | QR kısa kodu, QR aç/kapa, hız sınırı, müşteri ön kayıt kuyruğu, anket yanıtları |
| `20260930220000_finans.sql` | Kasa/banka hesap ayrımı, gider, manuel kasa-banka hareketi, hesap hareket görünümü, kategori iskontosu, fatura kuyruğu, finans özeti |
| `20261001100000_musteri_talep_oneri.sql` | müşteri ders talebi ve ders/antrenör yorumu (puanlı) |
| `20261001110000_ders_seansi_realtime.sql` | günün çizelgesi canlı güncelleme (Realtime yayını) |
| `20261001120000_pozisyonlar.sql` | departman bazlı pozisyon kataloğu, personel-pozisyon bağı |
| `20261001130000_arac_ve_kamusal_donem.sql` | işletme araçları, gider-araç bağı, kamu ödemesi dönemi (`gider_ekle` yeni imza) |
| `20261001140000_kasa_banka_kart_ayrimi.sql` | kasa / banka / kredi kartı ayrımı, `hesap_ozet` |
| `20261002100000_musteri_risk_bayragi.sql` | müşteri risk bayrakları (risk bandı) |
| `20261002110000_fatura_bilgi_kontrolu_ve_cari_ozet.sql` | fatura öncesi alıcı bilgisi kontrolü, cari alacak özeti |
| `20261002120000_personel_kisisel_basvuru_puantaj.sql` | personel kişisel bilgi + belgeler, iş başvuruları, puantaj |
| `20261002130000_muhasebe_sync_entegrasyonu.sql` | Paraşüt API kimlik bilgileri (işletme başına) |
| `20261003100000_personel_hesap_odeme_kategorileri.sql` | personel ödeme kategorileri (maaş, avans, prim, yol, yemek, fazla mesai, kesinti) |
| `20261003110000_personel_hizli_puantaj.sql` | listeden tek tıkla giriş/çıkış (yönetici) |
| `20261003120000_personel_kendi_puantaj.sql` | personelin kendi giriş/çıkışı |
| `20261003130000_personel_ucret_gecmisi_ve_kisisel_alanlar.sql` | ücret geçmişi, ek kişisel alanlar |
| `20261004100000_kasa_kontrol_ve_hareket_detay.sql` | kasa başlangıç/dengeleme, hareket detay görünümü |
| `20261005100000_uzun_vade_dayaniklilik.sql` | audit bölümü kurtarma + saklama süresi, mesaj kuyruğu kurtarma, `kullanici` kolon yetkisi, müşteri arama indeksi (`pg_trgm`), cron çalışma kaydı |

Supabase CLI ile: `supabase link --project-ref <ref>` → `supabase db push`. SQL Editor ile: her dosyayı sırayla yapıştırın.
Hepsi idempotent yazılmıştır; yine de **önce test projesinde** deneyin.

> Bu migration'lar PGlite (gerçek Postgres, WASM) üzerinde `npm test` ile test edilir (RLS, rol matrisi, KVKK kuralları, cari, üyelik, check-in). Gerçek Supabase'de çalıştırıldığında çıkan farkları (uzantı şeması, varsayılan yetkiler vb.) bildirin.

## 3. Ortam değişkenleri
`cp .env.example .env.local` ve doldurun (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`; isteğe bağlı `MESAJ_MERKEZ_*`, `AUDIT_LOG_SAKLAMA_AY`). `.env.local` commit edilmez.

## 4. İlk işletme ve yönetici
```bash
node --env-file=.env.local scripts/ilk-isletme.mjs --isletme "Salon Adı" --ad-soyad "Ad Soyad" --eposta ornek@eposta.com
```
Şifre verilmezse rastgele üretilip bir kez ekrana yazılır. Platform yöneticisi için `--super` (işletmesiz).
Sonra `npm run dev` → `/giris`. Yönetici, **Personel** ekranından diğer hesapları açar.

## 5. Vercel
- Projeyi bağlayın (bölge: Frankfurt `fra1`), ortam değişkenlerini Production/Preview için ayrı ayrı girin.
- `vercel.json` cron'u: `/api/cron/audit-log-bolum-olustur` her gün 02:00 UTC (= 05:00 İstanbul; idempotent, var olan bölümleri atlar); `CRON_SECRET` tanımlı olmalı. Hobby planda cron günde bir kez çalışabilir ve saat hassasiyeti yoktur (belirtilen saat içinde bir an); günlük zamanlama bu sınıra uygundur (güncel dokümana bakın).
- `/api/cron/mesaj-gunluk` her gün 05:00 UTC (= 08:00 İstanbul): zamanlanmış mesajları (üyelik bitiyor, doğum günü, özledik, randevu hatırlatma) kuyruğa yazar ve bekleyen mesajları gönderir. Mesaj altyapısı için `MESAJ_MERKEZ_BASE_URL` ve `MESAJ_MERKEZ_API_KEY` tanımlanır; tanımlı değilse mesajlar kuyrukta bekler (kaybolmaz).

## 6. Yayın öncesi kontrol
- Test projesinde: üyelik sat → check-in → ödeme → iade → dondurma akışı elle denendi mi?
- `docs/hukuki/` taslakları **avukat onayından** geçti mi? (sağlık verisi ve 18 yaş altı dahil)
- `npm test && npm run lint && npx tsc --noEmit && npm run build` temiz mi?

## 7. İzleme
- `/api/saglik`: veritabanı erişimi + her cron işinin son 26 saatte başarıyla bitip bitmediği. Sağlıklıysa **200**, değilse **503**; herkese açık yanıt yalnız `{"ok": true|false}`.
- Ayrıntı için: `curl -H "Authorization: Bearer $CRON_SECRET" https://<alan-adı>/api/saglik` (hangi cron, kaç saat önce, son hata kodu).
- Dış izleme (ör. UptimeRobot, ücretsiz plan): HTTP(s) monitor → `https://<alan-adı>/api/saglik`, 5 dk aralık, 503'te e-posta/SMS uyarısı. İlk kurulumda cron'lar ilk kez çalışana kadar (en geç ertesi sabah) "hiç çalışmadı" uyarısı normaldir.
- En sık arıza: `CRON_SECRET` Vercel'de tanımlı değil → cron her gün 401 alır, sağlık ucu bunu "hiç çalışmadı" olarak gösterir.

## 8. Yedek ve geri yükleme
Ayrıntılı prova adımları: [`docs/yedek-geri-yukleme.md`](yedek-geri-yukleme.md). Canlıya çıkmadan önce bir kez, sonra üç ayda bir yapılır.

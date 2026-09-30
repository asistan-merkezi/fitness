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

Supabase CLI ile: `supabase link --project-ref <ref>` → `supabase db push`. SQL Editor ile: her dosyayı sırayla yapıştırın.
Hepsi idempotent yazılmıştır; yine de **önce test projesinde** deneyin.

> Bu migration'lar PGlite (gerçek Postgres, WASM) üzerinde `npm test` ile test edilir (RLS, rol matrisi, KVKK kuralları, cari, üyelik, check-in). Gerçek Supabase'de çalıştırıldığında çıkan farkları (uzantı şeması, varsayılan yetkiler vb.) bildirin.

## 3. Ortam değişkenleri
`cp .env.example .env.local` ve doldurun (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`). `.env.local` commit edilmez.

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

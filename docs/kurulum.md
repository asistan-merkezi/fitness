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
- `vercel.json` cron'u: `/api/cron/audit-log-bolum-olustur` ayın 1'i 02:00 UTC (= 05:00 İstanbul); `CRON_SECRET` tanımlı olmalı. Hobby planda cron saat hassasiyeti ve günlük sınır vardır (güncel dokümana bakın).

## 6. Yayın öncesi kontrol
- Test projesinde: üyelik sat → check-in → ödeme → iade → dondurma akışı elle denendi mi?
- `docs/hukuki/` taslakları **avukat onayından** geçti mi? (sağlık verisi ve 18 yaş altı dahil)
- `npm test && npm run lint && npx tsc --noEmit && npm run build` temiz mi?

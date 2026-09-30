# Klinik kodundan Fitness'a temiz çıkarım planı

Kaynak: `asistan-merkezi/klinik`, commit'lenmiş `main` (`0a273c8`; 640 dosya, 148 migration / 744 KB SQL). Klinik reposuna ve oradaki commit'lenmemiş çalışmalara **dokunulmaz**; yalnızca `git archive` ile commit'lenmiş hâl okunur.

## Strateji

1. **Kod**: commit'lenmiş klinik kodu alınır, modül modül dönüştürülür. Her aşama ayrı dal/PR; her aşamada `tsc`, `eslint`, `vitest` temiz olmadan ilerlenmez.
2. **Veritabanı**: 148 migration'lık klinik geçmişi **kopyalanmaz** (tarihçe, yeniden adlandırmalar ve klinik artıkları taşır). MVP-1 modülleri için **temiz bir taban şema** yazılır (`migrator` ajanı + `sql-migration`/`saas-patterns`); klinik migration'ları yalnızca referanstır.
3. **Adlandırma**: dönüşüm sözlüğü `CLAUDE.md > Veri Modeli`. Otomatik arama-değiştirme yalnızca başlangıçtır, sonuç gözle ve `grep` ile doğrulanır (kapsam içinde `hasta|klinik|terapist|tedavi|anamnez` kalmamalı).
4. **Yeni (klinikte olmayan) parçalar** klinikten türetilmez, sıfırdan tasarlanır: zaman bazlı üyelik, dondurma, otomatik yenileme, grup dersi kapasitesi/bekleme listesi, giriş kontrolü.

## Modül envanteri

| Klinik modülü | Karar | Fitness karşılığı / not |
|---|---|---|
| `lib/supabase` (admin/client/middleware/server), `lib/auth`, `lib/datetime`, `lib/utils`, `lib/tc-kimlik`, `lib/turkiye-adres`, `components/ui`, `lib/ui`, giriş ekranı, layout | **Tut** | `middleware` Next 16'da `proxy.ts` olmalı; `klinik_id` → `isletme_id` |
| `lib/denetim` + `yonetim/denetim-gecmisi` (audit log v2) | **Tut** | Partition cron'u ile birlikte |
| `ayarlar/*` (yetkilendirme, sirket-bilgileri, personel-tanimlama, muhasebe-sync) | **Tut / dönüştür** | `sirket-bilgileri`→işletme bilgileri |
| `hastalar` + `[id]` (kişisel, cari, belgeler, detaylı bilgiler) | **Dönüştür (MVP-1)** | `musteriler`; hassas veri ayrı tablo + RLS |
| `hastalar/[id]` protokol, tedavi, şikâyet-anamnez, seans geçmişi | **Sonra / yeniden** | antrenman programı, sağlık beyanı, ders notu |
| `paketler` + `lib/paket` | **Dönüştür + genişlet (MVP-1)** | `uyelik_paketi`; **dondurma/yenileme yeni** |
| `finans/*` (kasa, banka, kredi-karti, gelirler-takibi, giderler, raporlar, kategori-iskonto) + `lib/fatura`, `lib/finans` | **Tut (MVP-1)** | Cari tek defter kuralı aynen |
| `randevular` | **Sadece check-in (MVP-1)**; takvim **sonra** | `ders_seansi`, grup kapasitesi yeni |
| `islemler`, `kaynaklar`, `tedavi-protokolleri` | **Sonra / dönüştür** | hizmet tanımı, alan/ekipman, antrenman şablonu |
| `personel/*` (basvurular, izinler, puantaj-cetveli), `lib/puantaj`, `lib/maas`, `lib/personel`, cron | **Sonra** | antrenör primi/baraj/fazla mesai |
| `tablet`, `lib/tablet`, `components/tablet` | **Sonra** | kiosk + salon ekranı |
| `portal`, `kayit`, `basvuru`, `anket`, `puantaj`, `lib/qr` | **Sonra** | müşteri portalı, QR akışları |
| `lib/mesaj`, `ayarlar/mesajlasma`, `ayarlar/whatsapp` | **Sonra** | |
| `lib/pdf` | **Dönüştür** | üyelik sözleşmesi, taahhütname, KVKK formu |
| `lib/onay-metinleri`, `destek/chatbot` sistem promptu, landing | **Yeniden yaz** | içerik klinik; `kvkk-legal` ile |
| `lib/vucut-bolgeleri` | **Yeniden** | anatomi → kas grubu/postür haritası |
| `arsiv-ice-aktarma` | **Sonra, değerlendir** | klinik arşivi içindi |
| `tasarim-galerisi` | **Çıkar** | geliştirici aracı |

## Aşamalar (her biri ayrı dal, doğrulamalı)

- **F0 — İskelet** ✅ repo, `.claude/` (21 skill, 10 agent), `CLAUDE.md`, bu plan.
- **F1 — Temel uygulama**: Next 16 + Tailwind v4 iskeleti, altyapı modülleri (yukarıdaki "Tut"), giriş; derlenir ve testleri geçer.
- **F2 — Taban şema**: `isletme`, kullanıcı/üyelik/rol, RLS + helper'lar (`current_isletme_id()`), audit log; RLS izolasyon testleri.
- **F3 — Müşteri**: `musteri`, `musteri_hassas`, veli, belge, KVKK onayları, `isim-bicimi`.
- **F4 — Üyelik**: `uyelik_paketi`, `paket_satis`, **üyelik + dondurma + yenileme** (yeni tasarım; önce kural kararları).
- **F5 — Check-in**: resepsiyon check-in, FIFO hak düşümü, paket bitiş uyarısı.
- **F6 — Cari ve kasa**: tek defter, kasa/banka/kredi kartı, iade, yıl pencereli raporlar.
- **F7 — KVKK ve hukuki metinler**: `legal-drafter` taslakları, avukat incelemesi.

## Riskler ve dikkat

- **Public repo**: sır/`.env`/müşteri verisi commit edilmez; `_agent/` ve `.env*` `.gitignore`'da.
- **SQL burada çalıştırılıp denenemez** (yerel Postgres yok). Şema/RLS denemeleri için ayrı bir Supabase test projesi/branch gerekir; canlıya uygulama kararı kullanıcıya aittir.
- **Next 16 farkları**: `proxy.ts`, asenkron `cookies()/headers()/params`; klinik kodu buna göre (zaten Next 16) ama gözden geçirilir.
- **Kapsam kayması**: MVP-1 dışı her modül yukarıdaki tabloda "Sonra"dır; F1-F6 bitmeden başlanmaz.

## Kullanıcı kararı bekleyenler

Yeni Supabase projesi (ayrı, test + canlı) · marka adı/paleti · üyelik dondurma kuralları · otomatik yenileme (abonelik tahsilatı) mı, manuel mi · kart ödemesi sağlayıcısı · turnike cihazı.

# Fitness Asistanı

## Proje Özeti
Fitness salonları, PT stüdyoları ve spor kompleksleri için çok kiracılı (multi-tenant) işletme yönetim SaaS'ı; Asistan Merkezi çatısı altında. Repo: `asistan-merkezi/fitness` (PUBLIC — sır, `.env`, müşteri verisi asla commit edilmez). Mimari `asistan-merkezi/klinik` (Klinik Asistanı) projesinden türetilir; klinik repoya dokunulmaz, referans alınır.
İş modeli: aktif antrenör sayısına göre kademeli SaaS (1-3 / 4-8 / 9+), beyaz etiket opsiyonu. Sonra: React Native antrenör + müşteri uygulaması.

## Stack ve Altyapı
- Next.js 16 (App Router, React 19, `useActionState`, `middleware.ts` yerine `proxy.ts`) + Tailwind v4 + shadcn/ui. Vercel (Frankfurt), Cloudflare DNS, Supabase.
- PDF: `puppeteer-core` + `@sparticuz/chromium` (sürümler exact-pin; bkz. skill `pdf-generation`). Şablonlar düz TS string + inline style.
- Paraşüt: şema/kuyruk hazır, gerçek hesap YOK; `faturaTetikle` "bağlantı kurulmadı" döner, `fatura.durum='bekliyor'` kalır.
- Mesajlaşma (SMS/WhatsApp/Mail): `mesaj.asistanmerkezi` merkez ucu; idempotency, versiyon kontrolü, hata kodları ve ödeme referansı ilkeleri klinikteki gibi.
- Kart ödemesi: TCMB lisanslı kuruluş (iyzico/PayTR) + 3DS. Stripe'ın Türkiye'deki yerel işletmelere açıklığı DOĞRULANMADAN seçilmez.
- Tablet/kiosk: Supabase Realtime, salt-okunur (PIN/device_token/gizlilik modu); çevrimdışı tolerans (`public/tablet-offline.html` + network-only SW).
- Cron (`vercel.json`, UTC): `personel-donem-otomatik-kapat` ayın 1'i 03:00 UTC (= 06:00 İstanbul); `audit-log-bolum-olustur` ayın 1'i 02:00 UTC (= 05:00 İstanbul); `mesaj-kuyruk-isle`, `kredi-senkron` tetikleyiciye bağlı.

## Veri Modeli
Tenant izolasyonu: `current_isletme_id()` + RLS; müşteri portalı: `current_musteri_id()`. Tüm tablo/kolon/rol adları ASCII Türkçe snake_case (ö,ü,ş,ı,ğ,ç YOK).

Klinik → Fitness dönüşümü (kolon: `klinik_id→isletme_id`, `hasta_id→musteri_id`, `terapist_id→antrenor_id`):
`klinik→isletme` · `klinik_ayarlari→isletme_ayarlari` · `hasta→musteri` (kategori: standart/gold/vip/platinum; `kayit_kanali`: resepsiyon|qr_self_servis; `risk_bayraklari`) · `hasta_hassas→musteri_hassas` (RLS'li 1-1; sağlık/sakatlık bayrakları) · `hasta_veli→musteri_veli` (18 yaş altı) · `hasta_iliski→musteri_iliski` · `hasta_kullanici→musteri_kullanici` · `hasta_anamnez→musteri_saglik_beyani` · `seans_notu→ders_notu` · `hasta_vucut_haritasi_isaretleme→musteri_vucut_kas_haritasi` · `hasta_protokol→musteri_antrenman_programi` · `tedavi_protokolu/_adimi→antrenman_program_sablonu/_adimi` · `olcek_tanimi/hasta_olcum→olcum_tanimi/musteri_olcum` · `islem_kontrendikasyon→egzersiz_sakatlik_kisiti` · `randevu→ders_seansi` (8 durum: planlandi/geldi/gecikmeli_geldi/derste/iptal/gelmedi/ertelendi/tamamlandi) · `oda→alan_studyo` · `cihaz→ekipman` · `islem_tanimi(_adim)→hizmet_tanimi(_adim)` · `paket→uyelik_paketi` · `paket_satis` · `hasta_bakiye_hareket→musteri_bakiye_hareket` · `hasta_belge/onam→musteri_belge/musteri_taahhutname` · `personel`, `terapist→antrenor`. Yeni: `egzersiz_kutuphanesi`.

Fitness'e özgü, klinikte OLMAYAN (tasarlanacak): zaman bazlı üyelik (aylık/yıllık, başlangıç-bitiş), üyelik dondurma, otomatik yenileme, grup dersi kapasitesi + rezervasyon + bekleme listesi, giriş kontrolü (turnike/QR).

## İş Kuralları
- **Roller** (`rol`): `super_admin` (platform; tüm tenant'lar, audit bypass) · `isletme_admin` (sahip/müdür; salon, ayarlar, finans, personel, rapor) · `resepsiyon` (müşteri kaydı, üyelik satışı, check-in, randevu/ders kaydı, kasa tahsilatı) · `antrenor` (yalnız KENDİ PT/grup dersleri, ders tamamlama, ders notu, kas/postür haritası, ölçüm) · `muhasebe` (fatura, borç/alacak, gider, kasa/banka, bordro salt-okunur; müşteri kişisel/ölçüm verisi KAPALI). Pozisyon grupları: diyetisyen (beslenme/vücut analizi), temizlik/hizmet (yalnız puantaj-vardiya-izin), cafe/mağaza (supplement satışı, hızlı kasa).
- **Randevu/ders**: çakışma exclusion constraint + ekipman rezervasyon trigger'ı (alan + antrenör + ekipman). Form sırası: Müşteri → Hizmet → Tarih → Saat → Antrenör → Alan/Stüdyo; hizmet adımları ve süre otomatik yüklenir.
- **Check-in**: `geldi`/`gecikmeli_geldi`; check-in bakiyeye borç YAZMAZ. Paketli üyelikte en eski aktif paketten 1 hak düşer (FIFO). Paketsiz ders: `tamamlandi` sonrası karttan "Cariye Ekle/Ödeme Ekle" → `randevu_seans_bedelini_isle` RPC.
- **Paket bitiş alarmı**: kalan hak ≤ 2 → antrenör/resepsiyon ekranında amber uyarı + müşteriye WhatsApp/SMS yenileme hatırlatması kuyruğa.
- **Cari (tek defter)**: `borc` bakiyeyi −(tutar−iskonto), `odeme` +tutar, `iade` (ödeme yöntemi zorunlu; kasa/banka/kart çıkışı). Kasa/banka sorguları `?yil=` pencereli + `kasa_bakiye_once_toplam` devir RPC'si. Faturadan önce eksik TC/adres/e-posta `eksik-bilgi-dialog` ile tamamlanır.
- **Personel**: doğrudan ekleme yok, iş başvurusu onaylanınca kart olur. Sabit maaş (kısmi ay gün oranlı) + seans başı PT primi (`prim_sabit_tutar`) + grup dersi primi (katılımcı sayısı/ders başı) + barajlı prim (kota aşımı çarpanı) + fazla mesai (`fm_saatlik_ucret`). Ayrılan: `isten_cikis_tarihi` girilince Auth hesabı banlanır, sonrasına randevu alınamaz, çıkıştan sonraki dersler hakedişe girmez; kayıt silinmez.
- **Salon QR**: müşteri ön kayıt/üyelik başvuru QR (IP 10/10dk, salon 300/gün hız sınırı), giriş/turnike QR, ders sonrası anket QR, personel puantaj PIN QR (6 hane hash'li).
- **Audit log v2**: üyelik iptali, ödeme/iade, fiyat ve müşteri bilgi değişiklikleri versiyonlu; ölçüm/sağlık/PII ham değerleri gösterilmez (yalnız alan adı maskeli); aylık RANGE partition.
- **Hassas veri**: sağlık beyanı, sakatlık, ölçüm = özel nitelikli KVKK verisi (klinikteki gibi sıkı); 18 yaş altı için veli rızası akışı; avukat onayı zorunlu (skill `kvkk-legal`).

## Konvansiyonlar
- TypeScript camelCase, DB snake_case; kod/DB/UI dili Türkçe (ASCII). UI metinleri Türkçe.
- Çok-tablolu atomik işlemler Postgres RPC (plpgsql, SECURITY DEFINER, `SET search_path = ''`); uygulama katmanında zincirlenmez. Migration: idempotent tek blok, `supabase/migrations/<zaman>_<ad>.sql`; canlıya uygulama kararı kullanıcıya aittir.
- **Saat dilimi**: her yerde İstanbul (`CLINIC_TZ`/`lib/datetime.ts` eşdeğeri). `new Date().toISOString().slice(0,10)` ve `new Date().getFullYear()` YASAK (sunucu UTC); DB'de `current_date` yerine `public.bugun_istanbul()`. Cron ifadeleri UTC. Dönem süzme `[başlangıç, bitiş)`, üst sınır exclusive. Bkz. skill `tarih-saat-donem`.
- **İsim biçimi**: isim alanlarında her kelimenin ilk harfi büyük — formda `isimBasHarfBuyukYap` (onChange), kayıtta sunucu Zod `transform` ile `isimNormalle`; açıklama/not/yorum/adres detayına UYGULANMAZ. Bkz. skill `isim-bicimi`.
- Tasarım: skill `brand-ui`; marka/palet kararı bekliyor.

## Yol Haritası / Durum
- **Şu an**: proje iskeleti; klinik kodundan temiz çıkarım planlanıyor (`docs/klinikten-cikarim-plani.md`). Henüz uygulama kodu yok.
- **MVP-1 — Üyelik + giriş + cari**: müşteri kaydı (+hassas/KVKK), üyelik paketi/satışı (dondurma dahil), resepsiyon check-in, cari ve kasa.
- **Sonra**: ders/PT takvimi + grup dersi kapasitesi; antrenman programı + ölçüm + kas haritası; tablet/kiosk; personel hakediş; müşteri portalı; QR akışları; Paraşüt; mesajlaşma.
- **Açık sorular**: turnike/giriş cihazı markası ve entegrasyon yöntemi · kart ödemesi sağlayıcısı (iyzico/PayTR; Stripe doğrulanacak) · dondurma kuralları (gün limiti, ücret) · otomatik yenileme tahsilatı (abonelik) · marka adı/paleti · fiyat kademeleri.

Son güncelleme: 2026-09-30

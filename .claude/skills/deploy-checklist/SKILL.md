---
name: deploy-checklist
description: Yayına alma (deploy) öncesi ve sonrası kontrol listesi standartları (Vercel + Supabase). Kullanıcı deploy, yayına alma, production'a çıkma, canlıya alma, release, go-live veya deploy sonrası doğrulama istediğinde MUTLAKA bu skill'i kullan. "Deploy edelim", "canlıya alalım", "yayınlayalım", "production'a hazır mı", "release yap" gibi ifadeler geçtiğinde de kullan. Atlanabilir adım bırakmayan, deploy sonrası doğrulamayı da kapsayan kontrollü yayın süreci üretir.
---

# Deploy Checklist

Vercel + Supabase projelerinde yayına alma standartları.

> Her deploy'da bu liste sırayla işlenir; "acil" deploy'da bile güvenlik ve migration adımları atlanmaz.

## 1. Deploy öncesi — kod

- [ ] `npm run build` lokalde temiz (tip hataları dahil)
- [ ] Testler geçiyor (testing skill'i: unit + varsa RLS/E2E) — kırmızı testle deploy yok
- [ ] `npm audit` critical/high temiz
- [ ] Debug kalıntısı yok: `console.log` dump'ları, geçici `TODO/FIXME` blokları, yorumlanmış eski kod
- [ ] security-baseline deploy bölümü işlendi (validation, rate limit, header'lar, env sızıntısı)

## 2. Deploy öncesi — veritabanı

- [ ] Migration'lar sql-migration standardında (idempotent, tek blok) ve **önce staging/branch'te** denendi
- [ ] Yeni tabloda RLS açık + policy'ler yazılı — RLS'siz tablo yayına çıkmaz
- [ ] Geri dönüş planı: migration bozulursa nasıl geri alınır, bir cümleyle biliniyor
- [ ] Yıkıcı değişiklik (kolon silme/yeniden adlandırma) iki aşamalı: önce yeni yapı + kod, veri taşındıktan sonra ayrı deploy'da eski yapı kaldırılır

## 3. Deploy öncesi — ortam

- [ ] Yeni env değişkenleri Vercel'e (production + preview ayrı ayrı) eklendi
- [ ] `NEXT_PUBLIC_` öneki gerçekten public olması gerekenler dışında yok
- [ ] Cron/zamanlanmış görev değiştiyse Vercel cron tanımı güncel
- [ ] Domain/DNS değişikliği varsa Cloudflare tarafı hazır

## 4. Deploy anı

- [ ] Preview deployment'ta son kontrol (Vercel otomatik üretir) — kritik akış preview'da tıklanarak denendi
- [ ] Migration → deploy sırası doğru: geriye uyumlu migration önce çalışır, sonra kod deploy edilir
- [ ] Yoğun kullanım saatinde yıkıcı deploy yapılmaz (kullanıcılı projelerde: sabah erken / gece)

## 5. Deploy sonrası doğrulama (ilk 10 dakika)

- [ ] Ana sayfa + login + projenin 1 kritik akışı canlıda elle denendi
- [ ] Vercel Functions log'larında yeni hata patlaması yok
- [ ] Supabase log'larında RLS/policy hatası yok
- [ ] Yeni özellik feature'ıysa: tek gerçek kayıtla uçtan uca denendi (ör. bir teklif oluştur → PDF al)
- [ ] Zamanlanmış görev değiştiyse: bir sonraki koşumu beklenmeden elle tetiklenip doğrulandı

## 6. Geri alma (rollback)

- Sorun çıkarsa: Vercel'de önceki deployment'a **Instant Rollback** (kod anında geri döner).
- Migration geri alınamıyorsa ileri düzeltme (fix-forward): küçük düzeltme migration'ı yaz, tekrar deploy et.
- Rollback sonrası kök neden bulunmadan aynı deploy tekrarlanmaz; bulunan neden regresyon testine dönüşür (testing skill'i, kural 4).

## 7. Kayıt

- Anlamlı her deploy CLAUDE.md'nin durum bölümüne bir satır düşer: tarih + ne değişti (project-context standardında, şişirmeden).

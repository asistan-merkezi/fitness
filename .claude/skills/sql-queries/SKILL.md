---
name: sql-queries
description: Salt-okunur SQL sorgu ve raporlama standartları (PostgreSQL/Supabase) — veri çekme, analiz sorguları, dashboard sorguları, ad-hoc raporlar. Kullanıcı veri sorgulama, rapor sorgusu, "kaç kayıt var", analiz için SELECT, dashboard metriği, view oluşturma veya karmaşık JOIN/aggregate sorgusu istediğinde MUTLAKA bu skill'i kullan. "Sorgu yaz", "SQL ile çek", "raporu sorgula", "kaç kullanıcı", "aylık kırılım", "en çok X olan" gibi ifadeler geçtiğinde de kullan. Şema değişikliği sql-migration'a tabidir — bu skill yalnızca okuma/raporlama sorgularını taşır ve yazma sorgusu üretmez.
---

# SQL Queries (Salt-Okunur Sorgu ve Raporlama)

PostgreSQL/Supabase üzerinde raporlama ve analiz sorguları standartları. **Kesin sınır: bu skill yalnızca SELECT üretir. Şema değişikliği, UPDATE/DELETE/INSERT sql-migration ve ilgili akışlara aittir — rapor bağlamında yazma sorgusu istenirse önce niyet netleştirilir.**

## Temel ilkeler

1. **Doğruluk > kısalık**: Sorgu, soruyu tam cevaplamalı. Belirsiz soruda ("aktif kullanıcı kaç?") önce tanım netleştirilir (aktif = son 30 gün giriş mi, işlem mi?) ve tanım sorguya yorum satırı olarak yazılır.
2. **Multi-tenant farkındalığı**: Tenant'lı tablolarda sorgu ya tek tenant'a filtrelidir ya da bilinçli olarak tenant-üstüdür — hangisi olduğu yorumda belirtilir. Service role ile RLS bypass edilerek çalıştırılan raporlarda bu açıkça söylenir (saas-patterns izolasyon ilkesi).
3. **Zaman dilimi tuzağı**: Tarih kırılımları kullanıcının saat diliminde yapılır (`created_at AT TIME ZONE 'Europe/Istanbul'`); UTC gün sınırıyla Türkiye günü karışmaz. "Bugün/bu ay" tanımı sorguda görünür.
4. **Maliyet bilinci**: Büyük tabloda önce `EXPLAIN` düşünülür; index'siz kolonda LIKE '%x%' / fonksiyonlu WHERE gibi full-scan desenleri işaretlenir. Production'da ağır rapor sorgusu çalıştırılacaksa zamanlama/limit önerilir.

## Sorgu kalıpları

- **Aggregate raporlar**: `date_trunc` ile dönem kırılımı + `FILTER (WHERE ...)` ile koşullu sayım; aynı raporda çok CASE yerine FILTER tercih edilir.
- **Okunabilirlik**: 2+ JOIN veya alt sorgu varsa CTE (`WITH`) kullanılır; her CTE tek iş yapar ve adı işini söyler. Tek harfli alias yasak (`u`, `t` değil → `users`, `tenants`).
- **Window fonksiyonları**: sıralama/pay/koşu toplamı ihtiyacında (`ROW_NUMBER`, `SUM() OVER`) — self-join ile taklit edilmez.
- **NULL disiplini**: LEFT JOIN sonrası sayımlar `COUNT(tablo.id)` ile yapılır (`COUNT(*)` tuzağı); oran hesaplarında sıfıra bölme `NULLIF` ile korunur.

## Kalıcılaştırma

- Tekrar kullanılan rapor sorgusu view'a dönüştürülür — ama view oluşturma bir şema değişikliğidir ve sql-migration formatıyla teslim edilir; bu skill yalnızca view'ın SELECT gövdesini tasarlar.
- Dashboard sorguları parametrik yazılır (tarih aralığı, tenant) ve string birleştirme değil parametre bağlama kullanır (security-baseline injection kuralı).
- Her teslim edilen sorgu: amaç yorumu + tanımlar + sorgu + örnek çıktı kolonları açıklaması içerir.

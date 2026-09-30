---
name: approval-workflow
description: Onay akışı ve içerik/işlem onay kapısı üretim standartları (taslak → onay → yayın). Kullanıcı onay mekanizması, onay kapısı, taslak-yayın akışı, içerik moderasyonu, admin onayı, durum makinesi (draft/pending/approved), yayınlama izni veya AI içeriğinin kontrollü yayını istediğinde MUTLAKA bu skill'i kullan. "Onay ekle", "onaydan geçsin", "taslak olarak kaydet", "admin onaylasın", "yayınlamadan önce kontrol", "reddetme sebebi" gibi ifadeler geçtiğinde de kullan. Sunucu tarafında zorlanan, denetlenebilir onay akışları üretir.
---

# Approval Workflow

Taslak → onay → yayın akışlarının Supabase + Next.js üzerinde güvenli kurulum standartları.

## 1. Onay kapısı sunucuda zorlanır, UI'da gizlenmez

- "Onayla" butonunu sadece admin'e göstermek **güvenlik değildir**. Kural veritabanı katmanında zorlanır:
  - Durum geçişleri RLS policy + trigger ile kısıtlanır.
  - Yayın sorguları her zaman `status = 'approved'` filtresiyle yapılır (view veya sorgu katmanında sabit).
- UI kısıtları yalnızca kullanıcı deneyimi içindir.

## 2. Durum makinesi

Standart durum seti ve izinli geçişler:

```
draft → pending_approval → approved → published
              ↓
           rejected → draft (revizyon)
```

- Geçişler **trigger ile kısıtlanır**: `draft → published` gibi atlama denemesi hata verir.
- Yayından geri çekme/arşivleme de bir geçiştir: `published → archived` (gerekiyorsa `approved → pending_approval` yeniden inceleme). Bu geçişler de trigger'da tanımlı, yetkili role bağlı ve `approval_events`'e yazılır; tanımsız bırakılırsa yayından kaldırma `UPDATE`/`DELETE` ile denetimsiz yapılır.
- `status` kolonu enum/check constraint ile sınırlıdır; serbest metin yasak.
- Her geçişte `status_changed_at` ve `status_changed_by` güncellenir (trigger).

## 3. Kolon koruması

- `status`, `approved_by`, `approved_at` kolonlarını yalnızca yetkili rol değiştirebilir — bu, RLS policy **ve** kolon bazlı trigger kontrolüyle sağlanır (UPDATE'te OLD/NEW karşılaştırması: yetkisiz kullanıcı bu kolonlara dokunursa exception).
- İçerik sahibi kendi kaydının içeriğini düzenleyebilir ama durumunu ilerletemez (sadece `draft → pending_approval` gönderimi yapabilir).

## 4. Üreten ≠ onaylayan

- Rol ayrımı: içeriği/işlemi oluşturan kişi kendi kaydını onaylayamaz.
- Trigger kontrolü: `approved_by = created_by` ise reddet (tek kişilik tenant'larda bilinçli olarak gevşetilebilir — CLAUDE.md'de not düşülür).

## 5. Denetim izi (audit trail)

- `approval_events` tablosu **insert-only**: her geçiş bir satır (kayıt ID, eski durum, yeni durum, kim, ne zaman, neden).
- UPDATE/DELETE bu tabloda RLS ile tamamen kapalıdır.
- **Reddetmede sebep zorunlu**: `rejected` geçişinde `reason` alanı boşsa trigger hata verir. Üreten kişi neyi düzelteceğini bilmelidir.

## 6. Onay ekranı: yayınlanacak haliyle önizleme

- Onaylayan, içeriği **yayınlanacağı görünümde** görür (as-published preview) — ham form alanları listesi değil.
- Örnek: sosyal medya postu onayı → platform görünümü mockup'ı; teklif onayı → PDF önizlemesi.
- Onay/Red butonları önizlemenin yanında; red seçilince sebep alanı zorunlu açılır.

## 7. Bildirimler

- Yeni onay bekleyen kayıt → onaylayana anlık bildirim (telegram-bot veya email-service skill'i ile).
- Biriken bekleyenler için **günlük özet** (digest): her kayıt için ayrı mesaj spam'ine düşme; sabah tek mesajda "N kayıt onay bekliyor" + link.
- Red → üretene sebep dahil bildirim.

## 8. AI içeriği kuralı

- LLM'in ürettiği her içerik **istisnasız `draft` olarak doğar**; otomatik yayın yolu yoktur.
- Toplu üretimde bile onay **tek tek** verilir ("tümünü onayla" butonu yok) — AI çıktısı insan gözünden geçmeden yayınlanmaz.
- Bu kural içerik üreten projelerin temel güvenlik varsayımıdır; kaldırılması bilinçli bir karar gerektirir.

## Kontrol listesi

- [ ] Durum geçişleri trigger ile mi kısıtlı, yoksa sadece UI'da mı?
- [ ] Status/approved_by kolonları yetkisiz UPDATE'e kapalı mı?
- [ ] Üreten kendi kaydını onaylayabiliyor mu? (olmamalı)
- [ ] Audit tablosu insert-only mu, red sebebi zorunlu mu?
- [ ] Onay ekranı yayın önizlemesi gösteriyor mu?
- [ ] AI içeriği draft doğuyor mu?

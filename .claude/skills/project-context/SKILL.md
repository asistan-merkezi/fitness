---
name: project-context
description: CLAUDE.md proje bağlam dosyası oluşturma, güncelleme ve sıkıştırma standartları. Kullanıcı yeni proje için CLAUDE.md istediğinde, mevcut CLAUDE.md'yi güncellemek/sıkıştırmak istediğinde veya proje bağlamını düzenlemek istediğinde MUTLAKA bu skill'i kullan. "CLAUDE.md oluştur", "CLAUDE.md güncelle", "bağlam dosyası", "CLAUDE.md şişti", "context sıkıştır", "projeyi belgele" gibi ifadeler geçtiğinde de kullan. Yalın, güncel, 20k karakter altında proje bağlam dosyaları üretir.
---

# Project Context (CLAUDE.md)

CLAUDE.md dosyalarının oluşturma, güncelleme ve sıkıştırma standartları. Temel iş bölümü: **skill = evrensel "nasıl", CLAUDE.md = projeye özel "ne"**. Bir bilgi birden çok projede aynen geçerliyse skill'e aittir, CLAUDE.md'ye yazılmaz; CLAUDE.md yalnızca o projeye özgü gerçekleri taşır.

## Boyut ve yoğunluk kuralları

- **Sert limit: 20.000 karakter.** Hedef: 12-18k arası. Limit yaklaşınca ekleme değil SIKIŞTIRMA yapılır.
- Her cümle bilgi taşımalı; dolgu cümleleri ("Bu proje modern teknolojiler kullanır" gibi) YASAK.
- Kod örneği CLAUDE.md'ye girmez — desen adıyla anılır ("upsert `on_conflict=(tarih, kaynak_id)` ile") veya ilgili dosyaya işaret edilir. İstisna: projeye özgü, başka yerde bulunamayacak kritik tek satırlıklar (helper function imzası gibi).
- Geçmiş anlatısı tutulmaz: "önce X denedik olmadı, sonra Y yaptık" yerine yalnızca güncel karar + tek satır gerekçe ("Y kullanılıyor; X, Z nedeniyle terk edildi"). Deney günlüğü ayrı dosyadadır (`DENEYLER.md` vb.).

## Standart bölüm yapısı

Sıra sabittir; olmayan bölüm atlanır, yeni bölüm icat edilmeden önce mevcutlara sığdırılmaya çalışılır:

```markdown
# {Proje Adı}

## Proje Özeti
2-4 cümle: ne, kimin için, iş modeli. Domain adı, canlı URL.

## Stack ve Altyapı
Yalnızca projeye ÖZGÜ olanlar: servis hesapları/bölgeleri (ör. Resend EU),
harici API'ler, farklılaşan sürümler. Standart stack tek satır.

## Veri Modeli
Tablo listesi: ad + tek satır amaç + kritik alanlar/ilişkiler.
Tenant kolonu adı, helper function adları (current_tenant_id() vb.), rol listesi.
Kolon kolon şema dökümü YAZILMAZ (o migration dosyalarında).

## İş Kuralları
Projeye özgü domain kuralları: kim neyi yapabilir, hangi durumda ne olur,
yasak/zorunlu davranışlar (ör. "tavsiye dili yasak", "veliye login yok").

## Konvansiyonlar
Bu projede skill varsayılanlarından SAPAN veya skill'lerin parametre
beklediği değerler: marka renkleri (hex), fontlar, from adresleri,
prompt sürümü, metrik tanımı, ölçek seçimi.

## Yol Haritası / Durum
Yalnızca AKTİF işler: yapılmakta olan + sıradaki 2-3 madde + bilinen
açık sorunlar. Bitenler taşınmaz, silinir.
```

## Güncelleme disiplini

- CLAUDE.md her anlamlı iş sonunda güncellenir: yeni tablo → Veri Modeli'ne satır; karar değişti → eski satır SİLİNİR, yenisi yazılır (üstüne ekleme değil, değiştirme).
- "Durum" bölümü en sık bozulan yerdir: biten iş oradan silinir. CLAUDE.md yapılacaklar arşivi değil, anlık fotoğraftır.
- Çelişki sıfır toleranslıdır: aynı bilgi iki yerde farklıysa dosya güvenilmez hale gelir. Güncelleme yaparken ilgili bilginin geçtiği TÜM satırlar taranır.
- Tarih damgası tek yerde: dosya sonunda `Son güncelleme: YYYY-MM-DD`. Bölüm bölüm tarih tutulmaz.

## Sıkıştırma prosedürü (dosya şiştiğinde)

Sırayla uygula, her adımdan sonra karakter say:

1. **Bitenleri sil**: Durum bölümündeki tamamlanmış işler, çözülmüş sorunlar.
2. **Geçmişi buda**: karar geçmişleri tek satır güncel karara indirilir.
3. **Kod bloklarını çıkar**: desen adına veya dosya yoluna dönüştür.
4. **Skill'e devret**: evrenselleşebilir "nasıl" anlatıları tespit edilir — ilgili skill zaten varsa satır silinir, yoksa yeni skill adayı olarak kullanıcıya önerilir.
5. **Cümle sıkılaştır**: madde işaretli telegraf üslubuna çevir ("X yapılırken Y'ye dikkat edilmelidir" → "X'te Y zorunlu").

Sıkıştırma HİÇBİR bilgiyi kaybetmez; yalnızca yoğunlaştırır veya doğru eve (skill, ayrı dosya) taşır. Silinen önemli bağlam varsa kullanıcıya tek satırla bildirilir.

## Yeni proje için CLAUDE.md oluşturma

- Kullanıcıdan minimum girdi: proje adı, tek cümle amaç, domain (varsa), farklılaşan kararlar. Gerisi standart yapıyla iskeletlenir.
- İskelet doldurulamayan bölümü boş başlıkla BEKLETMEZ; bölüm yazılmaz, iş oluştukça eklenir.
- İlk sürümde bile 20k kuralı geçerli — "sonra sıkıştırırız" diye şişik başlanmaz.

## Çıktı formatı

- Yeni dosya: tam CLAUDE.md içeriği tek blokta + karakter sayısı bildirimi.
- Güncelleme: yalnızca değişen bölüm(ler) net biçimde ("Veri Modeli'ne eklenecek satır: ...") — kullanıcı isterse tam dosya.
- Sıkıştırma: önce özet rapor (kaç karakterden kaça, ne silindi/taşındı) + yeni tam içerik.

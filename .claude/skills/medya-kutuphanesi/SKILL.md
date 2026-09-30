---
name: medya-kutuphanesi
description: Uygulama içi medya kütüphanesi modülü standartları — kategorili fotoğraf/dosya yükleme, listeleme, arama ve silme akışının mimarisi (Supabase Storage + tablo kaydı). Kullanıcı fotoğraf yükleme ekranı, galeri modülü, medya kütüphanesi, kategorili görsel arşivi, çoklu dosya yükleme, storage + DB kayıt tutarlılığı veya "yüklediğim görselleri listeleyip silebileyim" tipi bir modül istediğinde MUTLAKA bu skill'i kullan. "Fotoğraf ekle", "galeri yap", "görsel arşivi", "çoklu yükleme", "medya modülü", "yüklenen dosyayı sil" gibi ifadeler geçtiğinde de kullan. Dosyanın kendisinin işlenmesi media-editing'e, yükleme güvenliği security-baseline'a, tenant izolasyonu saas-patterns'a tabidir — bu skill depolama düzeni, kayıt tutarlılığı ve erişim ayrımını taşır.
---

# Medya Kütüphanesi

Uygulama içinde "yükle → sakla → listele → sil" yapan medya modülünün mimarisi. Proje-özel değerler (bucket adı, kategori ağacı, rol adları) CLAUDE.md'dedir.

**Sınırlar:** görselin boyutlandırılması/format dönüşümü `media-editing`, MIME/magic byte/boyut doğrulaması `security-baseline`, rol ve oturum mekaniği `auth-flow`, tenant izolasyonu `saas-patterns`, şema bloğu `sql-migration`. Bu skill onların üstüne yazmaz; aralarındaki boşluğu (depolama düzeni + kayıt tutarlılığı + erişim ayrımı) doldurur.

## 1. İki taraflı işleme: client küçültür, sunucu doğrular

Bu modülün işleme sözleşmesi (işlemenin **nasıl** yapıldığı `media-editing`'in "Uygulama içi otomatik yükleme hattı" bölümündedir — burada tekrarlanmaz):

- **Client tarafı küçültme UX içindir**, güvenlik değil. Amaç mobil veriyi ve yükleme süresini düşürmek; tek savunma hattı olursa modül güvensizdir.
- HEIC/HEIF girdisi (iPhone) client'ta JPEG'e çevrilir. Dönüştürücü kütüphane **lazy import** edilir (`await import('heic2any')`) — ağır kütüphane ana bundle'a girmez.
- **Sunucu client'a güvenmez.** Route'a doğrudan istek atılabileceği varsayılır: boyut sınırı ve MIME + magic byte kontrolü (`security-baseline`) sunucuda tekrar yapılır, ardından dosya işleme hattından geçer.
- Yön düzeltme + EXIF/GPS temizliği ve varyant üretimi (`thumb` / `md` / `lg`) **sunucuda** olur; client'ın gönderdiği dosya "orijinal" muamelesi görmez.
- **Vercel gövde sınırı:** sunucusuz fonksiyonlar yaklaşık 4,5MB istek gövdesiyle sınırlıdır; büyük dosya doğrudan route'a POST edilemez. Desen: client dosyayı Supabase Storage'a **signed upload URL** ile geçici (karantina) prefix'e yükler → route dosyayı Storage'dan okuyup doğrular ve işler → varyantları asıl yola yazar, karantina dosyasını siler. Client tarafı küçültme bu yüzden yalnızca UX değil pratik bir gereklilik de olur.

**Orijinal dosya politikası (karar gerektirir, CLAUDE.md'ye yazılır):**

- Varsayılan: **orijinal saklanmaz**, en büyük varyant (`lg`) kanonik dosyadır. Storage maliyeti ve gizlilik yüzeyi küçülür.
- Orijinal gerekiyorsa (baskı çıktısı, arşiv yükümlülüğü, sonradan farklı varyant üretme ihtiyacı) ayrı bir private bucket/prefix'te tutulur ve **hiçbir zaman doğrudan servis edilmez**. "Belki lazım olur" gerekçesi yeterli değildir.
- `media-editing`'in "orijinali koru, üzerine yazma" kuralı offline/toplu iş içindir; uygulama içinde yüklenen dosyanın karşılığı yukarıdaki karardır.

## 2. Depolama düzeni (storage path)

- Şema: `{tenant?}/{kategori-slug}/{alt-kategori-slug}/{uuid}.{ext}`
- Path'in her parçası slug'lanır (Türkçe karakter → ASCII, boşluk → `-`). **Kullanıcıdan gelen dosya adı path'e girmez.**
- Dosya adı UUID olur; kullanıcının gördüğü orijinal ad DB'de `name` kolonunda tutulur. `{timestamp}_{orijinal-ad}` deseni kullanılmaz: eşzamanlı çoklu yüklemede çakışır ve kullanıcı girdisini path'e taşır.
- Klasör yapısı insan gözüyle gezilebilir olsun diye anlamlıdır; **sorgu asla path parse etmez** — kategori DB kolonundan okunur.
- Bucket kararı içeriğe göre: gerçekten herkese açık içerik (pazarlama galerisi, ürün görseli) → public bucket + public URL. Kişiye/müşteriye ait her şey → private bucket + signed URL. Karar CLAUDE.md'ye yazılır, aynı bucket'ta karıştırılmaz.

## 3. Storage ↔ DB tutarlılığı

Storage ve veritabanı iki ayrı sistemdir; ortak transaction yoktur. Bu yüzden sıra ve telafi açıkça tanımlanır:

- **Yükleme:** önce storage'a yaz → sonra DB insert. DB insert başarısızsa yüklenen dosya **geri silinir** (rollback). Rollback de başarısızsa kullanıcıya hata döner ve olay yetim dosya olarak loglanır.
- **Silme:** önce DB kaydı (veya soft-delete) → sonra storage. Storage silinemezse kullanıcı akışı bloklanmaz; dosya yetim kalır, bakım işine bırakılır.
- **`storage_path` kolonu zorunludur.** Silme için public URL'den path türetilmez — URL biçimi değiştiğinde silme sessizce çalışmaz hale gelir.
- **Yetim taraması:** periyodik iş (`data-pipeline`) storage'da olup DB'de olmayan ve belirli yaştan eski dosyaları raporlar. Otomatik silme değil, önce rapor.

## 4. Kategori taksonomisi: kodda mı, DB'de mi?

- Kategori ağacı **geliştirici tarafından** yönetiliyorsa (sabit, nadiren değişir): tek bir paylaşılan sabitte tutulur (`CATEGORIES`), DB'de yalnızca **slug** saklanır. İç içe kategori → alt kategori yapısı migration gerektirmeden değişir ve tüm ekranlar aynı kaynaktan besleniyorsa tutarlı kalır.
- **Müşteri kendi kategorisini açabilecekse** DB tablosu + FK gerekir. İkisi melez yapılmaz — biri seçilir, CLAUDE.md'ye yazılır.
- DB'ye görünen etiket değil slug yazılır; etiket koddan gelir, ad değişince veri göçü gerekmez.
- Alt kategorisi olmayan kategoride `subcategory` **NULL** olur (boş string değil); sorgu `is null` ile eşleşir.

## 5. Okuma (liste) API'si

- Zorunlu daraltıcı parametre vardır (kategori ve/veya tenant). Filtresiz "hepsini getir" yoktur.
- **Sayfalama ilk günden**: `limit` + cursor/offset, varsayılan 24-48 kayıt. "Sonra ekleriz" denmez; galeri büyüdüğünde tüm liste ekranı çöker.
- Arama: ad üzerinde `ilike`; kullanıcı girdisindeki `%` ve `_` karakterleri kaçırılır. Arama filtreyi **daraltır, genişletmez** — arama varken kategori dışı sonuç dönmez.
- Sıralama deterministik: `created_at desc, id desc` (aynı saniyedeki kayıtlar sayfalar arasında zıplamasın).
- Liste yanıtında `storage_path` gibi iç alanlar yalnızca silme yetkisi olan role döner.

## 6. Yetki: service-role kullanan route kendi kontrolünü yapar

- Storage yazmak için service-role client kullanmak **RLS'i devre dışı bırakmak** demektir. Route'un ilk işi oturumu doğrulamak, rolü ve modül iznini kontrol etmektir. "UI'da buton görünmüyor" yetkilendirme değildir.
- **İki erişim noktası deseni:** yönetim arayüzü (yükleme + silme) ve görüntüleyici arayüz (yalnız okuma) aynı component'i `isAdmin` benzeri tek bir bayrakla paylaşır. Bayrak **sunucuda** hesaplanır; client'tan gelen prop'a göre karar verilmez.
- Modül bazlı izin listesi (`allowed_modules` vb.) varsa hem sayfa erişiminde hem API route'unda kontrol edilir (çift kontrol).
- Multi-tenant projede kategori filtresi yetmez: tenant filtresi + RLS (`saas-patterns`) + storage path'inde tenant öneki birlikte uygulanır.

## 7. Yükleme arayüzü davranışı

- Çoklu seçim (`multiple`) desteklenir; dosyalar **sırayla** işlenir — paralel canvas/encode işi mobil tarayıcıyı kilitler.
- Dosya başına durum gösterilir: bekliyor → işleniyor → yükleniyor → tamam/hata. Bir dosyanın hatası kalanları iptal etmez; sonunda özet verilir ("8 yüklendi, 1 başarısız").
- Yükleme bitince liste yenilenir. Optimistic ekleme yapılıyorsa hata halinde geri alınır.
- Silme geri alınamaz: onay zorunlu. Tek kayıtta basit onay yeterli; toplu veya kritik silmede **ne silineceğini gösteren** modal kullanılır.
- Listede `thumb` varyantı gösterilir, `lg` yalnızca önizlemede yüklenir (varyant adları `media-editing` sözlüğünden). `loading="lazy"` + sabit en-boy oranlı kutu (layout shift olmasın).

## 8. Asgari tablo şeması

`id`, `tenant_id?`, `category`, `subcategory` (null olabilir), `name` (orijinal dosya adı), `url`, `storage_path`, `mime_type`, `size_bytes`, `width`/`height`, `uploaded_by`, `created_at`.

İndeks: `(category, subcategory, created_at desc)` ve varsa `tenant_id`. Migration `sql-migration` standardına göre tek blok ve idempotent yazılır.

## Kontrol listesi

- [ ] Sunucu tarafı boyut + MIME/magic byte kontrolü var mı?
- [ ] EXIF/GPS temizliği ve yön düzeltme sunucuda mı?
- [ ] Dosya adı UUID, orijinal ad DB'de mi?
- [ ] DB insert hatasında storage rollback'i var mı?
- [ ] `storage_path` saklanıyor mu (URL parse edilmiyor)?
- [ ] Liste sayfalanıyor mu?
- [ ] Service-role kullanan route'ta açık yetki kontrolü var mı?
- [ ] Bucket public/private kararı içerikle uyumlu mu?
- [ ] Orijinal dosya politikası (saklanır/saklanmaz) CLAUDE.md'de yazılı mı?
- [ ] Multi-tenant ise tenant filtresi + RLS + path öneki üçü de var mı?

## Sık hatalar

- Client'ta küçültüp sunucuda hiç doğrulamamak (route'a doğrudan 40MB dosya atılabilir).
- Silmede public URL'i parse ederek storage path'i tahmin etmek.
- Kategoriyi hem kodda hem DB'de yarım yarım tutmak.
- Sayfalamayı "sonra ekleriz" diye ertelemek.
- Yetkiyi sadece UI'da butonu gizleyerek kurmak.

## Çıktı formatı

Modül istendiğinde sırayla teslim edilir: (1) migration bloğu, (2) API route'ları (POST/GET/DELETE), (3) paylaşılan component + iki sayfa girişi (yönetim / görüntüleyici). Claude Code'a verilecek talimatlar copy-paste kod bloğu içinde yazılır.

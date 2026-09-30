---
name: kvkk-legal
description: KVKK uyumu ve Türkçe hukuki metin taslağı standartları — aydınlatma metni, açık rıza, çerez politikası, kullanım şartları, gizlilik politikası, mesafeli satış sözleşmesi taslakları ve kişisel veri işleme envanteri. Kullanıcı KVKK, aydınlatma metni, açık rıza, çerez banner'ı, gizlilik politikası, kullanım şartları, üyelik sözleşmesi, veri saklama süresi veya kişisel veri uyumu istediğinde MUTLAKA bu skill'i kullan. "KVKK uyumlu mu", "aydınlatma metni yaz", "çerez politikası", "sözleşme taslağı", "veri silme talebi" gibi ifadeler geçtiğinde de kullan. Tüm çıktılar avukat onayı gerektiren TASLAKTIR — skill bunu her teslimde açıkça belirtir.
---

# KVKK-Legal (KVKK Uyumu ve Hukuki Metin Taslakları)

Türk hukukuna göre web uygulaması hukuki metin taslakları ve KVKK uyum pratiği. **Kesin kural: Her çıktı "avukat incelemesi gereken taslak" ibaresiyle teslim edilir; hukuki tavsiye verilmez, verildiği izlenimi yaratılmaz.**

## Temel ilkeler

1. **Envanter önce metin sonra**: Aydınlatma metni yazmadan önce veri işleme envanteri çıkarılır: hangi veri, hangi amaçla, hangi hukuki sebeple, ne kadar süre, kimlere aktarılıyor (Supabase Frankfurt, Vercel, Resend EU, analitik vb. alt işleyiciler dahil). Envantersiz şablon metin yasak.
2. **Gerçeğe uygunluk**: Metin, uygulamanın gerçekte yaptığını anlatır. Yapılmayan şey yazılmaz ("verileriniz yurt dışına aktarılmaz" — Vercel/Supabase kullanılıyorsa aktarılıyordur), yapılan şey gizlenmez.
3. **Sade Türkçe**: Hukuki metinler dahi anlaşılır yazılır; zorunlu terimler korunur ama cümleler kısa tutulur.
4. **Özel nitelikli veri alarmı**: Sağlık, biyometrik, din vb. özel nitelikli veri işleniyorsa (okul projelerinde öğrenci sağlık notu gibi) bu ayrıca işaretlenir ve avukat incelemesi "önerilir" değil "zorunlu" olarak raporlanır. Çocuk verisi (18 yaş altı) işleyen projelerde veli rızası akışı tasarıma dahil edilir.

## Standart metin seti (web uygulaması başına)

- **Aydınlatma metni**: veri sorumlusu kimliği, işlenen veriler, amaçlar, hukuki sebepler, aktarım (alıcı grupları + yurt dışı), saklama süreleri, ilgili kişi hakları (KVKK m.11) ve başvuru yöntemi.
- **Açık rıza metinleri**: Yalnızca gerçekten rızaya dayanan işlemler için, amaç bazında ayrı ayrı (pazarlama e-postası ayrı, profilleme ayrı). Hizmetin şartı olarak rıza dayatılmaz; önceden işaretli kutu yasak.
- **Çerez politikası + banner**: zorunlu/analitik/pazarlama ayrımı; zorunlu dışındakiler varsayılan kapalı; "reddet" seçeneği "kabul et" ile eşit erişilebilirlikte.
- **Kullanım şartları**: hizmet tanımı, hesap sorumlulukları, kabul edilebilir kullanım, fesih, sorumluluk sınırı, uyuşmazlık (yetkili mahkeme/İl).
- **Mesafeli satış sözleşmesi + ön bilgilendirme**: Ücretli B2C satış varsa; cayma hakkı ve dijital hizmet istisnası açıkça düzenlenir.

## Uygulama içi uyum pratiği

- **İlgili kişi hakları teknik karşılığı**: veri silme/düzeltme/taşıma talepleri için gerçek bir akış tasarlanır (talep kaydı → kimlik doğrulama → 30 gün içinde yanıt → silmenin yedeklere yansıma notu). "Mailde hallederiz" kabul edilmez.
- **Saklama süreleri koda iner**: Envanterdeki süre biterse ne olacağı tanımlıdır (anonimleştirme/silme cron'u — data-pipeline standartlarıyla).
- **Rıza kayıtları ispatlanabilir**: kim, ne zaman, hangi metne, hangi versiyona rıza verdi — veritabanında tutulur.
- **VERBİS**: Belirli eşikleri aşan veri sorumluları VERBİS'e kayıt olmak zorundadır; kapsam ve istisnalar güncel Kurul kararlarından avukatla doğrulanır, envanter bu kaydın da kaynağıdır.
- **Yurt dışı aktarım (m.9)**: 2024 değişikliğiyle aktarım mekanizmaları yeniden düzenlendi (yeterlilik kararı, standart sözleşme, bağlayıcı şirket kuralları vb.). Supabase/Vercel/Resend gibi yurt dışı alt işleyiciler için hangi mekanizmanın kullanıldığı envanterde yazılır; standart sözleşme imzalanıyorsa Kurul'a bildirim süresi takip edilir (güncel düzenleme avukatla teyit edilir).
- **İYS**: Ticari elektronik ileti (e-posta/SMS/arama) KVKK açık rızasından ayrı bir rejimdir (6563 sayılı Kanun); alıcı onayı İYS'ye kaydedilir ve e-posta dizileri buna göre süzülür.
- **Veri ihlali hazırlığı**: ihlal tespitinde 72 saat KVKK bildirimi kuralı için önceden iletişim şablonu ve karar sahibi bellidir.

## Teslim formatı

Her teslim: (1) veri envanteri tablosu, (2) metin taslakları, (3) uygulamada değişmesi gerekenler listesi (banner, rıza checkbox'ları, silme akışı), (4) "avukat onayı gereken noktalar" bölümü — özellikle sektörel mevzuat (eğitim, finans) varsa.

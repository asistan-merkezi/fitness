import type { MesajBolum } from "@/types/mesajlasma";

/**
 * Tetikleyici KATALOĞU — kodda sabit tek kaynak (klinikle aynı ilke). Veritabanı (`mesaj_kurali`) yalnız işletmenin bu kataloğun
 * ÜSTÜNE yazdığı ayarları (aktif mi, hangi kanallar, mesaj metni) tutar. Bir kural için satır yoksa PASİF sayılır.
 * Yeni tetikleyici eklemek için buraya satır eklemek yeter; migration gerekmez.
 *
 * `bagli: true` = kod tarafında gerçek bir olaya/taramaya bağlı. `false` = katalogda var, ayar kaydedilebilir ama henüz mesaj üretilmiyor.
 */
export type MesajTetiklemeTipi = "anlik" | "zamanlanmis";
/** 'hizmet': mevcut hizmetin doğal parçası (izinsiz gönderilebilir). 'ticari': pazarlama/ilişki; müşterinin ticari ileti izni yoksa GÖNDERİLMEZ. */
export type MesajIcerikTipi = "hizmet" | "ticari";

export type TetikleyiciTanimi = {
  kod: string;
  bolum: MesajBolum;
  ad: string;
  icerikTipi: MesajIcerikTipi;
  tetiklemeTipi: MesajTetiklemeTipi;
  zamanlamaAciklamasi?: string;
  /** Zamanlanmış tetikleyicide ekranda sorulan ön değer (dakika); örn. dersten 1440 dk (24 saat) önce. */
  varsayilanOffsetDakika?: number;
  gecerliDegiskenler: string[];
  varsayilanMesajMetni: string;
  bagli: boolean;
  baglanmaNotu?: string;
};

export const TETIKLEYICILER: readonly TetikleyiciTanimi[] = [
  // ---- Müşteri ----
  {
    kod: "musteri_kayit_hosgeldin",
    bolum: "musteri",
    ad: "Kayıt olunca hoş geldiniz mesajı",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["musteri_adi", "isletme_adi"],
    varsayilanMesajMetni: "Merhaba {{musteri_adi}}, {{isletme_adi}} ailesine hoş geldiniz! Kaydınız başarıyla oluşturuldu.",
    bagli: true,
  },
  {
    kod: "uyelik_satis_ozet",
    bolum: "musteri",
    ad: "Üyelik/paket satılınca özet mesajı",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["musteri_adi", "paket_adi", "bitis_tarihi", "isletme_adi"],
    varsayilanMesajMetni: "Merhaba {{musteri_adi}}, {{paket_adi}} üyeliğiniz tanımlandı. Bitiş tarihi: {{bitis_tarihi}}. — {{isletme_adi}}",
    bagli: true,
  },
  {
    kod: "uyelik_hak_azaldi",
    bolum: "musteri",
    ad: "Seans hakkı azalınca yenileme hatırlatması",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["musteri_adi", "paket_adi", "kalan_hak", "isletme_adi"],
    varsayilanMesajMetni: "Merhaba {{musteri_adi}}, {{paket_adi}} paketinizde {{kalan_hak}} seans hakkınız kaldı. Yenilemek için bize ulaşabilirsiniz. — {{isletme_adi}}",
    bagli: true,
    baglanmaNotu: "Check-in ve ders hakkı düşümünde, kalan hak 2 veya daha azsa kuyruğa yazılır.",
  },
  {
    kod: "uyelik_bitiyor",
    bolum: "musteri",
    ad: "Üyelik süresi dolmadan hatırlatma",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Bitiş tarihinden belirtilen süre önce, günlük tarama",
    varsayilanOffsetDakika: 7 * 24 * 60,
    gecerliDegiskenler: ["musteri_adi", "paket_adi", "bitis_tarihi", "isletme_adi"],
    varsayilanMesajMetni: "Merhaba {{musteri_adi}}, {{paket_adi}} üyeliğiniz {{bitis_tarihi}} tarihinde sona eriyor. Yenilemek için bize ulaşabilirsiniz. — {{isletme_adi}}",
    bagli: true,
  },
  {
    kod: "musteri_dogum_gunu",
    bolum: "musteri",
    ad: "Doğum günü kutlaması",
    icerikTipi: "ticari",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Doğum günü (ay/gün eşleşmesi), günlük tarama",
    gecerliDegiskenler: ["musteri_adi", "isletme_adi"],
    varsayilanMesajMetni: "Doğum gününüz kutlu olsun {{musteri_adi}}! {{isletme_adi}} ailesi olarak sağlıklı bir yıl dileriz.",
    bagli: true,
  },
  {
    kod: "musteri_ozledik",
    bolum: "musteri",
    ad: "Uzun süredir gelmeyen müşteriye hatırlatma",
    icerikTipi: "ticari",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Son girişten belirtilen süre sonra, günlük tarama",
    varsayilanOffsetDakika: 30 * 24 * 60,
    gecerliDegiskenler: ["musteri_adi", "isletme_adi"],
    varsayilanMesajMetni: "Merhaba {{musteri_adi}}, sizi aramızda göremeyeli uzun zaman oldu. {{isletme_adi}} olarak sizi tekrar görmekten mutluluk duyarız.",
    bagli: true,
  },
  // ---- Randevu ----
  {
    kod: "ders_olusturuldu",
    bolum: "randevu",
    ad: "Randevu oluşturulunca bilgilendirme",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["musteri_adi", "antrenor_adi", "tarih", "saat", "alan_adi", "isletme_adi"],
    varsayilanMesajMetni: "Merhaba {{musteri_adi}}, {{tarih}} günü saat {{saat}} için {{antrenor_adi}} ile randevunuz oluşturuldu ({{alan_adi}}). — {{isletme_adi}}",
    bagli: true,
  },
  {
    kod: "ders_hatirlatma",
    bolum: "randevu",
    ad: "Randevudan önce hatırlatma",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Randevudan belirtilen süre önce",
    varsayilanOffsetDakika: 24 * 60,
    gecerliDegiskenler: ["musteri_adi", "antrenor_adi", "tarih", "saat", "alan_adi", "isletme_adi"],
    varsayilanMesajMetni: "Merhaba {{musteri_adi}}, yarın saat {{saat}} için {{antrenor_adi}} ile randevunuzu hatırlatırız. — {{isletme_adi}}",
    bagli: true,
    baglanmaNotu: "Tarama günde bir kez çalışır; bu yüzden hatırlatma, randevudan en az bir gün önce planlanır (ör. ertesi günün randevuları).",
  },
  {
    kod: "ders_iptal",
    bolum: "randevu",
    ad: "Randevu iptal edilince bilgilendirme",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["musteri_adi", "tarih", "saat", "isletme_adi"],
    varsayilanMesajMetni: "Merhaba {{musteri_adi}}, {{tarih}} günü saat {{saat}} randevunuz iptal edildi. Yeni randevu için bize ulaşabilirsiniz. — {{isletme_adi}}",
    bagli: true,
  },
  {
    kod: "ders_ertelendi",
    bolum: "randevu",
    ad: "Randevu ertelenince yeni zaman bilgisi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["musteri_adi", "antrenor_adi", "tarih", "saat", "isletme_adi"],
    varsayilanMesajMetni: "Merhaba {{musteri_adi}}, randevunuz {{tarih}} günü saat {{saat}}'e ertelendi ({{antrenor_adi}}). — {{isletme_adi}}",
    bagli: true,
  },
  // ---- Personel ----
  {
    kod: "ders_atandi_antrenore",
    bolum: "personel",
    ad: "Antrenöre yeni ders atanınca bilgilendirme",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["antrenor_adi", "musteri_adi", "tarih", "saat", "alan_adi"],
    varsayilanMesajMetni: "{{antrenor_adi}}, {{tarih}} günü saat {{saat}} için {{musteri_adi}} ile dersiniz planlandı ({{alan_adi}}).",
    bagli: true,
  },
  {
    kod: "izin_talebi_yoneticiye",
    bolum: "personel",
    ad: "İzin talebi oluşunca yöneticiye bildirim",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["personel_adi", "izin_turu", "baslangic", "bitis"],
    varsayilanMesajMetni: "{{personel_adi}}, {{baslangic}} - {{bitis}} tarihleri için {{izin_turu}} talep etti. Onay için panele bakın.",
    bagli: true,
  },
  {
    kod: "izin_sonucu_personele",
    bolum: "personel",
    ad: "İzin talebi sonuçlanınca personele bildirim",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["personel_adi", "sonuc", "baslangic", "bitis"],
    varsayilanMesajMetni: "{{personel_adi}}, {{baslangic}} - {{bitis}} tarihli izin talebiniz {{sonuc}}.",
    bagli: true,
  },
  // ---- Muhasebe ----
  {
    kod: "odeme_makbuzu",
    bolum: "muhasebe",
    ad: "Ödeme alınınca bilgilendirme",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["musteri_adi", "tutar", "odeme_yontemi", "isletme_adi"],
    varsayilanMesajMetni: "Merhaba {{musteri_adi}}, {{tutar}} tutarındaki ödemeniz ({{odeme_yontemi}}) alındı. Teşekkür ederiz. — {{isletme_adi}}",
    bagli: true,
  },
  {
    kod: "borc_hatirlatma",
    bolum: "muhasebe",
    ad: "Açık bakiye hatırlatması",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Açık borcu olan müşteriler için periyodik tarama",
    gecerliDegiskenler: ["musteri_adi", "borc_tutari", "isletme_adi"],
    varsayilanMesajMetni: "Merhaba {{musteri_adi}}, {{borc_tutari}} tutarında açık bakiyeniz bulunmaktadır. — {{isletme_adi}}",
    bagli: false,
    baglanmaNotu: "Henüz bir taramaya bağlı değil: hatırlatma sıklığı (haftalık/aylık) ve ton için ürün kararı bekleniyor.",
  },
];

export function tetikleyiciGetir(kod: string): TetikleyiciTanimi | undefined {
  return TETIKLEYICILER.find((t) => t.kod === kod);
}

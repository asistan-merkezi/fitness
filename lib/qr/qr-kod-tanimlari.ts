export type QrKodTipi = "musteri_on_kayit" | "anket" | "puantaj_giris" | "puantaj_cikis" | "is_basvurusu";

export type QrKodTanimi = {
  tip: QrKodTipi;
  baslik: string;
  aciklama: string;
  /** İşletme kısa kodundan herkese açık yol. */
  yol: (kisaKod: string) => string;
  dosyaAdi: string;
  goruntuleHref?: string;
  goruntuleEtiket?: string;
  /** false: katalogda var ama ilgili modül (puantaj) henüz yok; kart görünür, QR üretilmez. */
  hazir: boolean;
  hazirDegilNotu?: string;
};

/**
 * QR Kodları listesindeki STATİK (kapı/afiş) kodlar. Derse özel dinamik kodlar (ör. ders sonrası anket) buraya dahil değildir.
 * Yollar kısa koda bağlıdır (UUID değil): daha kısa veri, daha seyrek desen, küçük baskıda daha kolay okunur.
 */
export const QR_KOD_TANIMLARI: QrKodTanimi[] = [
  {
    tip: "musteri_on_kayit",
    baslik: "Müşteri Ön Kayıt",
    aciklama:
      "Müşteri kendi adı, telefonu ve doğum tarihiyle ön kayıt bırakır. Kayıtlar doğrudan müşteri olmaz: Müşteriler > Ön Kayıtlar listesinde resepsiyon onayını bekler. Yalnız 18 yaş ve üzeri başvurabilir.",
    yol: (kisaKod) => `/kayit/musteri/${kisaKod}`,
    dosyaAdi: "musteri-on-kayit-qr",
    goruntuleHref: "/panel/musteriler/on-kayitlar",
    goruntuleEtiket: "Ön kayıtları görüntüle",
    hazir: true,
  },
  {
    tip: "anket",
    baslik: "Anket ve Öneriler",
    aciklama: "Üye memnuniyet puanı ve öneri bırakır; ad ve telefon isteğe bağlıdır (anonim yanıt mümkündür).",
    yol: (kisaKod) => `/anket/${kisaKod}`,
    dosyaAdi: "anket-oneri-qr",
    goruntuleHref: "/panel/ayarlar/qr-kodlari/anket-yanitlari",
    goruntuleEtiket: "Anket yanıtlarını görüntüle",
    hazir: true,
  },
  {
    tip: "is_basvurusu",
    baslik: "İş Başvuru Formu",
    aciklama: "İş arayan kişi ad, telefon, deneyim ve sertifika bilgisini bırakır. Başvurular doğrudan personel olmaz: Personel > Başvurular listesinde yönetici incelemesini bekler. Yalnız 18 yaş ve üzeri başvurabilir.",
    yol: (kisaKod) => `/basvuru/${kisaKod}`,
    dosyaAdi: "is-basvuru-qr",
    goruntuleHref: "/panel/finans/personel/basvurular",
    goruntuleEtiket: "Başvuruları görüntüle",
    hazir: true,
  },
  {
    tip: "puantaj_giris",
    baslik: "Personel Puantaj — Giriş",
    aciklama: "Personel kapıdaki kodu kendi telefonuyla okutur, kendi sistem şifresiyle oturum açarak mesaiye giriş yapar.",
    yol: (kisaKod) => `/puantaj/${kisaKod}/giris`,
    dosyaAdi: "personel-puantaj-giris-qr",
    hazir: false,
    hazirDegilNotu: "Puantaj modülüyle birlikte açılacak.",
  },
  {
    tip: "puantaj_cikis",
    baslik: "Personel Puantaj — Çıkış",
    aciklama: "Personel kapıdaki kodu kendi telefonuyla okutur, kendi sistem şifresiyle oturum açarak mesaiden çıkış yapar.",
    yol: (kisaKod) => `/puantaj/${kisaKod}/cikis`,
    dosyaAdi: "personel-puantaj-cikis-qr",
    hazir: false,
    hazirDegilNotu: "Puantaj modülüyle birlikte açılacak.",
  },
];

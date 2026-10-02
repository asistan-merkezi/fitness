import type { MenuIkonu } from "@/components/panel/menu-ikonlari";
import type { KullaniciRolu } from "@/lib/auth/gecerli-kullanici";
import { FINANS_ROLLERI, FINANS_YONETIM_ROLLERI, MUSTERI_ROLLERI, PAKET_GORUNTULEME_ROLLERI, YONETICI_ROLLERI } from "@/lib/panel/roller";

/**
 * Menü yapısı (klinikteki düzenle aynı): üstte tekil linkler, altta ana başlıklar (Finans, Yönetim, Ayarlar, Destek).
 * Her ana başlık, alt sayfaları kart ızgarası olarak gösteren bir "hub" sayfasına (/panel/<anahtar>) gider.
 * Alt sayfa adları ve sırası klinikle aynıdır; fitness'a özgü olanlar ayrıca belirtilmiştir.
 * `yakinda: true` olanlar planlanmış ama henüz yazılmamış modüllerdir: kartı görünür, tıklanmaz.
 * Bu yalnız görünürlüktür; asıl yetki kontrolü sayfada ve RLS/RPC'dedir.
 */
export type MenuOgesi = { href: string; etiket: string; ikon: MenuIkonu; roller: readonly KullaniciRolu[]; yakinda?: boolean };
export type MenuGrubu = { anahtar: string; etiket: string; ikon: MenuIkonu; ogeler: readonly MenuOgesi[] };

const HERKES = ["isletme_admin", "resepsiyon", "muhasebe", "antrenor"] as const satisfies readonly KullaniciRolu[];

export const ANA_OGELER: readonly MenuOgesi[] = [
  { href: "/panel", etiket: "Ana Ekran", ikon: "panel", roller: HERKES },
  { href: "/panel/musteriler", etiket: "Müşteriler", ikon: "musteriler", roller: MUSTERI_ROLLERI },
  { href: "/panel/dersler", etiket: "Randevular", ikon: "ders", roller: [...MUSTERI_ROLLERI, "antrenor"] },
  // Fitness'a özgü: personelin kendi kayıtları.
  { href: "/panel/hakedisim", etiket: "Hakedişim", ikon: "hakedis", roller: ["resepsiyon", "antrenor", "muhasebe"] },
];

export const MENU_GRUPLARI: readonly MenuGrubu[] = [
  {
    anahtar: "finans",
    etiket: "Finans",
    ikon: "finans",
    ogeler: [
      { href: "/panel/finans/personel", etiket: "Personel", ikon: "personel", roller: FINANS_YONETIM_ROLLERI },
      { href: "/panel/finans/giderler", etiket: "Giderler", ikon: "gider", roller: FINANS_YONETIM_ROLLERI },
      { href: "/panel/finans/gelirler-takibi", etiket: "Gelirler Takibi ve Faturalandırma", ikon: "gelir", roller: FINANS_ROLLERI },
      { href: "/panel/finans/banka", etiket: "Banka", ikon: "banka", roller: FINANS_YONETIM_ROLLERI },
      { href: "/panel/kasa", etiket: "Kasa", ikon: "kasa", roller: FINANS_ROLLERI },
      { href: "/panel/finans/kredi-karti", etiket: "Kredi Kartı", ikon: "kredi-karti", roller: FINANS_YONETIM_ROLLERI },
      { href: "/panel/finans/raporlar", etiket: "Raporlar", ikon: "rapor", roller: FINANS_YONETIM_ROLLERI },
      { href: "/panel/finans/kategori-iskonto-oranlari", etiket: "Kategori / İskonto Oranları", ikon: "iskonto", roller: FINANS_YONETIM_ROLLERI },
    ],
  },
  {
    anahtar: "yonetim",
    etiket: "Yönetim",
    ikon: "yonetim",
    ogeler: [
      { href: "/panel/uyelik-paketleri", etiket: "Paketler", ikon: "paket", roller: PAKET_GORUNTULEME_ROLLERI },
      { href: "/panel/yonetim/donanim", etiket: "Donanım", ikon: "ekipman", roller: YONETICI_ROLLERI },
      { href: "/panel/yonetim/hizmet-tanimlari", etiket: "Hizmet Tanımları", ikon: "hizmet", roller: YONETICI_ROLLERI, yakinda: true },
      { href: "/panel/yonetim/antrenman-programlari", etiket: "Antrenman Programları", ikon: "program", roller: YONETICI_ROLLERI, yakinda: true },
      { href: "/panel/yonetim/denetim-gecmisi", etiket: "Denetim Geçmişi", ikon: "denetim", roller: YONETICI_ROLLERI },
      // Fitness'a özgü: klinikte izinler Personel sekmesi altındadır.
      { href: "/panel/yonetim/izinler", etiket: "İzin Talepleri", ikon: "izin", roller: YONETICI_ROLLERI },
    ],
  },
  {
    anahtar: "ayarlar",
    etiket: "Ayarlar",
    ikon: "ayarlar",
    ogeler: [
      { href: "/panel/ayarlar/sirket-bilgileri", etiket: "Şirket Bilgileri", ikon: "isletme", roller: FINANS_YONETIM_ROLLERI },
      { href: "/panel/ayarlar/personel", etiket: "Personel Tanımlama", ikon: "personel", roller: YONETICI_ROLLERI },
      { href: "/panel/ayarlar/muhasebe-sync", etiket: "Muhasebe Sync", ikon: "senkron", roller: FINANS_YONETIM_ROLLERI },
      { href: "/panel/ayarlar/mesajlasma", etiket: "SMS/Whatsapp/Mail Ayarları", ikon: "mesaj", roller: YONETICI_ROLLERI },
      { href: "/panel/ayarlar/kapi-tablet", etiket: "Kapı Tablet Ayarları", ikon: "tablet", roller: YONETICI_ROLLERI, yakinda: true },
      { href: "/panel/ayarlar/yetkilendirme", etiket: "Yetkilendirme", ikon: "yetki", roller: YONETICI_ROLLERI, yakinda: true },
      { href: "/panel/ayarlar/arsiv", etiket: "Arşiv Yükleme ve Yedekleme", ikon: "arsiv", roller: YONETICI_ROLLERI, yakinda: true },
      { href: "/panel/ayarlar/qr-kodlari", etiket: "QR Kodları", ikon: "qr", roller: YONETICI_ROLLERI },
    ],
  },
  {
    anahtar: "destek",
    etiket: "Destek",
    ikon: "destek",
    ogeler: [
      { href: "/panel/destek/kullanim-kilavuzu", etiket: "Kullanım Kılavuzu", ikon: "kilavuz", roller: HERKES, yakinda: true },
      { href: "/panel/destek/chatbot", etiket: "Destek Chatbotu", ikon: "sohbet", roller: HERKES, yakinda: true },
      { href: "/panel/destek/talep-sikayetler", etiket: "Talep ve Şikayetler", ikon: "talep", roller: HERKES, yakinda: true },
    ],
  },
];

const gorebilir = (o: MenuOgesi, rol: KullaniciRolu) => rol === "super_admin" || o.roller.includes(rol);

export function anaOgelerIcinRol(rol: KullaniciRolu | null | undefined): MenuOgesi[] {
  return rol ? ANA_OGELER.filter((o) => gorebilir(o, rol)) : [];
}

/** Role görünen alt öğeleriyle ana başlıklar; hiç öğesi görünmeyen başlık listeden düşer. */
export function gruplarIcinRol(rol: KullaniciRolu | null | undefined): MenuGrubu[] {
  if (!rol) return [];
  return MENU_GRUPLARI.map((g) => ({ ...g, ogeler: g.ogeler.filter((o) => gorebilir(o, rol)) })).filter((g) => g.ogeler.length > 0);
}

import type { StatusTone } from "@/lib/ui/durum-tonlari";
import type { DersDurumu, OdemeYontemi, UyelikDurumu } from "@/types/veritabani";

export const UYELIK_DURUMU: Record<UyelikDurumu, { etiket: string; ton: StatusTone }> = {
  aktif: { etiket: "Aktif", ton: "emerald" },
  dondurulmus: { etiket: "Dondurulmuş", ton: "sky" },
  sona_erdi: { etiket: "Sona Erdi", ton: "slate" },
  beklemede: { etiket: "Başlamadı", ton: "amber" },
  iptal: { etiket: "İptal", ton: "rose" },
};

export const RED_NEDENLERI: Record<string, string> = {
  uyelik_yok: "Geçerli üyeliği yok",
  donduruldu: "Üyeliği dondurulmuş",
  baslamadi: "Üyeliği henüz başlamadı",
  hak_bitti: "Seans hakkı bitti",
  suresi_doldu: "Üyelik süresi doldu",
  musteri_pasif: "Müşteri pasif durumda",
};

export const YONTEM_ETIKETLERI: Record<OdemeYontemi, string> = {
  nakit: "Nakit",
  kredi_karti: "Kredi Kartı",
  havale: "Havale / EFT",
};

export const HAREKET_TURLERI = {
  borc: { etiket: "Borç", ton: "amber" as StatusTone },
  odeme: { etiket: "Ödeme", ton: "emerald" as StatusTone },
  iade: { etiket: "İade", ton: "rose" as StatusTone },
};

export const KATEGORI_ETIKETLERI = { standart: "Standart", gold: "Gold", vip: "VIP", platinum: "Platinum" } as const;

export const SAGLIK_ETIKETLERI: Record<string, string> = {
  kronik_rahatsizlik: "Kronik rahatsızlık",
  kalp_damar: "Kalp-damar",
  tansiyon: "Tansiyon",
  sakatlik: "Sakatlık",
  ortopedik: "Ortopedik sorun",
  hamilelik: "Hamilelik",
  diyabet: "Diyabet",
  astim: "Astım",
  diger: "Diğer",
};

export const GIRIS_KAYNAKLARI: Record<string, string> = { resepsiyon: "Resepsiyon", qr: "QR", turnike: "Turnike" };

export const DERS_DURUMU: Record<DersDurumu, { etiket: string; ton: StatusTone }> = {
  planlandi: { etiket: "Planlandı", ton: "sky" },
  geldi: { etiket: "Geldi", ton: "emerald" },
  gecikmeli_geldi: { etiket: "Gecikmeli Geldi", ton: "amber" },
  derste: { etiket: "Derste", ton: "teal" },
  tamamlandi: { etiket: "Tamamlandı", ton: "primary" },
  ertelendi: { etiket: "Ertelendi", ton: "indigo" },
  gelmedi: { etiket: "Gelmedi", ton: "slate" },
  iptal: { etiket: "İptal", ton: "rose" },
};

export const PAKET_KAPSAMI: Record<"giris" | "ders", string> = { giris: "Salon girişi", ders: "PT dersi" };

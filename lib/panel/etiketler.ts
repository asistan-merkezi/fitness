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

export const PERSONEL_HAREKET_TURLERI = {
  hakedis: { etiket: "Hakediş", ton: "sky" as StatusTone },
  prim: { etiket: "Ders primi", ton: "primary" as StatusTone },
  odeme: { etiket: "Ödeme", ton: "emerald" as StatusTone },
  avans: { etiket: "Avans", ton: "amber" as StatusTone },
  prim_manuel: { etiket: "Prim", ton: "primary" as StatusTone },
  yol: { etiket: "Yol", ton: "sky" as StatusTone },
  yemek: { etiket: "Yemek", ton: "sky" as StatusTone },
  mesai: { etiket: "Fazla mesai", ton: "sky" as StatusTone },
  kesinti: { etiket: "Kesinti", ton: "rose" as StatusTone },
};

export const CINSIYETLER = { kadin: "Kadın", erkek: "Erkek", belirtilmemis: "Belirtilmemiş" } as const;
export const CALISMA_TIPLERI = { tam_zamanli: "Tam Zamanlı", yari_zamanli: "Yarı Zamanlı", vardiyali: "Vardiyalı", prim_usulu: "Prim Usulü" } as const;

export const IZIN_TIPLERI = { yillik: "Yıllık izin", mazeret: "Mazeret izni", rapor: "Rapor" } as const;

export const IZIN_DURUMU = {
  beklemede: { etiket: "Beklemede", ton: "amber" as StatusTone },
  onaylandi: { etiket: "Onaylandı", ton: "emerald" as StatusTone },
  reddedildi: { etiket: "Reddedildi", ton: "rose" as StatusTone },
  iptal: { etiket: "İptal", ton: "slate" as StatusTone },
};

/** Müşteri risk bayrağı tipleri (Risk Bandı) ve seviyeleri. */
export const RISK_TIPI_ETIKETLERI: Record<string, string> = {
  kalp_tansiyon: "Kalp / Tansiyon",
  diyabet: "Diyabet",
  astim: "Astım",
  alerji: "Alerji",
  hamilelik: "Hamilelik",
  epilepsi: "Epilepsi",
  kalp_pili: "Kalp Pili",
  metal_implant: "Metal İmplant",
  sakatlik: "Sakatlık",
  diger: "Diğer",
};
export const RISK_SEVIYE_ETIKETLERI = { yuksek: "Yüksek", orta: "Orta", dusuk: "Düşük" } as const;

/** Personel belge türleri. */
export const PERSONEL_BELGE_TURU: Record<string, string> = { sertifika: "Antrenör / eğitmen sertifikası", ilk_yardim: "İlk yardım", saglik_raporu: "Sağlık raporu", sozlesme: "Sözleşme", diger: "Diğer" };

/** Puantaj durumları: cetvel kodu, etiket, ton. İzin/tatil satır yazılmadan türetilir (kaynak: onaylı izin, resmi tatil, Pazar). */
export const PUANTAJ_DURUMU: Record<string, { kod: string; etiket: string; ton: StatusTone }> = {
  geldi: { kod: "G", etiket: "Geldi", ton: "emerald" },
  yarim_gun: { kod: "½", etiket: "Yarım gün", ton: "primary" },
  gelmedi: { kod: "Y", etiket: "Gelmedi", ton: "rose" },
  raporlu: { kod: "R", etiket: "Raporlu", ton: "amber" },
  izinli: { kod: "İ", etiket: "İzinli", ton: "sky" },
  tatil: { kod: "T", etiket: "Tatil", ton: "slate" },
};

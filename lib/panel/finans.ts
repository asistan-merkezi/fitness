import { ibanBicimle } from "@/lib/iban";

/** Finans ekranlarının ortak etiketleri ve saf yardımcıları. */

/** Genel Giderler'in kategorileri ('gider' türü). */
export const GENEL_GIDER_KATEGORILERI: Record<string, string> = {
  kira: "Kira",
  elektrik: "Elektrik",
  su: "Su",
  dogalgaz: "Doğalgaz",
  internet_telefon: "İnternet / Telefon",
  bakim_onarim: "Bakım / Onarım",
  temizlik: "Temizlik",
  malzeme: "Malzeme",
  ekipman: "Ekipman",
  reklam: "Reklam / Tanıtım",
  sigorta: "Sigorta",
  yazilim: "Yazılım / Abonelik",
  diger: "Diğer",
};

/** Kamusal Giderler'in ödeme tipleri ('kamusal' türü; klinikteki kamu ödemesi tipleriyle aynı). `vergi_sgk` eski kayıtlar için durur. */
export const KAMU_ODEME_TIPLERI: Record<string, string> = {
  kdv: "KDV",
  stopaj: "Stopaj (Muhtasar)",
  sgk_primleri: "SGK Primleri",
  damga_vergisi: "Damga Vergisi",
  emlak_vergisi: "Emlak Vergisi",
  arac_vergisi: "Motorlu Taşıtlar Vergisi",
  bagkur_primleri: "Bağkur Primleri",
  muhasebe_ucreti: "Muhasebe Ücreti",
  trafik_cezasi: "Trafik Cezası",
  gec_odeme_faizi: "Geç Ödeme Faizi",
  gecici_vergi: "Geçici Vergi",
  kurumlar_vergisi: "Kurumlar Vergisi",
  vergi_sgk: "Vergi / SGK (eski)",
};

/** Tüm kategori etiketleri (liste/rapor gösterimi için). */
export const GIDER_KATEGORI_ETIKETLERI: Record<string, string> = { ...GENEL_GIDER_KATEGORILERI, ...KAMU_ODEME_TIPLERI };

/** Bu kategorilerde ilişkili araç seçilebilir (Şirket Bilgileri > Araçlar). */
export const ARAC_GEREKTIREN_KATEGORILER = ["bakim_onarim", "arac_vergisi", "trafik_cezasi"] as const;

export const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"] as const;

export const GIDER_YONTEMLERI: Record<string, string> = { nakit: "Nakit", havale: "Havale / EFT", kredi_karti: "Kredi Kartı" };

export const HESAP_KAYNAK_ETIKETLERI: Record<string, string> = {
  musteri: "Müşteri",
  gider: "Gider",
  personel: "Personel ödemesi",
  manuel: "Manuel hareket",
  kasa_baslangic: "Kasa başlangıç",
  kasa_dengeleme: "Kasa dengeleme",
};

export const KATEGORI_ETIKETLERI_FINANS: Record<string, string> = { standart: "Standart", gold: "Gold", vip: "VIP", platinum: "Platinum" };

export type HesapHareketi = {
  tarih: string;
  hesap: "kasa" | "banka" | "kart";
  banka_hesap_id: string | null;
  yontem: string | null;
  tutar_kurus: number;
  kaynak: "musteri" | "gider" | "personel" | "manuel" | "kasa_baslangic" | "kasa_dengeleme";
  kaynak_id: string;
  aciklama: string | null;
};

/** `hesap_hareket_detay` görünümünün listede gösterilen ek alanları (tür, karşı taraf, ayrıntı). */
export type HesapHareketDetayi = HesapHareketi & {
  tur: string;
  karsi_taraf: string | null;
  detay: string | null;
  kategori: string | null;
  karsi_iban: string | null;
  islem_zamani: string | null;
};

/** Hareket türü etiketleri (liste "Tür" sütunu). Transfer yönü tutar işaretinden gelir. */
export const HAREKET_TUR_ETIKETLERI: Record<string, string> = {
  tahsilat: "Tahsilat",
  iade: "İade",
  gider: "Gider",
  personel_odeme: "Personel Ödemesi",
  personel_avans: "Personel Avansı",
  giren: "Giriş",
  cikan: "Çıkış",
  transfer_gelen: "Hesaplar Arası (Gelen)",
  transfer_giden: "Hesaplar Arası (Giden)",
  kasa_baslangic: "Kasa Başlangıç",
  kasa_dengeleme: "Kasa Dengeleme",
};

/** Hareketin kısa başlığı: müşteri kaynağında işaret tahsilat/iade ayrımını verir. */
export function hareketBasligi(h: Pick<HesapHareketi, "kaynak" | "tutar_kurus">): string {
  if (h.kaynak === "musteri") return h.tutar_kurus >= 0 ? "Müşteri tahsilatı" : "Müşteri iadesi";
  if (h.kaynak === "manuel") return h.tutar_kurus >= 0 ? "Manuel giriş" : "Manuel çıkış";
  return HESAP_KAYNAK_ETIKETLERI[h.kaynak] ?? h.kaynak;
}

/** Hareketleri tarihe göre yeniden eskiye sıralar (aynı tarihte kaynak sırası korunur). */
export function hareketleriSirala<T extends { tarih: string }>(satirlar: T[]): T[] {
  return [...satirlar].sort((a, b) => (a.tarih < b.tarih ? 1 : a.tarih > b.tarih ? -1 : 0));
}

/** Toplam giren / çıkan (çıkan pozitif döner). */
export function girenCikan(satirlar: { tutar_kurus: number }[]): { giren: number; cikan: number } {
  let giren = 0;
  let cikan = 0;
  for (const s of satirlar) {
    if (s.tutar_kurus >= 0) giren += s.tutar_kurus;
    else cikan += -s.tutar_kurus;
  }
  return { giren, cikan };
}

/** Kategorilere göre toplam (büyükten küçüğe) ve toplam içindeki yüzde. */
export function kategoriDagilimi(satirlar: { kategori: string; tutar_kurus: number }[]): { kategori: string; tutar_kurus: number; yuzde: number }[] {
  const toplam = satirlar.reduce((t, s) => t + s.tutar_kurus, 0);
  const harita = new Map<string, number>();
  for (const s of satirlar) harita.set(s.kategori, (harita.get(s.kategori) ?? 0) + s.tutar_kurus);
  return [...harita.entries()]
    .map(([kategori, tutar_kurus]) => ({ kategori, tutar_kurus, yuzde: toplam > 0 ? Math.round((tutar_kurus / toplam) * 1000) / 10 : 0 }))
    .sort((a, b) => b.tutar_kurus - a.tutar_kurus);
}

/** Vadesi geçmiş mi? (tarihler "YYYY-MM-DD", bugün dahil geçmiş sayılmaz) */
export function vadesiGecti(vade: string | null, bugun: string): boolean {
  return vade !== null && vade < bugun;
}

/** Hesap defterinde gösterilen satır (sunucuda hazırlanır, istemci bileşenine düz veri olarak geçer). */
export type DefterSatiri = { tarih: string; tutar_kurus: number; tur: string; karsiTaraf: string | null; aciklama: string | null; yontem: string | null };

/** İstanbul saatiyle "GG.AA.YYYY SS:DD" (kasa başlangıç/dengeleme giriş zamanı). */
export function istanbulZamanYazisi(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(",", "");
}

/**
 * Hesap hareketlerini defter satırına çevirir: Tür · Karşı Taraf · Açıklama. Gider: karşı taraf tedarikçi, açıklama
 * "Kategori — not"; kasa başlangıç/dengeleme: karşı taraf giren kişi, açıklama giriş zamanı + not.
 */
export function defterSatirlari(satirlar: HesapHareketDetayi[]): DefterSatiri[] {
  return satirlar.map((s) => {
    const kategori = s.kategori ? (GIDER_KATEGORI_ETIKETLERI[s.kategori] ?? s.kategori) : null;
    const zaman = s.islem_zamani ? istanbulZamanYazisi(s.islem_zamani) : null;
    const parcalar = s.kaynak === "gider" ? [kategori, s.detay] : s.kaynak === "kasa_baslangic" || s.kaynak === "kasa_dengeleme" ? [zaman, s.detay] : [s.detay, s.karsi_iban ? `IBAN ${ibanBicimle(s.karsi_iban)}` : null];
    return {
      tarih: s.tarih,
      tutar_kurus: s.tutar_kurus,
      tur: HAREKET_TUR_ETIKETLERI[s.tur] ?? s.tur,
      karsiTaraf: s.karsi_taraf ?? (s.kaynak === "gider" ? kategori : null),
      aciklama: parcalar.filter(Boolean).join(" — ") || null,
      yontem: s.yontem ? (GIDER_YONTEMLERI[s.yontem] ?? s.yontem) : null,
    };
  });
}

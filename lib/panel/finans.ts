/** Finans ekranlarının ortak etiketleri ve saf yardımcıları. */

export const GIDER_KATEGORI_ETIKETLERI: Record<string, string> = {
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
  vergi_sgk: "Vergi / SGK",
  yazilim: "Yazılım / Abonelik",
  diger: "Diğer",
};

export const GIDER_YONTEMLERI: Record<string, string> = { nakit: "Nakit", havale: "Havale / EFT", kredi_karti: "Kredi Kartı" };

export const HESAP_KAYNAK_ETIKETLERI: Record<string, string> = {
  musteri: "Müşteri",
  gider: "Gider",
  personel: "Personel ödemesi",
  manuel: "Manuel hareket",
};

export const KATEGORI_ETIKETLERI_FINANS: Record<string, string> = { standart: "Standart", gold: "Gold", vip: "VIP", platinum: "Platinum" };

export type HesapHareketi = {
  tarih: string;
  hesap: "kasa" | "banka";
  banka_hesap_id: string | null;
  yontem: string | null;
  tutar_kurus: number;
  kaynak: "musteri" | "gider" | "personel" | "manuel";
  kaynak_id: string;
  aciklama: string | null;
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

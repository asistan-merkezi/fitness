import { gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import type { PaketSatiri } from "@/types/veritabani";

/** Satış süresi dolmuş mu? (`satis_bitis_tarihi` dahil değil: bitiş günü sonrası satış kapanır; tarihler "YYYY-MM-DD".) */
export const satisSuresiDoldu = (p: Pick<PaketSatiri, "satis_bitis_tarihi">, bugun: string) => p.satis_bitis_tarihi !== null && p.satis_bitis_tarihi < bugun;

/** Arşiv = kapalı (pasif) ya da satış süresi dolmuş paket (klinikteki "Arşiv Paketler" ayrımı). */
export const paketArsivdeMi = (p: Pick<PaketSatiri, "aktif" | "satis_bitis_tarihi">, bugun: string) => !p.aktif || satisSuresiDoldu(p, bugun);

/** Şu an satılabilir mi? */
export const paketSatilabilir = (p: Pick<PaketSatiri, "aktif" | "satis_bitis_tarihi">, bugun: string) => !paketArsivdeMi(p, bugun);

/** Satır özeti: süre/seans, fiyat, KDV, satış bitişi, dondurma koşulu. */
export function paketOzeti(p: PaketSatiri): string {
  const kapsam = p.tur === "sure" ? `${p.sure_gun} gün` : `${p.seans_sayisi} seans${p.gecerlilik_gun ? ` · ${p.gecerlilik_gun} gün geçerli` : " · süresiz"}`;
  const parcalar = [kapsam, `${kurusTLyazi(p.fiyat_kurus)} (KDV %${p.kdv_orani})`];
  if (p.satis_bitis_tarihi) parcalar.push(`satış bitişi ${gunYazi(p.satis_bitis_tarihi)}`);
  if (p.dondurma_izni) parcalar.push(`en fazla ${p.azami_dondurma_gun} gün dondurma${p.dondurma_ucret_kurus > 0 ? `, ücret ${kurusTLyazi(p.dondurma_ucret_kurus)}` : ""}`);
  return parcalar.join(" · ");
}

import { formatTime } from "@/lib/datetime";

/** Çizelgede bir saatin piksel yüksekliği. */
export const SAAT_PX = 64;
/** Kısa dersin okunur kalması için en küçük blok yüksekliği. */
const EN_AZ_BLOK_PX = 28;

/** "HH:mm" -> günün dakikası. */
export function dakikaya(saat: string): number {
  const [s, d] = saat.split(":").map(Number);
  return s * 60 + d;
}

/** UTC ISO -> İstanbul yerel saatine göre günün dakikası. */
export function istanbulDakikasi(utcIso: string): number {
  return dakikaya(formatTime(utcIso));
}

/**
 * Çizelgenin saat aralığı: varsayılan 08:00-22:00; bu aralığın dışına taşan ders varsa aralık onu kapsayacak şekilde genişler.
 * Gece yarısını aşan ders 24:00'te kesilir.
 */
export function cizelgeSaatAraligi(bloklar: { baslangic: string; bitis: string }[], varsayilan = { bas: 8, bit: 22 }): { bas: number; bit: number } {
  let bas = varsayilan.bas;
  let bit = varsayilan.bit;
  for (const b of bloklar) {
    const baslangic = istanbulDakikasi(b.baslangic);
    const sure = Math.round((new Date(b.bitis).getTime() - new Date(b.baslangic).getTime()) / 60000);
    bas = Math.min(bas, Math.floor(baslangic / 60));
    bit = Math.max(bit, Math.ceil(Math.min(baslangic + sure, 24 * 60) / 60));
  }
  return { bas: Math.max(0, bas), bit: Math.min(24, bit) };
}

/** Bloğun çizelge içindeki üst konumu ve yüksekliği (px). */
export function blokKonumu(baslangic: string, bitis: string, cizelgeBasSaat: number): { top: number; height: number } {
  const baslangicDk = istanbulDakikasi(baslangic);
  const sure = Math.max(1, Math.round((new Date(bitis).getTime() - new Date(baslangic).getTime()) / 60000));
  return {
    top: ((baslangicDk - cizelgeBasSaat * 60) / 60) * SAAT_PX,
    height: Math.max((sure / 60) * SAAT_PX, EN_AZ_BLOK_PX),
  };
}

/** "Şu an" çizgisinin konumu; şu an çizelge aralığının dışındaysa null. */
export function suAnKonumu(suAnIso: string, aralik: { bas: number; bit: number }): number | null {
  const dk = istanbulDakikasi(suAnIso);
  if (dk < aralik.bas * 60 || dk > aralik.bit * 60) return null;
  return ((dk - aralik.bas * 60) / 60) * SAAT_PX;
}

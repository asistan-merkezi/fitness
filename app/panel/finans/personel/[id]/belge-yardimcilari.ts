import { gunEkle } from "@/lib/donem";

export const BELGE_UYARI_GUN = 60;

export function belgeDurumu(bitis: string | null, bugun: string): "suresiz" | "gecerli" | "yaklasiyor" | "doldu" {
  if (!bitis) return "suresiz";
  if (bitis < bugun) return "doldu";
  if (bitis <= gunEkle(bugun, BELGE_UYARI_GUN)) return "yaklasiyor";
  return "gecerli";
}

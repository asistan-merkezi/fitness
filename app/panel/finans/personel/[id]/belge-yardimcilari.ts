export const BELGE_UYARI_GUN = 60;

/** Salt takvim aritmetiği (şimdiki zaman okumaz): "YYYY-MM-DD" + gün. */
function gunEkle(tarih: string, gun: number): string {
  const d = new Date(`${tarih}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + gun);
  return d.toISOString().slice(0, 10);
}

export function belgeDurumu(bitis: string | null, bugun: string): "suresiz" | "gecerli" | "yaklasiyor" | "doldu" {
  if (!bitis) return "suresiz";
  if (bitis < bugun) return "doldu";
  if (bitis <= gunEkle(bugun, BELGE_UYARI_GUN)) return "yaklasiyor";
  return "gecerli";
}

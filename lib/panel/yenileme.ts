/**
 * Üyelik yenileme takibi (saf hesap). Bir ayda biten üyelikler için müşterinin yenileyip yenilemediği:
 *  - yeniledi : müşteri bu üyelikten SONRA, bitişi daha ileri (ya da bitişsiz) bir üyelik almış (paket farklı olabilir).
 *  - bekliyor : yenileme yok ama bitiş günü henüz gelmedi (hatırlatma fırsatı).
 *  - yenilemedi: yenileme yok ve bitiş günü geçti (geri kazanma listesi).
 * Aynı müşterinin aynı ayda birden çok üyeliği bitiyorsa bitişi en geç olanı esas alınır (müşteri bir kez sayılır).
 * İptal edilen üyelikler çağıran tarafta elenir. Bitişsiz seans paketleri (geçerlilik süresi yok) bitiş günü olmadığı için rapora girmez.
 */
export type BitenUyelik = { id: string; musteri_id: string; paket_adi: string; bitis_tarihi: string; created_at: string };
export type SonrakiUyelik = { id: string; musteri_id: string; paket_adi: string; bitis_tarihi: string | null; created_at: string };
export type YenilemeDurumu = "yeniledi" | "bekliyor" | "yenilemedi";
export type YenilemeSatiri = BitenUyelik & { durum: YenilemeDurumu; yeniPaket: string | null };

export function yenilemeSiniflandir(bitenler: BitenUyelik[], digerleri: SonrakiUyelik[], bugun: string): YenilemeSatiri[] {
  const musteriBasina = new Map<string, BitenUyelik>();
  for (const b of bitenler) {
    const onceki = musteriBasina.get(b.musteri_id);
    if (!onceki || b.bitis_tarihi > onceki.bitis_tarihi) musteriBasina.set(b.musteri_id, b);
  }

  return [...musteriBasina.values()]
    .map((b) => {
      const yenileme = digerleri
        .filter((d) => d.musteri_id === b.musteri_id && d.id !== b.id && d.created_at > b.created_at && (d.bitis_tarihi === null || d.bitis_tarihi > b.bitis_tarihi))
        .sort((x, y) => x.created_at.localeCompare(y.created_at))[0];
      const durum: YenilemeDurumu = yenileme ? "yeniledi" : b.bitis_tarihi >= bugun ? "bekliyor" : "yenilemedi";
      return { ...b, durum, yeniPaket: yenileme?.paket_adi ?? null };
    })
    .sort((x, y) => x.bitis_tarihi.localeCompare(y.bitis_tarihi) || x.musteri_id.localeCompare(y.musteri_id));
}

/** Yenileme oranı yalnız SONUÇLANANLAR içinde (bitiş günü gelmemiş "bekliyor"lar paydaya girmez); sonuçlanan yoksa null. */
export function yenilemeOrani(satirlar: YenilemeSatiri[]): number | null {
  const yeniledi = satirlar.filter((s) => s.durum === "yeniledi").length;
  const yenilemedi = satirlar.filter((s) => s.durum === "yenilemedi").length;
  return yeniledi + yenilemedi === 0 ? null : Math.round((yeniledi / (yeniledi + yenilemedi)) * 100);
}

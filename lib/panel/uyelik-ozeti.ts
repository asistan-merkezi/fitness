import { gunFarki } from "@/lib/donem";
import type { UyelikGorunumSatiri } from "@/types/veritabani";

type OzetGirdisi = Pick<UyelikGorunumSatiri, "id" | "tur" | "baslangic_tarihi" | "bitis_tarihi" | "kalan_hak" | "toplam_hak" | "gecerli_durum">;

/**
 * Bir müşterinin listede gösterilecek "birincil" üyeliği: önce AKTİF olanlar (bitişi en yakın önce, bitişsiz sona),
 * yoksa dondurulmuş, başlamamış, sona ermiş, iptal sırasıyla en yenisi. check_in fonksiyonundaki FIFO ile uyumludur.
 */
export function birincilUyelik<T extends OzetGirdisi>(uyelikler: readonly T[]): T | null {
  if (uyelikler.length === 0) return null;
  const oncelik: Record<string, number> = { aktif: 0, dondurulmus: 1, beklemede: 2, sona_erdi: 3, iptal: 4 };
  return [...uyelikler].sort((a, b) => {
    const fark = oncelik[a.gecerli_durum] - oncelik[b.gecerli_durum];
    if (fark !== 0) return fark;
    if (a.gecerli_durum === "aktif") {
      const ab = a.bitis_tarihi ?? "9999-12-31";
      const bb = b.bitis_tarihi ?? "9999-12-31";
      if (ab !== bb) return ab < bb ? -1 : 1;
    }
    return a.baslangic_tarihi < b.baslangic_tarihi ? 1 : -1; // daha yeni başlayan önce
  })[0];
}

/** Bitişe kalan gün (bitiş DAHİL: bitiş günü 0 kalır, ertesi -1). Süresiz üyelikte null. */
export function kalanGun(u: Pick<OzetGirdisi, "bitis_tarihi">, bugun: string): number | null {
  return u.bitis_tarihi ? gunFarki(bugun, u.bitis_tarihi) : null;
}

/** "Paket bitmek üzere" uyarısı (kalan hak ≤ 2 veya bitişe ≤ 7 gün); yoksa null. */
export function bitiyorUyarisi(u: OzetGirdisi, bugun: string): string | null {
  if (u.gecerli_durum !== "aktif") return null;
  if (u.kalan_hak !== null && u.kalan_hak <= 2) return `Paket bitmek üzere (Son ${u.kalan_hak} seans hakkı)`;
  const gun = kalanGun(u, bugun);
  if (gun !== null && gun <= 7) return gun === 0 ? "Paket bitmek üzere (Bugün son gün)" : `Paket bitmek üzere (${gun} gün kaldı)`;
  return null;
}

/** Süre doluluk yüzdesi (başlangıç → bitiş); ilerleme çubuğu için. */
export function gecenSureYuzdesi(u: Pick<OzetGirdisi, "baslangic_tarihi" | "bitis_tarihi">, bugun: string): number | null {
  if (!u.bitis_tarihi) return null;
  const toplam = gunFarki(u.baslangic_tarihi, u.bitis_tarihi) + 1;
  if (toplam <= 0) return 100;
  const gecen = Math.min(toplam, Math.max(0, gunFarki(u.baslangic_tarihi, bugun) + 1));
  return Math.round((gecen / toplam) * 100);
}

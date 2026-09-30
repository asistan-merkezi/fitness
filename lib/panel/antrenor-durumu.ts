import type { DersDurumu } from "@/types/veritabani";

export type AntrenorDurumu = "derste" | "sirada" | "izinli" | "musait";

export const ANTRENOR_DURUMU: Record<AntrenorDurumu, { etiket: string; ton: "teal" | "sky" | "amber" | "emerald" }> = {
  derste: { etiket: "Derste", ton: "teal" },
  sirada: { etiket: "Dersi Var", ton: "sky" },
  izinli: { etiket: "İzinli", ton: "amber" },
  musait: { etiket: "Müsait", ton: "emerald" },
};

type DersOzeti = { antrenor_id: string; baslangic: string; bitis: string; durum: DersDurumu };

/**
 * Antrenörün anlık durumu: izinliyse İzinli; şu an devam eden (derste/geldi/gecikmeli geldi) bir dersi varsa Derste;
 * şu an planlı bir ders saati içindeyse Dersi Var; aksi halde Müsait. İptal/gelmedi/tamamlanmış dersler sayılmaz.
 */
export function antrenorDurumu(antrenorId: string, dersler: DersOzeti[], izinliler: ReadonlySet<string>, suAnIso: string): AntrenorDurumu {
  if (izinliler.has(antrenorId)) return "izinli";
  const suAn = new Date(suAnIso).getTime();
  let sirada = false;
  for (const d of dersler) {
    if (d.antrenor_id !== antrenorId) continue;
    const icinde = new Date(d.baslangic).getTime() <= suAn && suAn < new Date(d.bitis).getTime();
    if (!icinde) continue;
    if (d.durum === "derste" || d.durum === "geldi" || d.durum === "gecikmeli_geldi") return "derste";
    if (d.durum === "planlandi" || d.durum === "ertelendi") sirada = true;
  }
  return sirada ? "sirada" : "musait";
}

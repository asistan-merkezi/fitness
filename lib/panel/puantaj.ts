import { gunEkle } from "@/lib/donem";

export type HucreTuru = "geldi" | "yarim_gun" | "gelmedi" | "raporlu" | "izinli" | "tatil" | "pazar" | "gelecek" | "bos";

/**
 * Puantaj cetvelinde bir günün (personel × tarih) gösterimi. Öncelik: yazılmış puantaj kaydı > onaylı izin > resmi tatil > Pazar >
 * gelecek gün > boş (henüz girilmemiş geçmiş iş günü). İzin/tatil/Pazar satır yazılmadan TÜRETİLİR; kayıt yalnız fiili devam içindir.
 */
export function hucreTuru(o: { tarih: string; bugun: string; kayitDurumu?: string | null; izinli: boolean; tatil: boolean }): HucreTuru {
  if (o.kayitDurumu === "geldi" || o.kayitDurumu === "yarim_gun" || o.kayitDurumu === "gelmedi" || o.kayitDurumu === "raporlu") return o.kayitDurumu;
  if (o.izinli) return "izinli";
  if (o.tatil) return "tatil";
  if (haftaninGunu(o.tarih) === 0) return "pazar";
  if (o.tarih > o.bugun) return "gelecek";
  return "bos";
}

/** 0 = Pazar … 6 = Cumartesi; saat dilimi kaymasına karşı UTC öğle vakti üzerinden. */
export function haftaninGunu(tarih: string): number {
  return new Date(`${tarih}T12:00:00Z`).getUTCDay();
}

/** "YYYY-MM" ayının tüm günleri ("YYYY-MM-DD"). */
export function ayGunleri(ay: string): string[] {
  const ilk = `${ay}-01`;
  const gunler: string[] = [];
  for (let t = ilk; t.startsWith(ay); t = gunEkle(t, 1)) gunler.push(t);
  return gunler;
}

/** Bir personelin ay özeti: durum sayıları ve fazla mesai. */
export function ayOzeti(hucreler: { tur: HucreTuru; fazlaMesaiDk: number }[]) {
  const say = (t: HucreTuru) => hucreler.filter((h) => h.tur === t).length;
  return {
    geldi: say("geldi"),
    yarimGun: say("yarim_gun"),
    gelmedi: say("gelmedi"),
    raporlu: say("raporlu"),
    izinli: say("izinli"),
    fazlaMesaiDk: hucreler.reduce((t, h) => t + h.fazlaMesaiDk, 0),
  };
}

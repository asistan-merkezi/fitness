import { toUTC } from "@/lib/datetime";
import { gunEkle } from "@/lib/donem";

/**
 * Ders formlarındaki "müsait saat" seçicisinin ortak hesabı (Tek Ders + Periyodik Ders; klinikteki
 * Yeni Randevu düzeni). Aday saatler çizelgenin varsayılan aralığında sabit adımlı ızgaradır; bir saat,
 * seçili antrenör + alan (+ müşteri) o aralıkta boşsa ve ders gün sonunu aşmıyor, geçmişte değilse
 * müsaittir. DB'deki çakışma kısıtlarıyla aynı kural — asıl güvence kısıttır, bu yalnız UI kolaylığı.
 * İzin/vardiyaya BAKMAZ (izinli antrenör kısıtı DB'de ayrıca denetlenir).
 */

export const GUN_BASLANGIC_SAAT = 8;
export const GUN_BITIS_SAAT = 22;
export const SAAT_ADIMI_DAKIKA = 30;

export type Aralik = { bas: number; bit: number };

const pad = (n: number) => String(n).padStart(2, "0");

/** "yyyy-MM-dd" + "HH:mm" (İstanbul) → epoch ms. */
export function anMs(tarih: string, saat: string) {
  return new Date(toUTC(`${tarih}T${saat}:00`)).getTime();
}

/** Verilen tarih+saat şu andan sonra mı (geçmiş saatler seçilemez). */
export function gelecekteMi(tarih: string, saat: string) {
  return anMs(tarih, saat) > Date.now();
}

/** Izgaradaki aday saatler (HH:mm, sıralı); `ekstra` ızgara dışı bir saati (çizelgeden gelen) de katar. */
export function saatAdaylari(ekstra = "") {
  const adaylar: string[] = [];
  for (let dk = GUN_BASLANGIC_SAAT * 60; dk < GUN_BITIS_SAAT * 60; dk += SAAT_ADIMI_DAKIKA) {
    adaylar.push(`${pad(Math.floor(dk / 60))}:${pad(dk % 60)}`);
  }
  if (/^\d{2}:\d{2}$/.test(ekstra) && !adaylar.includes(ekstra)) adaylar.push(ekstra);
  return adaylar.sort();
}

/** Verilen tarih+saatte `sureDk` dakikalık ders konabilir mi (gün sonu + dolu aralıklar; yarı açık aralık çakışması). */
export function saatMusaitMi(tarih: string, saat: string, sureDk: number, dolu: Aralik[]) {
  const bas = anMs(tarih, saat);
  const bit = bas + sureDk * 60_000;
  if (bit > anMs(tarih, `${pad(GUN_BITIS_SAAT)}:00`)) return false;
  return !dolu.some((d) => d.bas < bit && d.bit > bas);
}

/** Müsait saatler: ızgara adayları içinde geleceğe ait ve dolu aralıklarla çakışmayanlar. */
export function musaitSaatler(tarih: string, sureDk: number, dolu: Aralik[], ekstra = "") {
  return saatAdaylari(ekstra).filter((s) => gelecekteMi(tarih, s) && saatMusaitMi(tarih, s, sureDk, dolu));
}

/** Haftalık serinin ilk gerçekleşecek tarihi: `tarih` günü saati geçmişse bir sonraki hafta. */
export function ilkGerceklesenTarih(tarih: string, saat: string) {
  return gelecekteMi(tarih, saat) ? tarih : gunEkle(tarih, 7);
}

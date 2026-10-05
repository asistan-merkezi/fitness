import { bugunIstanbulTarihi, CLINIC_TZ, endOfDayUTC, formatDateForInput, simdikiYilIstanbul, startOfDayUTC } from "@/lib/datetime";

/**
 * Dönem süzme (gün / ay / yıl). Tek aralık tipi, YARI AÇIK [başlangıç, bitiş): üst sınır her zaman dışlayıcı.
 *  - timestamptz kolonlar için `baslangic` / `bitis` (UTC ISO)  -> gte / lt
 *  - date kolonlar için `baslangicTarih` / `bitisTarih` ("yyyy-MM-dd") -> gte / lt
 * Ay/gün aritmetiği UTC öğle vakti "güvenli an" üzerinden yapılır (İstanbul gün sınırı bu anı bölmez).
 * Bkz. skill: tarih-saat-donem.
 */
export type Donem = {
  gorunum: "gun" | "ay" | "yil";
  baslangic: string;
  bitis: string;
  baslangicTarih: string;
  bitisTarih: string;
  etiket: string;
  /** URL parametresi: gun=YYYY-MM-DD, ay=YYYY-MM, yil=YYYY */
  param: string;
  oncekiParam: string;
  sonrakiParam: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

function donemOlustur(
  gorunum: Donem["gorunum"],
  baslangicIso: string,
  bitisIso: string,
  etiket: string,
  param: string,
  oncekiParam: string,
  sonrakiParam: string
): Donem {
  return {
    gorunum,
    baslangic: baslangicIso,
    bitis: bitisIso,
    baslangicTarih: formatDateForInput(baslangicIso),
    bitisTarih: formatDateForInput(bitisIso),
    etiket,
    param,
    oncekiParam,
    sonrakiParam,
  };
}

/** "YYYY-MM-DD" + n gün (negatif olabilir); UTC öğle vakti üzerinden, saat dilimi kaymasına karşı güvenli. */
export function gunEkle(tarih: string, gun: number): string {
  const [y, m, d] = tarih.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + gun, 12));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** `tarih` ve sonrasındaki ilk verilen haftanın günü (0=Pazar … 6=Cumartesi), "YYYY-MM-DD"; `tarih` o günse kendisi. */
export function haftaGunuIlkTarih(tarih: string, haftaninGunu: number): string {
  const [y, m, d] = tarih.split("-").map(Number);
  const bugunHaftaGunu = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return gunEkle(tarih, (haftaninGunu - bugunHaftaGunu + 7) % 7);
}

/** İki "YYYY-MM-DD" arasındaki takvim günü farkı (b - a); saat dilimi kaymasından bağımsız. */
export function gunFarki(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** ay: 1-12 */
function ayBaslangiciUTC(yil: number, ay1Indeksli: number): string {
  return startOfDayUTC(new Date(Date.UTC(yil, ay1Indeksli - 1, 1, 12)));
}

/** tarih: "YYYY-MM-DD" (İstanbul takvim günü). */
export function gunDonemi(tarih: string): Donem {
  const [yil, ay, gun] = tarih.split("-").map(Number);
  const guvenliAn = new Date(Date.UTC(yil, ay - 1, gun, 12));
  const onceki = new Date(Date.UTC(yil, ay - 1, gun - 1, 12));
  const sonraki = new Date(Date.UTC(yil, ay - 1, gun + 1, 12));
  const p = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return donemOlustur(
    "gun",
    startOfDayUTC(guvenliAn),
    endOfDayUTC(guvenliAn),
    guvenliAn.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long", timeZone: CLINIC_TZ }),
    tarih,
    p(onceki),
    p(sonraki)
  );
}

/** ay: 1-12 */
export function ayDonemi(yil: number, ay: number): Donem {
  const baslangic = ayBaslangiciUTC(yil, ay);
  const sonrakiAy = ay === 12 ? { y: yil + 1, m: 1 } : { y: yil, m: ay + 1 };
  const oncekiAy = ay === 1 ? { y: yil - 1, m: 12 } : { y: yil, m: ay - 1 };
  const etiket = new Date(baslangic).toLocaleDateString("tr-TR", { month: "long", year: "numeric", timeZone: CLINIC_TZ });
  return donemOlustur(
    "ay",
    baslangic,
    ayBaslangiciUTC(sonrakiAy.y, sonrakiAy.m),
    etiket,
    `${yil}-${pad2(ay)}`,
    `${oncekiAy.y}-${pad2(oncekiAy.m)}`,
    `${sonrakiAy.y}-${pad2(sonrakiAy.m)}`
  );
}

export function yilDonemi(yil: number): Donem {
  return donemOlustur("yil", ayBaslangiciUTC(yil, 1), ayBaslangiciUTC(yil + 1, 1), String(yil), String(yil), String(yil - 1), String(yil + 1));
}

/**
 * "YYYY-MM-DD" gerçek bir takvim günü mü (1900–2100)? `Date.parse("2026-02-31")` GEÇERLİ sayar (3 Mart'a kayar); bu yüzden
 * ay sonu ayrıca denetlenir. Tüm tarih doğrulamaları bunu kullanmalı; alana özgü aralık (geçmiş/gelecek) şemada ayrıca denetlenir.
 */
export function takvimTarihiGecerli(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Dönem gezintisi 2000–2100 ile sınırlı (URL ile uç yıllara gidilip boş/ağır sorgu üretilmesin). */
const donemGunuGecerli = (s: string) => takvimTarihiGecerli(s) && Number(s.slice(0, 4)) >= 2000;

/**
 * URL parametrelerinden dönem çözer. Bozuk/eksik parametre HATA değil varsayılan üretir:
 * bugün / bu ay / bu yıl (İstanbul'a göre). `gorunum` verilmezse `gun`.
 */
export function donemCoz(parametreler: { gorunum?: string; tarih?: string }): Donem {
  const gorunum = parametreler.gorunum === "ay" || parametreler.gorunum === "yil" ? parametreler.gorunum : "gun";
  const bugun = bugunIstanbulTarihi();
  const p = parametreler.tarih ?? "";

  if (gorunum === "gun") {
    return gunDonemi(donemGunuGecerli(p) ? p : bugun);
  }
  if (gorunum === "ay") {
    const m = /^(\d{4})-(\d{2})$/.exec(p);
    if (m && Number(m[1]) >= 2000 && Number(m[1]) <= 2100 && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
      return ayDonemi(Number(m[1]), Number(m[2]));
    }
    const [y, mo] = bugun.split("-").map(Number);
    return ayDonemi(y, mo);
  }
  const yilSayisi = /^\d{4}$/.test(p) ? Number(p) : NaN;
  return yilDonemi(yilSayisi >= 2000 && yilSayisi <= 2100 ? yilSayisi : simdikiYilIstanbul());
}

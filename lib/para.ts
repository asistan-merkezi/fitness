/**
 * Para: tüm tutarlar KURUŞ cinsinden tamsayı saklanır ve hesaplanır (float yasak).
 * Gösterim tr-TR ("1.250,50 ₺"); kullanıcı girdisi string olarak ayrıştırılır.
 */

// ICU sürümüne göre ₺ sembolü başa ya da sona gelebilir; Türkçe gösterim ("1.250,50 ₺") sabit tutulur.
const SAYI_BICIMI = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 125050 -> "1.250,50 ₺". bigint (Postgres) ve number kabul eder. */
export function kurusTLyazi(kurus: number | bigint | string | null | undefined): string {
  if (kurus === null || kurus === undefined || kurus === "") return "—";
  const sayi = Number(kurus);
  if (!Number.isFinite(sayi)) return "—";
  return `${SAYI_BICIMI.format(sayi / 100)} ₺`;
}

/**
 * Kullanıcı girdisini kuruşa çevirir; geçersizse null. Float aritmetiği kullanmaz.
 * Kabul: "1250", "1250,5", "1.250,50", "1250.50", "₺ 1.250,50".
 * Kural: virgül varsa ondalık ayracı odur (noktalar binlik); virgül yoksa ve son noktadan
 * sonra 1-2 hane varsa nokta ondalıktır, 3 hane varsa binliktir ("1.250" = 1250).
 */
export function tlYaziKurusa(girdi: string | null | undefined): number | null {
  if (girdi === null || girdi === undefined) return null;
  let metin = girdi.replace(/[₺\s]|TL/gi, "");
  if (metin === "" || metin.startsWith("-")) return null;

  let tam: string;
  let kesir = "";
  if (metin.includes(",")) {
    const parcalar = metin.split(",");
    if (parcalar.length !== 2) return null;
    tam = parcalar[0].replace(/\./g, "");
    kesir = parcalar[1];
  } else if (/\.\d{1,2}$/.test(metin)) {
    const son = metin.lastIndexOf(".");
    tam = metin.slice(0, son).replace(/\./g, "");
    kesir = metin.slice(son + 1);
  } else {
    tam = metin.replace(/\./g, "");
  }

  if (!/^\d+$/.test(tam || "0") || (kesir !== "" && !/^\d{1,2}$/.test(kesir))) return null;
  metin = `${tam || "0"}${kesir.padEnd(2, "0")}`;
  const kurus = Number(metin);
  return Number.isSafeInteger(kurus) ? kurus : null;
}

/** 125050 -> "1250,50" (form alanına geri doldurmak için; binlik ayraç yok). */
export function kurusGirdiYazi(kurus: number | bigint | string | null | undefined): string {
  if (kurus === null || kurus === undefined || kurus === "") return "";
  const sayi = Number(kurus);
  if (!Number.isFinite(sayi)) return "";
  const tam = Math.trunc(sayi / 100);
  const kesir = String(Math.abs(sayi % 100)).padStart(2, "0");
  return `${tam},${kesir}`;
}

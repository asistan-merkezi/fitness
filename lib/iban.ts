/** IBAN doğrulama ve biçimleme (veritabanındaki `iban_gecerli` ile aynı kural: TR + 24 hane, mod 97). */

export function ibanTemizle(girdi: string): string {
  return girdi.replace(/\s/g, "").toUpperCase();
}

export function ibanGecerli(girdi: string | null | undefined): boolean {
  if (!girdi) return false;
  const iban = ibanTemizle(girdi);
  if (!/^TR[0-9]{24}$/.test(iban)) return false;
  const duzen = iban.slice(4) + iban.slice(0, 4);
  let kalan = 0;
  for (const harf of duzen) {
    const sayi = /[A-Z]/.test(harf) ? String(harf.charCodeAt(0) - 55) : harf;
    for (const hane of sayi) kalan = (kalan * 10 + Number(hane)) % 97;
  }
  return kalan === 1;
}

/** "TR33 0006 1005 1978 6457 8413 26" biçimi (4'lü gruplar). */
export function ibanBicimle(girdi: string): string {
  return ibanTemizle(girdi).replace(/(.{4})/g, "$1 ").trim();
}

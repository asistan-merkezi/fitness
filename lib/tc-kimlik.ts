/**
 * T.C. kimlik numarası doğrulaması (resmi algoritma). Veritabanındaki
 * `public.tc_kimlik_gecerli()` ile AYNI kural; istemci/sunucu erken geri bildirim içindir,
 * asıl zorlama DB CHECK'indedir.
 */
export function tcKimlikGecerli(tc: string | null | undefined): boolean {
  if (!tc || !/^[1-9][0-9]{10}$/.test(tc)) return false;
  const d = tc.split("").map(Number);
  const tek = d[0] + d[2] + d[4] + d[6] + d[8];
  const cift = d[1] + d[3] + d[5] + d[7];
  if ((((tek * 7 - cift) % 10) + 10) % 10 !== d[9]) return false;
  const ilkOn = d.slice(0, 10).reduce((t, x) => t + x, 0);
  return ilkOn % 10 === d[10];
}

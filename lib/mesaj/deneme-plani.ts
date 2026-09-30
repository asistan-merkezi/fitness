// Merkeze ulaşılamadığında geçici hata geri çekilmesi: 1. denemeden sonra 5 dk, 2.'den sonra 30 dk, 3.'den sonra 2 sa;
// 3. deneme de başarısızsa durum "hata" olur.
export const GERI_CEKILME_DAKIKA = [5, 30, 120];
export const MAKS_DENEME = GERI_CEKILME_DAKIKA.length;

/** Sonraki denemenin zamanı ve bu denemenin son olup olmadığı (saf hesap). */
export function sonrakiDeneme(denemeSayisi: number, simdiMs: number): { son: boolean; zaman: string | null } {
  const yeniDeneme = denemeSayisi + 1;
  if (yeniDeneme >= MAKS_DENEME) return { son: true, zaman: null };
  return { son: false, zaman: new Date(simdiMs + GERI_CEKILME_DAKIKA[yeniDeneme - 1] * 60_000).toISOString() };
}

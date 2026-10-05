const SAYFA = 1000; // PostgREST max_rows = 1000: `.limit(5000)` bunu AŞAMAZ, daha büyük listeler sayfa sayfa okunmalı.

/**
 * Bir sorguyu 1000'lik `.range()` sayfalarıyla SONUNA KADAR okur (satırlar sessizce kesilmesin). Sorgu sabit bir sıralama
 * içermeli (sayfalar arası kayma olmasın). Hata olursa fırlatır: eksik veriyle yanlış toplam/bakiye göstermektense sayfa hata vermeli.
 */
export async function tumSayfalariOku<T>(sorgu: (bas: number, son: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const tumu: T[] = [];
  for (let bas = 0; ; bas += SAYFA) {
    const { data, error } = await sorgu(bas, bas + SAYFA - 1);
    if (error) throw new Error(`Veri okunamadı: ${error.message}`);
    const sayfa = data ?? [];
    tumu.push(...sayfa);
    if (sayfa.length < SAYFA) return tumu;
  }
}

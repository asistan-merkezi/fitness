import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Müşteri adları (muhasebe yalnız `musteri_ozet` görür). `.in()` GET URL'sine gömülür: yıllık/tümü listelerinde yüzlerce id URL
 * sınırını aşıp sorguyu SESSİZCE boş döndürür; bu yüzden id'ler 80'erlik gruplara bölünüp paralel sorgulanır.
 */
export async function musteriAdlariGetir(supabase: Supabase, idler: string[]): Promise<Map<string, string>> {
  const benzersiz = [...new Set(idler)];
  const gruplar: string[][] = [];
  for (let i = 0; i < benzersiz.length; i += 80) gruplar.push(benzersiz.slice(i, i + 80));
  const sonuclar = await Promise.all(gruplar.map((g) => supabase.from("musteri_ozet").select("id, ad_soyad").in("id", g)));
  const ad = new Map<string, string>();
  for (const { data } of sonuclar) for (const m of (data ?? []) as { id: string; ad_soyad: string }[]) ad.set(m.id, m.ad_soyad);
  return ad;
}

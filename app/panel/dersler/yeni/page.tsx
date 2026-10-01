import { redirect } from "next/navigation";

/** Eski "Yeni Ders" sayfası: artık Dersler sayfasında açılan pencere (eski bağlantılar ve yer imleri için yönlendirir). */
export default async function YeniDersYonlendirme({ searchParams }: { searchParams: Promise<{ gun?: string; uye?: string; saat?: string }> }) {
  const { gun, uye, saat } = await searchParams;
  const parametreler = new URLSearchParams({ yeni: "1" });
  if (gun) parametreler.set("gun", gun);
  if (uye) parametreler.set("uye", uye);
  if (saat) parametreler.set("saat", saat);
  redirect(`/panel/dersler?${parametreler.toString()}`);
}

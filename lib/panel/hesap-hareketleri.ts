import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HesapHareketi } from "@/lib/panel/finans";

export type HesapHareketSatiri = HesapHareketi & { musteri_adi?: string };

/**
 * Bir hesabın (kasa / belirli banka / atanmamış banka / yalnız kredi kartı) dönem hareketleri. Tek kaynak `hesap_hareket_gorunum`
 * (security_invoker: yalnız rolün okuyabildiği kaynak satırları gelir). Müşteri tahsilat/iadelerine müşteri adı eklenir.
 */
export async function hesapHareketleriGetir(
  supabase: SupabaseClient,
  o: { baslangic: string; bitis: string; hesap?: "kasa" | "banka"; bankaHesapId?: string | "atanmamis"; yontem?: string; limit?: number }
): Promise<HesapHareketSatiri[]> {
  let sorgu = supabase
    .from("hesap_hareket_gorunum")
    .select("tarih, hesap, banka_hesap_id, yontem, tutar_kurus, kaynak, kaynak_id, aciklama")
    .gte("tarih", o.baslangic)
    .lt("tarih", o.bitis)
    .order("tarih", { ascending: false })
    .limit(o.limit ?? 300);
  if (o.hesap) sorgu = sorgu.eq("hesap", o.hesap);
  if (o.bankaHesapId === "atanmamis") sorgu = sorgu.is("banka_hesap_id", null);
  else if (o.bankaHesapId) sorgu = sorgu.eq("banka_hesap_id", o.bankaHesapId);
  if (o.yontem) sorgu = sorgu.eq("yontem", o.yontem);

  const { data } = await sorgu;
  const satirlar = ((data ?? []) as HesapHareketi[]).map((s) => ({ ...s, tutar_kurus: Number(s.tutar_kurus) })) as HesapHareketSatiri[];

  const musteriKayitlari = satirlar.filter((s) => s.kaynak === "musteri").map((s) => s.kaynak_id);
  if (musteriKayitlari.length > 0) {
    const { data: hareketler } = await supabase.from("musteri_bakiye_hareket").select("id, musteri_id").in("id", musteriKayitlari);
    const musteriIdleri = [...new Set(((hareketler ?? []) as { id: string; musteri_id: string }[]).map((h) => h.musteri_id))];
    const { data: adlar } = musteriIdleri.length ? await supabase.from("musteri_ozet").select("id, ad_soyad").in("id", musteriIdleri) : { data: [] };
    const ad = new Map(((adlar ?? []) as { id: string; ad_soyad: string }[]).map((m) => [m.id, m.ad_soyad]));
    const hareketMusteri = new Map(((hareketler ?? []) as { id: string; musteri_id: string }[]).map((h) => [h.id, h.musteri_id]));
    for (const s of satirlar) {
      if (s.kaynak === "musteri") s.musteri_adi = ad.get(hareketMusteri.get(s.kaynak_id) ?? "");
    }
  }
  return satirlar;
}

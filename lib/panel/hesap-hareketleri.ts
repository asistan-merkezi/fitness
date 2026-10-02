import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HesapHareketi } from "@/lib/panel/finans";

export type HesapHareketSatiri = HesapHareketi & { musteri_adi?: string };

/**
 * Bir hesabın (kasa / belirli banka / atanmamış banka / kredi kartı) dönem hareketleri. Tek kaynak `hesap_hareket_gorunum`
 * (security_invoker: yalnız rolün okuyabildiği kaynak satırları gelir). Müşteri tahsilat/iadelerine müşteri adı eklenir.
 */
export async function hesapHareketleriGetir(
  supabase: SupabaseClient,
  o: { baslangic: string; bitis: string; hesap?: "kasa" | "banka" | "kart"; bankaHesapId?: string | "atanmamis"; yontem?: string; limit?: number }
): Promise<HesapHareketSatiri[]> {
  const SAYFA = 1000; // PostgREST varsayılan en fazla 1000 satır döndürür; daha büyük listeler sayfa sayfa çekilir.
  const toplamSinir = o.limit ?? 300;
  const ham: HesapHareketi[] = [];
  for (let bas = 0; bas < toplamSinir; bas += SAYFA) {
    let sorgu = supabase
      .from("hesap_hareket_gorunum")
      .select("tarih, hesap, banka_hesap_id, yontem, tutar_kurus, kaynak, kaynak_id, aciklama")
      .gte("tarih", o.baslangic)
      .lt("tarih", o.bitis)
      .order("tarih", { ascending: false })
      .order("kaynak_id") // sayfalar arasında kararlı sıra
      .range(bas, Math.min(bas + SAYFA, toplamSinir) - 1);
    if (o.hesap) sorgu = sorgu.eq("hesap", o.hesap);
    if (o.bankaHesapId === "atanmamis") sorgu = sorgu.is("banka_hesap_id", null);
    else if (o.bankaHesapId) sorgu = sorgu.eq("banka_hesap_id", o.bankaHesapId);
    if (o.yontem) sorgu = sorgu.eq("yontem", o.yontem);
    const { data } = await sorgu;
    const sayfa = (data ?? []) as HesapHareketi[];
    ham.push(...sayfa);
    if (sayfa.length < Math.min(SAYFA, toplamSinir - bas)) break;
  }
  const satirlar = ham.map((s) => ({ ...s, tutar_kurus: Number(s.tutar_kurus) })) as HesapHareketSatiri[];

  // Müşteri adları: `.in()` GET URL'sine gömülür, uzun listelerde sorgu sessizce boş döner → 80'lik gruplarla çekilir.
  const gruplar = <T,>(liste: T[]) => {
    const cikti: T[][] = [];
    for (let i = 0; i < liste.length; i += 80) cikti.push(liste.slice(i, i + 80));
    return cikti;
  };
  const musteriKayitlari = [...new Set(satirlar.filter((s) => s.kaynak === "musteri").map((s) => s.kaynak_id))];
  if (musteriKayitlari.length > 0) {
    const hareketSonuclari = await Promise.all(gruplar(musteriKayitlari).map((g) => supabase.from("musteri_bakiye_hareket").select("id, musteri_id").in("id", g)));
    const hareketMusteri = new Map<string, string>();
    for (const { data } of hareketSonuclari) for (const h of (data ?? []) as { id: string; musteri_id: string }[]) hareketMusteri.set(h.id, h.musteri_id);
    const musteriIdleri = [...new Set(hareketMusteri.values())];
    const adSonuclari = await Promise.all(gruplar(musteriIdleri).map((g) => supabase.from("musteri_ozet").select("id, ad_soyad").in("id", g)));
    const ad = new Map<string, string>();
    for (const { data } of adSonuclari) for (const m of (data ?? []) as { id: string; ad_soyad: string }[]) ad.set(m.id, m.ad_soyad);
    for (const s of satirlar) {
      if (s.kaynak === "musteri") s.musteri_adi = ad.get(hareketMusteri.get(s.kaynak_id) ?? "");
    }
  }
  return satirlar;
}

export type ManuelKayit = {
  id: string;
  tip: "giren" | "cikan" | "transfer";
  kasa: boolean;
  banka_hesap_id: string | null;
  hedef_kasa: boolean;
  hedef_banka_hesap_id: string | null;
  karsi_taraf: string | null;
  karsi_taraf_banka: string | null;
  karsi_taraf_iban: string | null;
  aciklama: string | null;
  tutar_kurus: number;
  tarih: string;
};

/**
 * Dönemde kasa veya banka hesabını ilgilendiren MANUEL kayıtlar (giren / çıkan / transfer — kaynak ya da hedef bacak).
 * `hesap`: "kasa" | banka hesap id'si | "banka" (herhangi bir banka hesabı).
 */
export async function manuelKayitlariGetir(supabase: SupabaseClient, o: { baslangic: string; bitis: string; hesap: string }): Promise<ManuelKayit[]> {
  const kosul = o.hesap === "kasa" ? "kasa.eq.true,hedef_kasa.eq.true" : o.hesap === "banka" ? "banka_hesap_id.not.is.null,hedef_banka_hesap_id.not.is.null" : `banka_hesap_id.eq.${o.hesap},hedef_banka_hesap_id.eq.${o.hesap}`;
  const { data } = await supabase
    .from("kasa_banka_hareket")
    .select("id, tip, kasa, banka_hesap_id, hedef_kasa, hedef_banka_hesap_id, karsi_taraf, karsi_taraf_banka, karsi_taraf_iban, aciklama, tutar_kurus, tarih")
    .or(kosul)
    .gte("tarih", o.baslangic)
    .lt("tarih", o.bitis)
    .order("tarih", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  return ((data ?? []) as ManuelKayit[]).map((k) => ({ ...k, tutar_kurus: Number(k.tutar_kurus) }));
}

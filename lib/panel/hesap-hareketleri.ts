import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HesapHareketDetayi } from "@/lib/panel/finans";
import { tumSayfalariOku } from "@/lib/supabase/sayfali-oku";

export type HesapHareketSatiri = HesapHareketDetayi & { musteri_adi?: string };

/**
 * Bir hesabın (kasa / belirli banka / atanmamış banka / kredi kartı) dönem hareketleri, [baslangic, bitis) aralığında.
 * Tek kaynak `hesap_hareket_detay` (security_invoker: yalnız rolün okuyabildiği kaynak satırları gelir); müşteri adı, tedarikçi,
 * personel adı, transfer karşı hesabı görünümde çözülür. Sıra sabittir (tarih, kaynak, kaynak_id, tutar).
 */
export async function hesapHareketleriGetir(
  supabase: SupabaseClient,
  o: { baslangic: string; bitis: string; hesap?: "kasa" | "banka" | "kart"; bankaHesapId?: string | "atanmamis"; yontem?: string }
): Promise<HesapHareketSatiri[]> {
  const satirlar = await tumSayfalariOku<HesapHareketDetayi>((bas, son) => {
    let sorgu = supabase
      .from("hesap_hareket_detay")
      .select("tarih, hesap, banka_hesap_id, yontem, tutar_kurus, kaynak, kaynak_id, aciklama, tur, karsi_taraf, detay, kategori, karsi_iban, islem_zamani")
      .gte("tarih", o.baslangic)
      .lt("tarih", o.bitis);
    if (o.hesap) sorgu = sorgu.eq("hesap", o.hesap);
    if (o.bankaHesapId === "atanmamis") sorgu = sorgu.is("banka_hesap_id", null);
    else if (o.bankaHesapId) sorgu = sorgu.eq("banka_hesap_id", o.bankaHesapId);
    if (o.yontem) sorgu = sorgu.eq("yontem", o.yontem);
    return sorgu.order("tarih").order("kaynak").order("kaynak_id").order("tutar_kurus").range(bas, son);
  });
  return satirlar.map((s) => ({ ...s, tutar_kurus: Number(s.tutar_kurus), ...(s.kaynak === "musteri" && s.karsi_taraf ? { musteri_adi: s.karsi_taraf } : {}) }));
}

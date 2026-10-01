import type { createClient } from "@/lib/supabase/server";

/** Gider satırı: Genel Giderler ve Kamusal Giderler sekmeleri aynı `gider` tablosunu (`tur` ile ayrılır) kullanır. */
export type Gider = {
  id: string;
  tur: "gider" | "kamusal";
  kategori: string;
  tedarikci_adi: string | null;
  aciklama: string | null;
  belge_no: string | null;
  tutar_kurus: number;
  tarih: string;
  vade_tarihi: string | null;
  durum: "bekliyor" | "odendi" | "iptal";
  odeme_yontemi: string | null;
  odeme_tarihi: string | null;
  iptal_nedeni: string | null;
};

export const GIDER_SECIM = "id, tur, kategori, tedarikci_adi, aciklama, belge_no, tutar_kurus, tarih, vade_tarihi, durum, odeme_yontemi, odeme_tarihi, iptal_nedeni";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Henüz ödenmemiş (bekleyen) giderler, vadesi en yakın olan önce; dönemden bağımsızdır. */
export async function bekleyenGiderleriGetir(supabase: Supabase, tur: Gider["tur"]) {
  const { data } = await supabase.from("gider").select(GIDER_SECIM).eq("tur", tur).eq("durum", "bekliyor").order("vade_tarihi", { ascending: true, nullsFirst: false });
  return (data ?? []) as Gider[];
}

/** Kamu ödemesinde dönem tarihi: vade varsa vade (ödenecek ay), yoksa gider tarihi. */
export const giderDonemTarihi = (g: Pick<Gider, "tarih" | "vade_tarihi">) => g.vade_tarihi ?? g.tarih;

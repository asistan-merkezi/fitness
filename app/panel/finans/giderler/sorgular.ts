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
  arac_id: string | null;
  donem_yil: number | null;
  donem_ay: number | null;
};

export const GIDER_SECIM = "id, tur, kategori, tedarikci_adi, aciklama, belge_no, tutar_kurus, tarih, vade_tarihi, durum, odeme_yontemi, odeme_tarihi, iptal_nedeni, arac_id, donem_yil, donem_ay";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Henüz ödenmemiş (bekleyen) giderler, vadesi en yakın olan önce; dönemden bağımsızdır. */
export async function bekleyenGiderleriGetir(supabase: Supabase, tur: Gider["tur"]) {
  const { data } = await supabase.from("gider").select(GIDER_SECIM).eq("tur", tur).eq("durum", "bekliyor").order("vade_tarihi", { ascending: true, nullsFirst: false });
  return (data ?? []) as Gider[];
}

/** Kamu ödemesinin ait olduğu dönem: girilen ay/yıl; eski kayıtlarda (dönemsiz) vade, o da yoksa gider tarihi. */
export function giderDonemi(g: Pick<Gider, "tarih" | "vade_tarihi" | "donem_yil" | "donem_ay">): { yil: number; ay: number } {
  if (g.donem_yil && g.donem_ay) return { yil: g.donem_yil, ay: g.donem_ay };
  const t = g.vade_tarihi ?? g.tarih;
  return { yil: Number(t.slice(0, 4)), ay: Number(t.slice(5, 7)) };
}

export type AracSecenegi = { id: string; ad: string; plaka: string; aktif: boolean };

/** İşletme araçları (pasifler dahil: eski giderde plaka gösterebilmek için). Yetkisiz roller boş görür. */
export async function araclariGetir(supabase: Supabase): Promise<AracSecenegi[]> {
  const { data } = await supabase.from("isletme_arac").select("id, marka, model, plaka, aktif").order("aktif", { ascending: false }).order("marka").order("plaka");
  return ((data ?? []) as { id: string; marka: string; model: string; plaka: string; aktif: boolean }[]).map((a) => ({ id: a.id, ad: `${a.marka} ${a.model}`, plaka: a.plaka, aktif: a.aktif }));
}

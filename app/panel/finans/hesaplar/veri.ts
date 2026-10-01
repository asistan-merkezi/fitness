import type { HesapSecenegi } from "@/components/panel/yontem-hesap-secimi";
import type { createClient } from "@/lib/supabase/server";
import { type AracSecenegi, araclariGetir } from "../giderler/sorgular";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Kasa/Banka "Giren / Çıkan" pencerelerinin ihtiyaç duyduğu seçenekler: banka hesapları, personel (aktif kullanıcılar) ve araçlar. */
export async function hareketPencereVerileri(supabase: Supabase): Promise<{ hesapSecenekleri: HesapSecenegi[]; personel: { id: string; ad_soyad: string }[]; araclar: AracSecenegi[] }> {
  const [{ data: hesapVeri }, { data: kisiVeri }, araclar] = await Promise.all([
    supabase.rpc("banka_hesap_secenekleri"),
    supabase.from("kullanici").select("id, ad_soyad, rol").eq("aktif", true).order("ad_soyad"),
    araclariGetir(supabase),
  ]);
  return {
    hesapSecenekleri: (hesapVeri ?? []) as HesapSecenegi[],
    personel: ((kisiVeri ?? []) as { id: string; ad_soyad: string; rol: string }[]).filter((k) => k.rol !== "super_admin").map(({ id, ad_soyad }) => ({ id, ad_soyad })),
    araclar,
  };
}

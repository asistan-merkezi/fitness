"use server";

import { revalidatePath } from "next/cache";
import { formVerisi, ilkHata, riskBayragiEkleSemasi, riskBayragiKaldirSemasi } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

function yenile(musteriId: string) {
  revalidatePath(`/panel/musteriler/${musteriId}`);
  revalidatePath("/panel/dersler");
}

/** Risk bayrağı ekle (yönetici ve resepsiyon). Sağlık verisidir: açıklama kısa tutulur, kayıt değeri denetim günlüğünde gösterilmez. */
export async function riskBayragiEkle(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const a = riskBayragiEkleSemasi.safeParse(formVerisi(formData));
  if (!a.success) return hata(ilkHata(a.error));

  const { error } = await oturum.supabase.rpc("risk_bayragi_ekle", { p_musteri_id: a.data.musteri_id, p_tip: a.data.tip, p_seviye: a.data.seviye, p_aciklama: a.data.aciklama ?? undefined });
  if (error) {
    console.error("[riskBayragiEkle]", error.code);
    return hata(hataMesajiCoz(error));
  }
  yenile(a.data.musteri_id);
  return basari("Risk bayrağı eklendi.");
}

/** Risk bayrağını kaldır: silinmez, "kaldırıldı" olarak işaretlenir (kim/ne zaman kayıtlı kalır). */
export async function riskBayragiKaldir(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const a = riskBayragiKaldirSemasi.safeParse(formVerisi(formData));
  if (!a.success) return hata(ilkHata(a.error));

  const { error } = await oturum.supabase.rpc("risk_bayragi_kaldir", { p_id: a.data.risk_id });
  if (error) {
    console.error("[riskBayragiKaldir]", error.code);
    return hata(hataMesajiCoz(error));
  }
  yenile(a.data.musteri_id);
  return basari("Risk bayrağı kaldırıldı.");
}

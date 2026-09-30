"use server";

import { revalidatePath } from "next/cache";
import { alanSemasi, formVerisi, ilkHata } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

/** Alan/stüdyo oluştur veya güncelle (yalnız işletme yöneticisi). `alan_id` doluysa günceller. */
export async function alanKaydet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = alanSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  if (v.alan_id) {
    const { data, error } = await oturum.supabase.from("alan_studyo").update({ ad: v.ad, aktif: v.aktif }).eq("id", v.alan_id).select("id");
    if (error) {
      console.error("[alanKaydet:guncelle]", error.code);
      return hata(hataMesajiCoz(error));
    }
    if (!data || data.length === 0) return hata("Alan bulunamadı.");
  } else {
    const { error } = await oturum.supabase.from("alan_studyo").insert({ isletme_id: oturum.kullanici.isletme_id, ad: v.ad, aktif: true });
    if (error) {
      console.error("[alanKaydet:ekle]", error.code);
      return hata(error.code === "23505" ? "Bu adla bir alan zaten var." : hataMesajiCoz(error));
    }
  }

  revalidatePath("/panel/yonetim/donanim");
  return basari(v.alan_id ? "Alan güncellendi." : "Alan eklendi.");
}

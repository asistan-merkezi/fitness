"use server";

import { revalidatePath } from "next/cache";
import { formVerisi, ilkHata, iskontoOranlariSemasi } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";

/** Kategori bazlı önerilen iskonto yüzdelerini kaydeder (yalnız işletme yöneticisi). */
export async function iskontoOranlariKaydet(_onceki: EylemSonucu | null, formData: FormData): Promise<EylemSonucu | null> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = iskontoOranlariSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const satirlar = Object.entries(ayristirma.data).map(([kategori, yuzde]) => ({ isletme_id: oturum.kullanici.isletme_id, kategori, yuzde }));
  const { error } = await oturum.supabase.from("kategori_iskonto_orani").upsert(satirlar, { onConflict: "isletme_id,kategori" });
  if (error) {
    console.error("[iskontoOranlariKaydet]", error.code);
    return hata(hataMesajiCoz(error));
  }
  revalidatePath("/panel/finans/kategori-iskonto-oranlari");
  return basari("İskonto oranları kaydedildi.");
}

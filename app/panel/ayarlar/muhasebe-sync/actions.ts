"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formVerisi, ilkHata } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";

const muhasebeSyncSemasi = z.object({
  parasut_client_id: z.string().trim().min(1, "Client ID gerekli."),
  parasut_client_secret: z.string().trim().optional(),
  parasut_company_id: z.string().trim().min(1, "Şirket (Company) ID gerekli."),
});

/** Paraşüt API bilgilerini kaydeder (yalnız işletme yöneticisi). Secret boş bırakılırsa mevcut değer korunur; ekrana hiç taşınmaz. */
export async function muhasebeSyncGuncelle(_onceki: EylemSonucu | null, formData: FormData): Promise<EylemSonucu | null> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = muhasebeSyncSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("muhasebe_entegrasyonu_kaydet", {
    p_client_id: v.parasut_client_id,
    p_client_secret: v.parasut_client_secret || null,
    p_company_id: v.parasut_company_id,
  });
  if (error) {
    console.error("[muhasebeSyncGuncelle]", error.code);
    return hata(hataMesajiCoz(error));
  }

  revalidatePath("/panel/ayarlar/muhasebe-sync");
  return basari("Muhasebe Sync bilgileri kaydedildi.");
}

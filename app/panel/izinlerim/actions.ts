"use server";

import { revalidatePath } from "next/cache";
import { formVerisi, ilkHata, izinIptalSemasi, izinTalepSemasi } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";

type Onceki = EylemSonucu | null;

const TUM_ROLLER = ["isletme_admin", "resepsiyon", "muhasebe", "antrenor"] as const;

/** Kendi adına izin talebi (her rol). Gün sayısı, bakiye ve çakışma kontrolleri veritabanındadır. */
export async function izinTalepOlustur(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(TUM_ROLLER);
  if (!oturum) return YETKISIZ;

  const ayristirma = izinTalepSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("izin_talep_olustur", {
    p_tip: v.tip,
    p_baslangic: v.baslangic,
    p_bitis: v.bitis,
    p_gerekce: v.gerekce ?? undefined,
  });
  if (error) {
    console.error("[izinTalepOlustur]", error.code);
    return hata(hataMesajiCoz(error));
  }

  revalidatePath("/panel/izinlerim");
  revalidatePath("/panel/yonetim/izinler");
  return basari("İzin talebiniz yöneticiye iletildi.");
}

/** Talebi iptal eder: sahibi (beklemede veya başlamamış onaylı) ya da yönetici. */
export async function izinTalepIptal(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(TUM_ROLLER);
  if (!oturum) return YETKISIZ;

  const ayristirma = izinIptalSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { error } = await oturum.supabase.rpc("izin_talep_iptal", { p_id: ayristirma.data.izin_id });
  if (error) {
    console.error("[izinTalepIptal]", error.code);
    return hata(hataMesajiCoz(error));
  }

  revalidatePath("/panel/izinlerim");
  revalidatePath("/panel/yonetim/izinler");
  return basari("İzin talebi iptal edildi.");
}

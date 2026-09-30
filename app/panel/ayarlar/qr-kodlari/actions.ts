"use server";

import { revalidatePath } from "next/cache";
import { formVerisi, qrAyarSemasi } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";

/** QR formunu aç/kapat (yalnız işletme yöneticisi). Form alanı yoksa kapatılır: onay kutusu işaretliyse "on" gelir. */
export async function qrAktifAyarla(formData: FormData): Promise<void> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return;

  const ayristirma = qrAyarSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return;

  const { error } = await oturum.supabase
    .from("qr_kod_ayar")
    .upsert({ isletme_id: oturum.kullanici.isletme_id, tip: ayristirma.data.tip, aktif: ayristirma.data.aktif }, { onConflict: "isletme_id,tip" });
  if (error) console.error("[qrAktifAyarla]", error.code);
  revalidatePath("/panel/ayarlar/qr-kodlari");
}

/** Sızan/istenmeyen kodu yeniler: basılı tüm QR'lar geçersiz olur (yalnız yönetici). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- EylemFormu sözleşmesi (onceki, formData) imzasını gerektirir
export async function qrKodunuYenile(_onceki: EylemSonucu | null): Promise<EylemSonucu | null> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const { error } = await oturum.supabase.rpc("qr_kisa_kod_yenile");
  if (error) {
    console.error("[qrKodunuYenile]", error.code);
    return hata(hataMesajiCoz(error));
  }
  revalidatePath("/panel/ayarlar/qr-kodlari");
  return basari("QR kodu yenilendi. Eski kodlar artık çalışmaz; yeni kodları yazdırıp değiştirin.");
}

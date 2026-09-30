"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formVerisi, ilkHata, odemeSemasi } from "@/lib/dogrulama";
import { type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { odemeMesaji } from "@/lib/mesaj/olaylar";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";

/**
 * Hızlı tahsilat: seçili müşteriden tutar + yöntem ile tahsilat (defter kaydı, idempotent).
 * Başarıda sayfa yeniden yüklenir (tuş takımı sıfırlanır, çift gönderim olmaz) ve özet gösterilir.
 */
export async function hizliTahsilatKaydet(_onceki: EylemSonucu | null, formData: FormData): Promise<EylemSonucu | null> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = odemeSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("hareket_ekle", {
    p_musteri_id: v.musteri_id,
    p_tur: "odeme",
    p_tutar_kurus: v.tutar,
    p_yontem: v.yontem,
    p_aciklama: v.aciklama ?? "Hızlı tahsilat",
    p_anahtar: v.anahtar,
  });
  if (error) {
    console.error("[hizliTahsilatKaydet]", error.code);
    return hata(hataMesajiCoz(error));
  }

  await odemeMesaji(oturum.kullanici.isletme_id, v.musteri_id, v.tutar, v.yontem, v.anahtar);
  revalidatePath("/panel");
  revalidatePath("/panel/kasa");
  revalidatePath(`/panel/musteriler/${v.musteri_id}`);
  redirect(`/panel/kasa/hizli-tahsilat?ok=${v.musteri_id}&tutar=${v.tutar}`);
}

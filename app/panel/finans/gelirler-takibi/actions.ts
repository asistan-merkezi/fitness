"use server";

import { revalidatePath } from "next/cache";
import { faturaIptalSemasi, faturaOlusturSemasi, formVerisi, ilkHata } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { FINANS_ROLLERI, FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

function yenile() {
  revalidatePath("/panel/finans/gelirler-takibi");
  revalidatePath("/panel/finans/raporlar");
}

/** Seçilen borç satırlarından (tek müşteri) fatura kuyruğu kaydı oluşturur. Paraşüt bağlanana kadar durum "bekliyor" kalır. */
export async function faturaOlustur(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(FINANS_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ham = formVerisi(formData);
  // Tek seçimde formVerisi dizi yerine düz metin döndürür.
  const idler = ham.hareket_idleri === undefined ? [] : Array.isArray(ham.hareket_idleri) ? ham.hareket_idleri : [ham.hareket_idleri];
  const ayristirma = faturaOlusturSemasi.safeParse({ hareket_idleri: idler });
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { error } = await oturum.supabase.rpc("fatura_olustur", { p_hareket_idleri: ayristirma.data.hareket_idleri });
  if (error) {
    console.error("[faturaOlustur]", error.code);
    return hata(hataMesajiCoz(error));
  }
  yenile();
  return basari("Fatura kuyruğa alındı. Muhasebe bağlantısı kurulunca otomatik kesilecek.");
}

/** Henüz kesilmemiş faturayı iptal eder; borç satırları yeniden faturalanabilir hale gelir. */
export async function faturaIptal(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(FINANS_YONETIM_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = faturaIptalSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { error } = await oturum.supabase.rpc("fatura_iptal", { p_id: ayristirma.data.fatura_id, p_neden: ayristirma.data.neden });
  if (error) {
    console.error("[faturaIptal]", error.code);
    return hata(hataMesajiCoz(error));
  }
  yenile();
  return basari("Fatura iptal edildi.");
}

"use server";

import { revalidatePath } from "next/cache";
import { faturaBilgisiSemasi, faturaIptalSemasi, faturaOlusturSemasi, formVerisi, ilkHata } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { FINANS_ROLLERI, FINANS_YONETIM_ROLLERI, MUSTERI_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

function yenile() {
  revalidatePath("/panel/finans/gelirler-takibi", "layout");
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

/** Fatura için eksik alıcı bilgisini tamamlar (yalnız yönetici/resepsiyon; muhasebe kişisel veriyi yazamaz). Yalnız doldurulan alanlar yazılır. */
export async function faturaBilgisiTamamla(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const a = faturaBilgisiSemasi.safeParse(formVerisi(formData));
  if (!a.success) return hata(ilkHata(a.error));
  const v = a.data;

  const { error } = await oturum.supabase.rpc("musteri_fatura_bilgisi_tamamla", {
    p_musteri_id: v.musteri_id,
    p_eposta: v.eposta ?? undefined,
    p_tc: v.tc_kimlik_no ?? undefined,
    p_il: v.il ?? undefined,
    p_ilce: v.ilce ?? undefined,
    p_mahalle: v.mahalle ?? undefined,
    p_adres_detay: v.adres_detay ?? undefined,
  });
  if (error) {
    console.error("[faturaBilgisiTamamla]", error.code);
    return hata(hataMesajiCoz(error));
  }
  yenile();
  revalidatePath(`/panel/musteriler/${v.musteri_id}`);
  return basari("Fatura bilgileri kaydedildi.");
}

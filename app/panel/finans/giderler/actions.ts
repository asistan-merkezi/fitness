"use server";

import { revalidatePath } from "next/cache";
import { formVerisi, giderIptalSemasi, giderOdeSemasi, giderSemasi, ilkHata } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { FINANS_YONETIM_ROLLERI, YONETICI_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

function yenile() {
  revalidatePath("/panel/finans/giderler");
  revalidatePath("/panel/kasa");
  revalidatePath("/panel/finans/banka");
  revalidatePath("/panel/finans/kredi-karti");
  revalidatePath("/panel/finans/raporlar");
}

/** Gider ekle (yönetici ve muhasebe). Ödenmiş gider kasa/bankayı etkiler; bekleyen (vadeli) gider ödenene kadar etkilemez. */
export async function giderEkle(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(FINANS_YONETIM_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = giderSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("gider_ekle", {
    p_kategori: v.kategori,
    p_tutar_kurus: v.tutar,
    p_tarih: v.tarih ?? undefined,
    p_tur: v.tur,
    p_tedarikci: v.tedarikci ?? undefined,
    p_aciklama: v.aciklama ?? undefined,
    p_belge_no: v.belge_no ?? undefined,
    p_kdv_orani: v.kdv_orani ?? 0,
    p_vade: v.vade ?? undefined,
    p_odendi: v.durum === "odendi",
    p_yontem: v.durum === "odendi" ? v.yontem : undefined,
    p_banka_hesap_id: v.durum === "odendi" ? v.banka_hesap_id : undefined,
    p_anahtar: v.anahtar,
  });
  if (error) {
    console.error("[giderEkle]", error.code);
    return hata(hataMesajiCoz(error));
  }
  yenile();
  return basari(v.durum === "odendi" ? "Gider kaydedildi." : "Bekleyen gider kaydedildi; ödenince kasa/bankaya yansır.");
}

/** Bekleyen gideri öde. */
export async function giderOde(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(FINANS_YONETIM_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = giderOdeSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("gider_ode", { p_id: v.gider_id, p_yontem: v.yontem, p_banka_hesap_id: v.banka_hesap_id });
  if (error) {
    console.error("[giderOde]", error.code);
    return hata(hataMesajiCoz(error));
  }
  yenile();
  return basari("Gider ödendi olarak işaretlendi.");
}

/** Gider iptali (yalnız yönetici, gerekçe zorunlu). Kayıt silinmez; hesaplara etkisi kalkar. */
export async function giderIptal(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = giderIptalSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { error } = await oturum.supabase.rpc("gider_iptal", { p_id: ayristirma.data.gider_id, p_neden: ayristirma.data.neden });
  if (error) {
    console.error("[giderIptal]", error.code);
    return hata(hataMesajiCoz(error));
  }
  yenile();
  return basari("Gider iptal edildi.");
}

"use server";

import { revalidatePath } from "next/cache";
import { antrenmanAktifSemasi, antrenmanTanimiSemasi, egzersizSemasi, formVerisi, ilkHata } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

const YOL = "/panel/yonetim/antrenman-tanimlari";

/** Antrenman tanımı + adımlarını tek RPC ile oluşturur/günceller (yalnız işletme yöneticisi). `antrenman_id` doluysa günceller. */
export async function antrenmanTanimiKaydet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = antrenmanTanimiSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("antrenman_tanimi_kaydet", {
    p_id: v.antrenman_id ?? null,
    p_ad: v.ad,
    p_aciklama: v.aciklama,
    p_adimlar: v.adimlar.map((a) => ({
      id: a.id ?? null,
      ad: a.ad,
      ekipman: a.ekipman,
      set_sayisi: a.set_sayisi,
      tekrar: a.tekrar,
      sure_dakika: a.sure_dakika,
    })),
  });
  if (error) {
    console.error("[antrenmanTanimiKaydet]", error.code);
    return hata(hataMesajiCoz(error));
  }

  revalidatePath(YOL);
  return basari(v.antrenman_id ? "Antrenman tanımı güncellendi." : "Antrenman tanımı eklendi.");
}

/** Antrenman tanımını pasife alır / yeniden etkinleştirir (silinmez). */
export async function antrenmanAktifDegistir(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = antrenmanAktifSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { data, error } = await oturum.supabase.from("antrenman_program_sablonu").update({ aktif: v.aktif }).eq("id", v.antrenman_id).select("id");
  if (error) {
    console.error("[antrenmanAktifDegistir]", error.code);
    return hata(hataMesajiCoz(error));
  }
  if (!data || data.length === 0) return hata("Antrenman tanımı bulunamadı.");

  revalidatePath(YOL);
  return basari(v.aktif ? "Antrenman tanımı etkinleştirildi." : "Antrenman tanımı pasife alındı.");
}

/** Hareket (egzersiz kütüphanesi) oluştur veya güncelle (yalnız işletme yöneticisi). `egzersiz_id` doluysa günceller. */
export async function egzersizKaydet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = egzersizSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  if (v.egzersiz_id) {
    const { data, error } = await oturum.supabase
      .from("egzersiz_kutuphanesi")
      .update({ ad: v.ad, ekipman: v.ekipman, sure_dakika: v.sure_dakika, aktif: v.aktif })
      .eq("id", v.egzersiz_id)
      .select("id");
    if (error) {
      console.error("[egzersizKaydet:guncelle]", error.code);
      return hata(error.code === "23505" ? "Bu adla bir hareket zaten var." : hataMesajiCoz(error));
    }
    if (!data || data.length === 0) return hata("Hareket bulunamadı.");
  } else {
    const { error } = await oturum.supabase
      .from("egzersiz_kutuphanesi")
      .insert({ isletme_id: oturum.kullanici.isletme_id, ad: v.ad, ekipman: v.ekipman, sure_dakika: v.sure_dakika });
    if (error) {
      console.error("[egzersizKaydet:ekle]", error.code);
      return hata(error.code === "23505" ? "Bu adla bir hareket zaten var." : hataMesajiCoz(error));
    }
  }

  revalidatePath(YOL);
  revalidatePath(`${YOL}/hareketler`);
  return basari(v.egzersiz_id ? "Hareket güncellendi." : "Hareket eklendi.");
}

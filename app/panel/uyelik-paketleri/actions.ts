"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formVerisi, ilkHata, paketSemasi } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

/** Paket oluştur/güncelle (yalnız işletme yöneticisi). `paket_id` doluysa günceller. */
export async function paketKaydet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const girdi = formVerisi(formData);
  const paketId = typeof girdi.paket_id === "string" && girdi.paket_id ? girdi.paket_id : null;
  if (paketId && !z.uuid().safeParse(paketId).success) return hata("Geçersiz paket.");

  const ayristirma = paketSemasi.safeParse(girdi);
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const satir = {
    ad: v.ad,
    tur: v.tur,
    kapsam: v.kapsam,
    sure_gun: v.tur === "sure" ? v.sure_gun : null,
    seans_sayisi: v.tur === "seans" ? v.seans_sayisi : null,
    gecerlilik_gun: v.tur === "seans" ? v.gecerlilik_gun : null,
    fiyat_kurus: v.fiyat,
    kdv_orani: v.kdv_orani,
    dondurma_izni: v.dondurma_izni,
    azami_dondurma_gun: v.dondurma_izni ? (v.azami_dondurma_gun ?? 0) : 0,
    dondurma_ucret_kurus: v.dondurma_izni ? v.dondurma_ucret : 0,
    satis_bitis_tarihi: v.satis_bitis_tarihi,
    aktif: v.aktif,
  };

  if (paketId) {
    const { data, error } = await oturum.supabase.from("uyelik_paketi").update(satir).eq("id", paketId).select("id");
    if (error) {
      console.error("[paketKaydet:guncelle]", error.code);
      return hata(hataMesajiCoz(error));
    }
    if (!data || data.length === 0) return hata("Paket bulunamadı.");
  } else {
    const { error } = await oturum.supabase.from("uyelik_paketi").insert({ ...satir, isletme_id: oturum.kullanici.isletme_id });
    if (error) {
      console.error("[paketKaydet:ekle]", error.code);
      return hata(hataMesajiCoz(error));
    }
  }

  revalidatePath("/panel/uyelik-paketleri");
  return basari(paketId ? "Paket güncellendi." : "Paket oluşturuldu.");
}

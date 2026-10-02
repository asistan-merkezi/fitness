"use server";

import { revalidatePath } from "next/cache";
import { formVerisi, ilkHata, izinDegerlendirSemasi, izinManuelSemasi } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { izinSonucMesaji } from "@/lib/mesaj/olaylar";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

/** İzin talebini onayla / reddet (yalnız işletme yöneticisi). Onayda izinle çakışan planlı ders sayısı bildirilir. */
export async function izinDegerlendir(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = izinDegerlendirSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { data, error } = await oturum.supabase.rpc("izin_talep_degerlendir", {
    p_id: v.izin_id,
    p_onay: v.karar === "onayla",
    p_red_gerekce: v.red_gerekce ?? undefined,
  });
  if (error) {
    console.error("[izinDegerlendir]", error.code);
    return hata(hataMesajiCoz(error));
  }

  await izinSonucMesaji(oturum.kullanici.isletme_id, v.izin_id, v.karar === "onayla");
  revalidatePath("/panel/yonetim/izinler");
  revalidatePath("/panel/izinlerim");
  revalidatePath("/panel/dersler");
  revalidatePath("/panel/finans/personel", "layout");
  if (v.karar === "reddet") return basari("İzin talebi reddedildi.");
  const etkilenen = Number(data ?? 0);
  return basari(etkilenen > 0 ? `İzin onaylandı. Bu tarihlerde ${etkilenen} planlı ders var; Dersler sayfasından yeniden planlayın.` : "İzin onaylandı.");
}

/** Personel adına doğrudan onaylı izin girer (ör. rapor, geçmişe dönük kayıt). */
export async function izinManuelEkle(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = izinManuelSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("izin_manuel_ekle", {
    p_kullanici_id: v.kullanici_id,
    p_tip: v.tip,
    p_baslangic: v.baslangic,
    p_bitis: v.bitis,
    p_gerekce: v.gerekce ?? undefined,
  });
  if (error) {
    console.error("[izinManuelEkle]", error.code);
    return hata(hataMesajiCoz(error));
  }

  revalidatePath("/panel/yonetim/izinler");
  revalidatePath("/panel/dersler");
  revalidatePath("/panel/finans/personel", "layout");
  return basari("İzin kaydedildi.");
}

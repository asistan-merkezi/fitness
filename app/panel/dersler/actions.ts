"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dersDurumSemasi, dersOlusturSemasi, dersTasiSemasi, formVerisi, ilkHata } from "@/lib/dogrulama";
import { formatDateForInput } from "@/lib/datetime";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { kurusTLyazi } from "@/lib/para";
import { dersSonucMesaji } from "@/lib/panel/ders";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

const DURUM_ROLLERI = [...MUSTERI_ROLLERI, "antrenor"] as const;

/** Yeni ders (yalnız yönetici/resepsiyon). Çakışma ve kurallar veritabanında zorlanır; başarıda o günün programına gidilir. */
export async function dersOlustur(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = dersOlusturSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("ders_seansi_olustur", {
    p_musteri_id: v.musteri_id,
    p_antrenor_id: v.antrenor_id,
    p_alan_id: v.alan_id,
    p_baslangic: v.baslangic,
    p_sure_dk: v.sure,
    p_ucret_kurus: v.ucret,
    p_not: v.not,
    p_anahtar: v.anahtar,
  });
  if (error) {
    console.error("[dersOlustur]", error.code);
    return hata(hataMesajiCoz(error));
  }

  revalidatePath("/panel/dersler");
  redirect(`/panel/dersler?gun=${formatDateForInput(v.baslangic)}&ok=olustu`);
}

/** Ders durumu değiştirir; hak düşümü / cari borç veritabanındaki fonksiyonda, ders başına tek sefer işlenir. */
export async function dersDurumuDegistir(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(DURUM_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = dersDurumSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { data, error } = await oturum.supabase.rpc("ders_seansi_durum", {
    p_id: v.ders_id,
    p_durum: v.hedef,
    p_gecikme_dk: v.hedef === "gecikmeli_geldi" ? v.gecikme_dk : null,
  });
  if (error) {
    console.error("[dersDurumuDegistir]", error.code);
    return hata(hataMesajiCoz(error));
  }

  revalidatePath("/panel/dersler");
  revalidatePath("/panel");
  return basari(dersSonucMesaji(data as { yontem?: string | null; kalan_hak?: number | null; tutar_kurus?: number | null } | null, kurusTLyazi));
}

/** Ertele / yeniden planla: aynı ders yeni zamana (istenirse yeni antrenör/alana) taşınır. */
export async function dersTasi(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = dersTasiSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("ders_seansi_tasi", {
    p_id: v.ders_id,
    p_baslangic: v.baslangic,
    p_sure_dk: v.sure ?? undefined,
    p_antrenor_id: v.antrenor_id ?? undefined,
    p_alan_id: v.alan_id ?? undefined,
  });
  if (error) {
    console.error("[dersTasi]", error.code);
    return hata(hataMesajiCoz(error));
  }

  revalidatePath("/panel/dersler");
  return basari("Ders yeni zamana taşındı.");
}

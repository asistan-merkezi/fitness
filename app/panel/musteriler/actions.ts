"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formVerisi, ilkHata, musteriGuncelleSemasi, musteriRpcArgumanlari, musteriSemasi, SAGLIK_BAYRAKLARI } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { ONAM_METIN_SURUMU } from "@/lib/onam-metinleri";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { tcKimlikGecerli } from "@/lib/tc-kimlik";
import { musteriKayitMesaji } from "@/lib/mesaj/olaylar";
import { isimNormalle, telefonE164 } from "@/lib/utils";

type Onceki = EylemSonucu | null;

export async function musteriOlustur(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = musteriSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { data, error } = await oturum.supabase.rpc("musteri_olustur", musteriRpcArgumanlari(ayristirma.data, ONAM_METIN_SURUMU));
  if (error) {
    console.error("[musteriOlustur]", error.code); // kişisel veri loglanmaz
    return hata(hataMesajiCoz(error));
  }

  await musteriKayitMesaji(oturum.kullanici.isletme_id, String(data));
  revalidatePath("/panel/musteriler");
  redirect(`/panel/musteriler/${data}`);
}

export async function musteriGuncelle(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = musteriGuncelleSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { data, error } = await oturum.supabase
    .from("musteri")
    .update({ ad_soyad: v.ad_soyad, telefon: v.telefon, eposta: v.eposta, kategori: v.kategori, not_metni: v.not_metni, aktif: v.aktif })
    .eq("id", v.musteri_id)
    .select("id");
  if (error) {
    console.error("[musteriGuncelle]", error.code);
    return hata(hataMesajiCoz(error));
  }
  if (!data || data.length === 0) return hata("Müşteri bulunamadı veya bu işlem için yetkiniz yok.");

  revalidatePath(`/panel/musteriler/${v.musteri_id}`);
  revalidatePath("/panel/musteriler");
  return basari("Müşteri bilgileri güncellendi.");
}

const hassasSemasi = z.object({
  musteri_id: z.uuid(),
  tc_kimlik_no: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || tcKimlikGecerli(v), "Geçerli bir T.C. kimlik numarası girin.")
    .transform((v) => v || null),
  il: z.string().trim().max(100).optional().transform((v) => v || null),
  ilce: z.string().trim().max(100).optional().transform((v) => v || null),
  mahalle: z.string().trim().max(150).optional().transform((v) => v || null),
  adres_detay: z.string().trim().max(500).optional().transform((v) => v || null),
  acil_durum_ad_soyad: z.string().trim().max(100).optional().transform((v) => (v ? isimNormalle(v) : null)),
  acil_durum_telefon: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || telefonE164(v) !== null, "Geçerli bir telefon numarası girin.")
    .transform((v) => (v ? telefonE164(v) : null)),
  saglik_bayraklari: z.preprocess((v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]), z.array(z.enum(SAGLIK_BAYRAKLARI))).default([]),
  saglik_notu: z.string().trim().max(1000).optional().transform((v) => v || null),
  onay_acik_riza_saglik: z.string().optional().transform((v) => v === "on"),
});

/** Hassas bilgiler (kimlik, adres, acil durum, sağlık). Sağlık verisi için açık rıza gerekir; rıza kaydı eklenir. */
export async function hassasBilgiGuncelle(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = hassasSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  if (Boolean(v.acil_durum_ad_soyad) !== Boolean(v.acil_durum_telefon)) {
    return hata("Acil durum kişisi için ad ve telefon birlikte girilmelidir.");
  }

  const saglikVar = v.saglik_bayraklari.length > 0 || Boolean(v.saglik_notu);
  if (saglikVar && !v.onay_acik_riza_saglik) {
    // Daha önce verilmiş (ve geri alınmamış) rıza var mı?
    const { data: onam } = await oturum.supabase
      .from("musteri_onam")
      .select("verildi")
      .eq("musteri_id", v.musteri_id)
      .eq("tur", "acik_riza_saglik")
      .order("created_at", { ascending: false })
      .limit(1);
    if (!onam?.[0]?.verildi) return hata("Sağlık bilgisi kaydetmek için açık rıza onayı gerekir.");
  }

  const { error } = await oturum.supabase.from("musteri_hassas").upsert(
    {
      musteri_id: v.musteri_id,
      isletme_id: oturum.kullanici.isletme_id,
      tc_kimlik_no: v.tc_kimlik_no,
      il: v.il,
      ilce: v.ilce,
      mahalle: v.mahalle,
      adres_detay: v.adres_detay,
      acil_durum_ad_soyad: v.acil_durum_ad_soyad,
      acil_durum_telefon: v.acil_durum_telefon,
      saglik_bayraklari: v.saglik_bayraklari,
      saglik_notu: v.saglik_notu,
    },
    { onConflict: "musteri_id" }
  );
  if (error) {
    console.error("[hassasBilgiGuncelle]", error.code);
    return hata(hataMesajiCoz(error));
  }

  if (v.onay_acik_riza_saglik) {
    const { error: onamHatasi } = await oturum.supabase.from("musteri_onam").insert({
      musteri_id: v.musteri_id,
      isletme_id: oturum.kullanici.isletme_id,
      tur: "acik_riza_saglik",
      verildi: true,
      metin_versiyonu: ONAM_METIN_SURUMU,
      kaydeden_kullanici_id: oturum.authUser.id,
    });
    if (onamHatasi) console.error("[hassasBilgiGuncelle:onam]", onamHatasi.code);
  }

  revalidatePath(`/panel/musteriler/${v.musteri_id}`);
  return basari("Hassas bilgiler güncellendi.");
}

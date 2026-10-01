"use server";

import { revalidatePath } from "next/cache";
import { aracSemasi, bankaHesabiSemasi, formVerisi, ilkHata, sirketSemasi } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { ibanTemizle } from "@/lib/iban";
import { FINANS_YONETIM_ROLLERI, YONETICI_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

const IZINLI_LOGO_TIPLERI: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };
const EN_FAZLA_LOGO_BAYT = 3 * 1024 * 1024;

/** Şirket bilgileri + logolar (yalnız işletme yöneticisi). Logolar herkese açık 'isletme-logo' kovasına kendi klasörüne yazılır. */
export async function sirketBilgileriKaydet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = sirketSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const guncellenecek: Record<string, string | null> = {
    ad: v.ad,
    unvan: v.unvan,
    il: v.adres_il,
    ilce: v.adres_ilce,
    mahalle: v.adres_mahalle,
    adres: v.adres,
    vergi_dairesi: v.vergi_dairesi,
    vergi_no: v.vergi_no,
    telefon: v.telefon,
    whatsapp_no: v.whatsapp_no,
    eposta: v.eposta,
    yetkili_kisi: v.yetkili_kisi,
    yetkili_telefon: v.yetkili_telefon,
    yetkili_eposta: v.yetkili_eposta,
    hafta_ici_baslangic: v.hafta_ici_baslangic,
    hafta_ici_bitis: v.hafta_ici_bitis,
    cumartesi_baslangic: v.cumartesi_baslangic,
    cumartesi_bitis: v.cumartesi_bitis,
    pazar_baslangic: v.pazar_baslangic,
    pazar_bitis: v.pazar_bitis,
  };

  for (const [alan, dosyaAdi, sutun] of [
    ["logo", "logo", "logo_url"],
    ["logo_koyu", "logo-koyu", "logo_url_koyu"],
  ] as const) {
    const dosya = formData.get(alan);
    if (!(dosya instanceof File) || dosya.size === 0) continue;

    const uzanti = IZINLI_LOGO_TIPLERI[dosya.type];
    if (!uzanti) return hata("Logo PNG, JPG, WEBP veya SVG olmalı.");
    if (dosya.size > EN_FAZLA_LOGO_BAYT) return hata("Logo en fazla 3 MB olabilir.");

    const yol = `${oturum.kullanici.isletme_id}/${dosyaAdi}.${uzanti}`;
    const { error: yuklemeHatasi } = await oturum.supabase.storage.from("isletme-logo").upload(yol, dosya, { upsert: true, contentType: dosya.type });
    if (yuklemeHatasi) {
      console.error("[sirketBilgileriKaydet:logo]", yuklemeHatasi.message);
      return hata("Logo yüklenemedi, lütfen tekrar deneyin.");
    }
    const {
      data: { publicUrl },
    } = oturum.supabase.storage.from("isletme-logo").getPublicUrl(yol);
    // Aynı adla yeniden yazıldığında tarayıcı önbelleğini atlatmak için sürüm parametresi eklenir.
    guncellenecek[sutun] = `${publicUrl}?v=${Date.now()}`;
  }

  const { data, error } = await oturum.supabase.from("isletme").update(guncellenecek).eq("id", oturum.kullanici.isletme_id).select("id");
  if (error) {
    console.error("[sirketBilgileriKaydet]", error.code);
    return hata(hataMesajiCoz(error));
  }
  if (!data || data.length === 0) return hata("İşletme bulunamadı.");

  revalidatePath("/panel", "layout");
  return basari("Şirket bilgileri kaydedildi.");
}

/** Banka hesabı ekle/güncelle (yönetici ve muhasebe). Hesap silinmez, pasife alınır. */
export async function bankaHesabiKaydet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(FINANS_YONETIM_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = bankaHesabiSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const satir = { banka_adi: v.banka_adi, sube: v.sube, hesap_sahibi: v.hesap_sahibi, iban: ibanTemizle(v.iban), hesap_tipi: v.hesap_tipi };

  if (v.hesap_id) {
    const { data, error } = await oturum.supabase.from("isletme_banka_hesabi").update({ ...satir, aktif: v.aktif }).eq("id", v.hesap_id).select("id");
    if (error) {
      console.error("[bankaHesabiKaydet:guncelle]", error.code);
      return hata(error.code === "23505" ? "Bu IBAN zaten kayıtlı." : hataMesajiCoz(error));
    }
    if (!data || data.length === 0) return hata("Hesap bulunamadı.");
  } else {
    const { error } = await oturum.supabase.from("isletme_banka_hesabi").insert({ ...satir, isletme_id: oturum.kullanici.isletme_id });
    if (error) {
      console.error("[bankaHesabiKaydet:ekle]", error.code);
      return hata(error.code === "23505" ? "Bu IBAN zaten kayıtlı." : hataMesajiCoz(error));
    }
  }

  revalidatePath("/panel/ayarlar/sirket-bilgileri");
  return basari(v.hesap_id ? "Hesap güncellendi." : "Hesap eklendi.");
}

/** Araç ekle/güncelle (yalnız işletme yöneticisi). Araç silinmez, pasife alınır (gider kayıtları araca bağlı kalabilir). */
export async function aracKaydet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = aracSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const satir = { marka: v.marka, model: v.model, plaka: v.plaka };

  if (v.arac_id) {
    const { data, error } = await oturum.supabase.from("isletme_arac").update({ ...satir, aktif: v.aktif }).eq("id", v.arac_id).select("id");
    if (error) {
      console.error("[aracKaydet:guncelle]", error.code);
      return hata(error.code === "23505" ? "Bu plaka zaten kayıtlı." : hataMesajiCoz(error));
    }
    if (!data || data.length === 0) return hata("Araç bulunamadı.");
  } else {
    const { error } = await oturum.supabase.from("isletme_arac").insert({ ...satir, isletme_id: oturum.kullanici.isletme_id });
    if (error) {
      console.error("[aracKaydet:ekle]", error.code);
      return hata(error.code === "23505" ? "Bu plaka zaten kayıtlı." : hataMesajiCoz(error));
    }
  }

  revalidatePath("/panel/ayarlar/sirket-bilgileri");
  revalidatePath("/panel/finans/giderler", "layout");
  return basari(v.arac_id ? "Araç güncellendi." : "Araç eklendi.");
}

"use server";

import { revalidatePath } from "next/cache";
import { dondurSemasi, formVerisi, iadeSemasi, ilkHata, odemeSemasi, satisSemasi, uyelikIslemSemasi } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { odemeMesaji, uyelikSatisMesaji } from "@/lib/mesaj/olaylar";
import { FINANS_ROLLERI, MUSTERI_ROLLERI, YONETICI_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

function yenile(musteriId: string | undefined) {
  if (musteriId) revalidatePath(`/panel/musteriler/${musteriId}`);
  revalidatePath("/panel");
  revalidatePath("/panel/kasa");
  revalidatePath("/panel/uyelik-paketleri");
}

/** Üyelik satışı: üyelik + borç (+ ilk tahsilat) tek veritabanı işleminde; idempotent. */
export async function satisYap(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = satisSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { data: uyelikId, error } = await oturum.supabase.rpc("uyelik_sat", {
    p_musteri_id: v.musteri_id,
    p_paket_id: v.paket_id,
    p_baslangic: v.baslangic,
    p_iskonto_kurus: v.iskonto,
    p_odeme_kurus: v.odeme,
    p_odeme_yontemi: v.odeme_yontemi ?? null,
    p_anahtar: v.anahtar,
  });
  if (error) {
    console.error("[satisYap]", error.code);
    return hata(hataMesajiCoz(error));
  }
  if (uyelikId) await uyelikSatisMesaji(oturum.kullanici.isletme_id, String(uyelikId));
  yenile(v.musteri_id);
  return basari("Üyelik satışı kaydedildi.");
}

/** Tahsilat (ödeme) kaydı. Defter değişmezdir; yanlış kayıt yeni (ters) kayıtla düzeltilir. */
export async function odemeAl(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(FINANS_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = odemeSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("hareket_ekle", {
    p_musteri_id: v.musteri_id,
    p_tur: "odeme",
    p_tutar_kurus: v.tutar,
    p_yontem: v.yontem,
    p_aciklama: v.aciklama,
    p_anahtar: v.anahtar,
    p_banka_hesap_id: v.banka_hesap_id,
  });
  if (error) {
    console.error("[odemeAl]", error.code);
    return hata(hataMesajiCoz(error));
  }
  await odemeMesaji(oturum.kullanici.isletme_id, v.musteri_id, v.tutar, v.yontem, v.anahtar);
  yenile(v.musteri_id);
  return basari("Ödeme kaydedildi.");
}

/** İade: yalnızca işletme yöneticisi; bir ödemeye bağlıdır, toplam iade ödemeyi aşamaz. */
export async function iadeYap(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = iadeSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("hareket_ekle", {
    p_musteri_id: v.musteri_id,
    p_tur: "iade",
    p_tutar_kurus: v.tutar,
    p_yontem: v.yontem,
    p_aciklama: v.aciklama,
    p_iade_edilen_hareket_id: v.iade_edilen_hareket_id,
    p_anahtar: v.anahtar,
    p_banka_hesap_id: v.banka_hesap_id,
  });
  if (error) {
    console.error("[iadeYap]", error.code);
    return hata(hataMesajiCoz(error));
  }
  yenile(v.musteri_id);
  return basari("İade kaydedildi.");
}

export async function uyelikDondur(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = dondurSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { error } = await oturum.supabase.rpc("uyelik_dondur", { p_uyelik_id: ayristirma.data.uyelik_id, p_gun: ayristirma.data.gun });
  if (error) {
    console.error("[uyelikDondur]", error.code);
    return hata(hataMesajiCoz(error));
  }
  yenile(String(formData.get("musteri_id") ?? ""));
  return basari(`Üyelik ${ayristirma.data.gun} gün donduruldu; bitiş tarihi uzatıldı.`);
}

export async function dondurmayiBitir(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = uyelikIslemSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { data, error } = await oturum.supabase.rpc("uyelik_dondurmayi_bitir", { p_uyelik_id: ayristirma.data.uyelik_id });
  if (error) {
    console.error("[dondurmayiBitir]", error.code);
    return hata(hataMesajiCoz(error));
  }
  yenile(String(formData.get("musteri_id") ?? ""));
  return basari(`Dondurma bitirildi; kullanılmayan ${data ?? 0} gün bitiş tarihinden düşüldü.`);
}

/** İptal: yalnızca işletme yöneticisi. Para iadesi YAPMAZ; gerekirse ayrıca iade kaydı girilir. */
export async function uyelikIptal(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = uyelikIslemSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { error } = await oturum.supabase.rpc("uyelik_iptal", { p_uyelik_id: ayristirma.data.uyelik_id, p_neden: ayristirma.data.neden });
  if (error) {
    console.error("[uyelikIptal]", error.code);
    return hata(hataMesajiCoz(error));
  }
  yenile(String(formData.get("musteri_id") ?? ""));
  return basari("Üyelik iptal edildi. Para iadesi gerekiyorsa ayrıca iade kaydı girin.");
}

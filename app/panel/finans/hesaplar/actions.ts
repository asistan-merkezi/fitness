"use server";

import { revalidatePath } from "next/cache";
import { acilisBakiyeSemasi, formVerisi, ilkHata, kasaBankaHareketSemasi } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

function yenile() {
  revalidatePath("/panel/kasa");
  revalidatePath("/panel/finans/banka");
  revalidatePath("/panel/finans/kredi-karti");
  revalidatePath("/panel/finans/raporlar");
}

/** Hesap seçimi "kasa" veya banka hesabı UUID'sidir. */
const kasaMi = (h: string) => h === "kasa";

/** Kasa/banka manuel hareketi: giren, çıkan veya hesaplar arası transfer (yalnız işletme yöneticisi). Defter değişmez; düzeltme ters kayıtladır. */
export async function manuelHareketEkle(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = kasaBankaHareketSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("kasa_banka_hareket_ekle", {
    p_tip: v.tip,
    p_tutar_kurus: v.tutar,
    p_kasa: kasaMi(v.hesap),
    p_banka_hesap_id: kasaMi(v.hesap) ? undefined : v.hesap,
    p_hedef_kasa: v.tip === "transfer" && v.hedef ? kasaMi(v.hedef) : false,
    p_hedef_banka_hesap_id: v.tip === "transfer" && v.hedef && !kasaMi(v.hedef) ? v.hedef : undefined,
    p_karsi_taraf: v.karsi_taraf ?? undefined,
    p_aciklama: v.aciklama ?? undefined,
    p_tarih: v.tarih ?? undefined,
    p_anahtar: v.anahtar,
    p_karsi_banka: v.karsi_banka ?? undefined,
    p_karsi_iban: v.karsi_iban ?? undefined,
  });
  if (error) {
    console.error("[manuelHareketEkle]", error.code);
    return hata(hataMesajiCoz(error));
  }
  yenile();
  return basari(v.tip === "transfer" ? "Transfer kaydedildi." : v.tip === "giren" ? "Giriş kaydedildi." : "Çıkış kaydedildi.");
}

/** Kasa veya banka hesabının açılış bakiyesi (yalnız işletme yöneticisi). Eksi değer (kredili hesap) girilebilir. */
export async function acilisBakiyeKaydet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = acilisBakiyeSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { data, error } = kasaMi(v.hesap)
    ? await oturum.supabase.from("isletme").update({ kasa_acilis_kurus: v.tutar }).eq("id", oturum.kullanici.isletme_id).select("id")
    : await oturum.supabase.from("isletme_banka_hesabi").update({ acilis_bakiye_kurus: v.tutar }).eq("id", v.hesap).select("id");
  if (error) {
    console.error("[acilisBakiyeKaydet]", error.code);
    return hata(hataMesajiCoz(error));
  }
  if (!data || data.length === 0) return hata("Hesap bulunamadı.");
  yenile();
  return basari("Açılış bakiyesi kaydedildi.");
}

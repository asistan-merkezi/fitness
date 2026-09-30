"use server";

import { revalidatePath } from "next/cache";
import { formVerisi, girisSemasi, ilkHata } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { hakAzaldiMesaji } from "@/lib/mesaj/olaylar";
import { RED_NEDENLERI } from "@/lib/panel/etiketler";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import type { CheckInSonucu } from "@/types/veritabani";

type Onceki = EylemSonucu | null;

/** Resepsiyon check-in. Sonuç mesaj olarak döner: kabul (başarılı) veya red (nedenle). */
export async function checkInYap(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = girisSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { data, error } = await oturum.supabase.rpc("check_in", { p_musteri_id: ayristirma.data.musteri_id, p_kaynak: "resepsiyon" });
  if (error) {
    console.error("[checkInYap]", error.code);
    return hata(hataMesajiCoz(error));
  }

  const sonuc = data as CheckInSonucu;
  revalidatePath("/panel/check-in");
  revalidatePath("/panel");

  if (sonuc.sonuc === "red") {
    return hata(`Giriş reddedildi: ${RED_NEDENLERI[sonuc.red_nedeni ?? ""] ?? "üyelik geçerli değil"}.`);
  }
  if (!sonuc.zaten_giris) await hakAzaldiMesaji(oturum.kullanici.isletme_id, sonuc.uyelik_id, sonuc.kalan_hak);
  const hak = sonuc.kalan_hak !== null && sonuc.kalan_hak !== undefined ? ` Kalan hak: ${sonuc.kalan_hak}.` : "";
  const uyari = sonuc.uyari ? " ⚠ Paket bitmek üzere, yenileme hatırlatın." : "";
  const tekrar = sonuc.zaten_giris ? " (bugün zaten giriş yapılmıştı)" : "";
  return basari(`Giriş kabul edildi${tekrar}.${hak}${uyari}`);
}

export async function checkInIptal(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const girisId = String(formData.get("giris_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(girisId)) return hata("Geçersiz giriş kaydı.");

  const { error } = await oturum.supabase.rpc("check_in_iptal", { p_giris_id: girisId });
  if (error) {
    console.error("[checkInIptal]", error.code);
    return hata(hataMesajiCoz(error));
  }
  revalidatePath("/panel/check-in");
  revalidatePath("/panel");
  return basari("Giriş iptal edildi; seans hakkı geri verildi.");
}

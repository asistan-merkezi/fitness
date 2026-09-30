"use server";

import { anketSemasi, formVerisi, ilkHata } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata } from "@/lib/eylem";
import { HIZ_SINIRI_MESAJI, hizSiniriTuket, ipAnahtari, isletmeAnahtari } from "@/lib/qr/hiz-siniri";
import { isletmeQrBilgisiGetir, qrKoduAktifMi } from "@/lib/qr/isletme-bilgisi";
import { createAdminClient } from "@/lib/supabase/admin";

type Onceki = EylemSonucu | null;

const BASARI_MESAJI = "Geri bildiriminiz için teşekkür ederiz.";

/** Herkese açık anket yanıtı. Oturum yoktur; bot tuzağı, doğrulama, QR aktif mi ve hız sınırı (IP 10/10 dk, işletme 1000/gün) uygulanır. */
export async function anketGonder(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const girdi = formVerisi(formData);
  if (typeof girdi.website === "string" && girdi.website.trim() !== "") return basari(BASARI_MESAJI);

  const ayristirma = anketSemasi.safeParse(girdi);
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const isletme = await isletmeQrBilgisiGetir(String(girdi.kisa_kod ?? ""));
  if (!isletme) return hata("Bu form geçerli değil.");
  if (!(await qrKoduAktifMi(isletme.id, "anket"))) return hata("Bu anket şu anda kapalı.");

  const izinli = await hizSiniriTuket([
    { anahtar: await ipAnahtari("anket"), limit: 10, pencereSn: 600 },
    { anahtar: isletmeAnahtari("anket", isletme.id), limit: 1000, pencereSn: 86400 },
  ]);
  if (!izinli) return hata(HIZ_SINIRI_MESAJI);

  const { error } = await createAdminClient().from("anket_yaniti").insert({
    isletme_id: isletme.id,
    puan: v.puan,
    oneri: v.oneri,
    ad_soyad: v.ad_soyad,
    telefon: v.telefon,
  });
  if (error) {
    console.error("[anketGonder]", error.code);
    return hata("Yanıtınız alınamadı, lütfen daha sonra tekrar deneyin.");
  }
  return basari(BASARI_MESAJI);
}

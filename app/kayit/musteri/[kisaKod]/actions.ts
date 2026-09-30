"use server";

import { formVerisi, ilkHata, onKayitSemasi } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata } from "@/lib/eylem";
import { ONAM_METIN_SURUMU } from "@/lib/onam-metinleri";
import { HIZ_SINIRI_MESAJI, hizSiniriTuket, ipAnahtari, isletmeAnahtari } from "@/lib/qr/hiz-siniri";
import { isletmeQrBilgisiGetir, qrKoduAktifMi } from "@/lib/qr/isletme-bilgisi";
import { createAdminClient } from "@/lib/supabase/admin";

type Onceki = EylemSonucu | null;

const BASARI_MESAJI = "Ön kaydınız alındı. Resepsiyon en kısa sürede sizinle ilgilenecek.";

/**
 * Herkese açık müşteri ön kaydı. Oturum yoktur: güvenlik katmanları sırayla — bot tuzağı, girdi doğrulama, işletme çözümü,
 * QR aktif mi, hız sınırı (IP 10/10 dk, işletme 300/gün). Kayıt müşteri AÇMAZ; onay bekleyen kuyruğa yazılır.
 * Aynı telefondan bekleyen kayıt varsa ikinci kayıt açılmaz ama kullanıcıya aynı başarı mesajı gösterilir (bilgi sızdırmaz).
 */
export async function onKayitGonder(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const girdi = formVerisi(formData);

  // Bot tuzağı: gizli alan doluysa sessizce başarılı say, hiçbir şey kaydetme.
  if (typeof girdi.website === "string" && girdi.website.trim() !== "") return basari(BASARI_MESAJI);

  const ayristirma = onKayitSemasi.safeParse(girdi);
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const isletme = await isletmeQrBilgisiGetir(String(girdi.kisa_kod ?? ""));
  if (!isletme) return hata("Bu form geçerli değil.");
  if (!(await qrKoduAktifMi(isletme.id, "musteri_on_kayit"))) return hata("Bu form şu anda kapalı. Lütfen resepsiyon ile iletişime geçin.");

  const izinli = await hizSiniriTuket([
    { anahtar: await ipAnahtari("on-kayit"), limit: 10, pencereSn: 600 },
    { anahtar: isletmeAnahtari("on-kayit", isletme.id), limit: 300, pencereSn: 86400 },
  ]);
  if (!izinli) return hata(HIZ_SINIRI_MESAJI);

  const { error } = await createAdminClient().from("musteri_on_kayit").insert({
    isletme_id: isletme.id,
    ad_soyad: v.ad_soyad,
    telefon: v.telefon,
    eposta: v.eposta,
    dogum_tarihi: v.dogum_tarihi,
    kvkk_aydinlatma_verildi: true,
    ticari_ileti_izni: v.ticari,
    metin_versiyonu: ONAM_METIN_SURUMU,
  });
  // 23505: aynı telefondan bekleyen kayıt var (beklenen; aynı mesajla yanıtlanır).
  if (error && error.code !== "23505") {
    console.error("[onKayitGonder]", error.code);
    return hata("Kaydınız alınamadı, lütfen daha sonra tekrar deneyin.");
  }
  return basari(BASARI_MESAJI);
}

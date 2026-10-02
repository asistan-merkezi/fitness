"use server";

import { formVerisi, ilkHata, isBasvurusuSemasi } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata } from "@/lib/eylem";
import { ONAM_METIN_SURUMU } from "@/lib/onam-metinleri";
import { HIZ_SINIRI_MESAJI, hizSiniriTuket, ipAnahtari, isletmeAnahtari } from "@/lib/qr/hiz-siniri";
import { isletmeQrBilgisiGetir, qrKoduAktifMi } from "@/lib/qr/isletme-bilgisi";
import { createAdminClient } from "@/lib/supabase/admin";
import { resitDegilMi } from "@/lib/utils";

type Onceki = EylemSonucu | null;

const BASARI_MESAJI = "Başvurunuz alındı. Değerlendirme sonrası sizinle iletişime geçilecektir.";

/**
 * Herkese açık iş başvurusu. Oturum yoktur: bot tuzağı → girdi doğrulama → işletme çözümü → QR aktif mi → hız sınırı (IP 5/10 dk,
 * işletme 100/gün). Başvuru personel AÇMAZ; yönetici incelemesini bekleyen kuyruğa yazılır. Aynı telefondan bekleyen başvuru varsa
 * ikinci kayıt açılmaz ama aynı başarı mesajı gösterilir (bilgi sızdırmaz).
 */
export async function isBasvurusuGonder(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const girdi = formVerisi(formData);

  if (typeof girdi.website === "string" && girdi.website.trim() !== "") return basari(BASARI_MESAJI);

  const ayristirma = isBasvurusuSemasi.safeParse(girdi);
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;
  if (v.dogum_tarihi && resitDegilMi(v.dogum_tarihi)) return hata("18 yaşından küçükler başvuru yapamaz.");

  const isletme = await isletmeQrBilgisiGetir(String(girdi.kisa_kod ?? ""));
  if (!isletme) return hata("Bu form geçerli değil.");
  if (!(await qrKoduAktifMi(isletme.id, "is_basvurusu"))) return hata("Bu form şu anda kapalı.");

  const izinli = await hizSiniriTuket([
    { anahtar: await ipAnahtari("is-basvurusu"), limit: 5, pencereSn: 600 },
    { anahtar: isletmeAnahtari("is-basvurusu", isletme.id), limit: 100, pencereSn: 86400 },
  ]);
  if (!izinli) return hata(HIZ_SINIRI_MESAJI);

  const { error } = await createAdminClient().from("is_basvurusu").insert({
    isletme_id: isletme.id,
    ad_soyad: v.ad_soyad,
    telefon: v.telefon,
    eposta: v.eposta,
    dogum_tarihi: v.dogum_tarihi,
    basvurulan_pozisyon: v.basvurulan_pozisyon,
    deneyim: v.deneyim,
    sertifikalar: v.sertifikalar,
    kvkk_aydinlatma_verildi: true,
    metin_versiyonu: ONAM_METIN_SURUMU,
  });
  // 23505: aynı telefondan bekleyen başvuru var (beklenen; aynı mesajla yanıtlanır).
  if (error && error.code !== "23505") {
    console.error("[isBasvurusuGonder]", error.code);
    return hata("Başvurunuz alınamadı, lütfen daha sonra tekrar deneyin.");
  }
  return basari(BASARI_MESAJI);
}

import type { Metadata } from "next";
import { KamuFormBulunamadi, KamuFormKarti } from "@/components/kamu/kamu-form-karti";
import { ONAM_METINLERI } from "@/lib/onam-metinleri";
import { isletmeQrBilgisiGetir, qrKoduAktifMi } from "@/lib/qr/isletme-bilgisi";
import { BasvuruFormu } from "./basvuru-formu";

export const metadata: Metadata = { title: "İş Başvurusu", robots: { index: false, follow: false } };

/** Herkese açık iş başvuru formu (QR/bağlantı). Başvuru personel açmaz; yönetici incelemesine düşer. */
export default async function IsBasvurusuSayfasi({ params }: { params: Promise<{ kisaKod: string }> }) {
  const { kisaKod } = await params;
  const isletme = await isletmeQrBilgisiGetir(kisaKod);
  if (!isletme) return <KamuFormBulunamadi />;

  if (!(await qrKoduAktifMi(isletme.id, "is_basvurusu"))) {
    return (
      <KamuFormKarti isletmeAdi={isletme.ad} baslik="Başvurular Kapalı" aciklama="Bu form şu anda geçici olarak kapatılmış.">
        <p className="text-sm text-muted-foreground">Güncel durum için lütfen işletmeyle iletişime geçin.</p>
      </KamuFormKarti>
    );
  }

  return (
    <KamuFormKarti isletmeAdi={isletme.ad} baslik="İş Başvurusu" aciklama="Bilgilerinizi bırakın; başvurunuz değerlendirildikten sonra sizinle iletişime geçilecektir.">
      <BasvuruFormu kisaKod={kisaKod} kvkkMetni={ONAM_METINLERI.kvkk_aydinlatma.metin} />
    </KamuFormKarti>
  );
}

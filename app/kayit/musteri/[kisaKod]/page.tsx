import type { Metadata } from "next";
import { KamuFormBulunamadi, KamuFormKarti } from "@/components/kamu/kamu-form-karti";
import { ONAM_METINLERI } from "@/lib/onam-metinleri";
import { isletmeQrBilgisiGetir, qrKoduAktifMi } from "@/lib/qr/isletme-bilgisi";
import { OnKayitFormu } from "./on-kayit-formu";

export const metadata: Metadata = { title: "Ön Kayıt", robots: { index: false, follow: false } };

export default async function MusteriOnKayitSayfasi({ params }: { params: Promise<{ kisaKod: string }> }) {
  const { kisaKod } = await params;
  const isletme = await isletmeQrBilgisiGetir(kisaKod);
  if (!isletme) return <KamuFormBulunamadi />;

  if (!(await qrKoduAktifMi(isletme.id, "musteri_on_kayit"))) {
    return (
      <KamuFormKarti isletmeAdi={isletme.ad} baslik="Kullanım Dışı" aciklama="Bu form şu anda geçici olarak kapatılmış.">
        <p className="text-sm text-muted-foreground">Lütfen resepsiyon ile iletişime geçin.</p>
      </KamuFormKarti>
    );
  }

  return (
    <KamuFormKarti isletmeAdi={isletme.ad} baslik="Müşteri Ön Kayıt" aciklama="Bilgilerinizi bırakın, resepsiyonda sizi karşılayalım.">
      <OnKayitFormu kisaKod={kisaKod} kvkkMetni={ONAM_METINLERI.kvkk_aydinlatma.metin} />
    </KamuFormKarti>
  );
}

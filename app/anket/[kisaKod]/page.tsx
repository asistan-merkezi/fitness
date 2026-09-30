import type { Metadata } from "next";
import { KamuFormBulunamadi, KamuFormKarti } from "@/components/kamu/kamu-form-karti";
import { isletmeQrBilgisiGetir, qrKoduAktifMi } from "@/lib/qr/isletme-bilgisi";
import { AnketFormu } from "./anket-formu";

export const metadata: Metadata = { title: "Anket ve Öneriler", robots: { index: false, follow: false } };

export default async function AnketSayfasi({ params }: { params: Promise<{ kisaKod: string }> }) {
  const { kisaKod } = await params;
  const isletme = await isletmeQrBilgisiGetir(kisaKod);
  if (!isletme) return <KamuFormBulunamadi />;

  if (!(await qrKoduAktifMi(isletme.id, "anket"))) {
    return (
      <KamuFormKarti isletmeAdi={isletme.ad} baslik="Kullanım Dışı" aciklama="Bu anket şu anda geçici olarak kapatılmış.">
        <p className="text-sm text-muted-foreground">Görüşleriniz için resepsiyona başvurabilirsiniz.</p>
      </KamuFormKarti>
    );
  }

  return (
    <KamuFormKarti isletmeAdi={isletme.ad} baslik="Anket ve Öneriler" aciklama="Deneyiminizi bizimle paylaşın; görüşleriniz hizmetimizi geliştirir.">
      <AnketFormu kisaKod={kisaKod} />
    </KamuFormKarti>
  );
}

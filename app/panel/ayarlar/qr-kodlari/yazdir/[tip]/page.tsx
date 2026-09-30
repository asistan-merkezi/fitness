import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { qrPngUret } from "@/components/panel/qr-kart";
import { YazdirDugmesi } from "@/components/panel/yazdir-dugmesi";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { siteKoku } from "@/lib/qr/isletme-bilgisi";
import { QR_KOD_TANIMLARI } from "@/lib/qr/qr-kod-tanimlari";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "QR Yazdır" };

/** Afiş olarak yazdırılacak sade sayfa: büyük QR, başlık ve işletme adı. Panel kabuğu yazdırmada gizlenir (globals.css). */
export default async function QrYazdirSayfasi({ params }: { params: Promise<{ tip: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(YONETICI_ROLLERI);
  const { tip } = await params;
  const tanim = QR_KOD_TANIMLARI.find((t) => t.tip === tip && t.hazir);
  if (!tanim) notFound();

  const supabase = await createClient();
  const { data: isletme } = await supabase.from("isletme").select("ad, qr_kisa_kod").eq("id", kullanici.isletme_id).maybeSingle<{ ad: string; qr_kisa_kod: string }>();
  if (!isletme) notFound();

  const png = await qrPngUret(`${await siteKoku()}${tanim.yol(isletme.qr_kisa_kod)}`, 1000);

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="yazdirma-gizle">
        <YazdirDugmesi />
      </div>
      <p className="text-lg font-semibold">{isletme.ad}</p>
      <h1 className="text-4xl font-extrabold tracking-tight">{tanim.baslik}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={png} alt={`${tanim.baslik} QR kodu`} className="size-[420px] max-w-full rounded-xl border border-border bg-white p-2" />
      <p className="max-w-md text-base text-muted-foreground">Telefonunuzun kamerasıyla kodu okutun.</p>
    </div>
  );
}

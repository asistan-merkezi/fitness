import Link from "next/link";
import QRCode from "qrcode";
import { Download, ExternalLink, Printer } from "lucide-react";
import { KopyalaDugmesi } from "@/components/panel/kopyala-dugmesi";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { QrKodTanimi } from "@/lib/qr/qr-kod-tanimlari";
import { qrAktifAyarla } from "@/app/panel/ayarlar/qr-kodlari/actions";

/** Yazdırma ve ekran için yüksek çözünürlüklü, beyaz zeminli QR (PNG, veri adresi olarak gömülür). */
export async function qrPngUret(url: string, genislik = 720): Promise<string> {
  return QRCode.toDataURL(url, { width: genislik, margin: 2, errorCorrectionLevel: "M", color: { dark: "#121316", light: "#ffffff" } });
}

/** Bir QR kodunun yönetim kartı: önizleme, indirme, yazdırma, bağlantıyı kopyalama ve aç/kapa anahtarı. */
export async function QrKarti({ tanim, kisaKod, koku, aktif, ikon }: { tanim: QrKodTanimi; kisaKod: string; koku: string; aktif: boolean; ikon: React.ReactNode }) {
  const url = `${koku}${tanim.yol(kisaKod)}`;
  const png = tanim.hazir ? await qrPngUret(url) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/14 text-primary">{ikon}</span>
          {tanim.baslik}
          {tanim.hazir ? <StatusBadge tone={aktif ? "emerald" : "slate"}>{aktif ? "Aktif" : "Kapalı"}</StatusBadge> : <StatusBadge tone="slate">Yakında</StatusBadge>}
        </CardTitle>
        <CardDescription>{tanim.aciklama}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {png ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={png} alt={`${tanim.baslik} QR kodu`} width={168} height={168} className="size-42 shrink-0 rounded-lg border border-border bg-white p-1" />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <p className="font-mono text-xs break-all text-muted-foreground">{url}</p>
              <div className="flex flex-wrap gap-2">
                <a href={png} download={`${tanim.dosyaAdi}.png`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <Download aria-hidden /> PNG indir
                </a>
                <Link href={`/panel/ayarlar/qr-kodlari/yazdir/${tanim.tip}`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <Printer aria-hidden /> Yazdır
                </Link>
                <KopyalaDugmesi metin={url} etiket="Bağlantıyı kopyala" />
                <a href={url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <ExternalLink aria-hidden /> Aç
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <form action={qrAktifAyarla}>
                  <input type="hidden" name="tip" value={tanim.tip} />
                  {!aktif && <input type="hidden" name="aktif" value="on" />}
                  <button type="submit" className="text-sm font-semibold text-primary hover:underline">
                    {aktif ? "Formu kapat (pasife al)" : "Formu yeniden aç"}
                  </button>
                </form>
                {tanim.goruntuleHref && (
                  <Link href={tanim.goruntuleHref} className="text-sm font-semibold text-primary hover:underline">
                    {tanim.goruntuleEtiket ?? "Görüntüle"}
                  </Link>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{tanim.hazirDegilNotu}</p>
        )}
      </CardContent>
    </Card>
  );
}

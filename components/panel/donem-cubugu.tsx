import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import type { Donem } from "@/lib/donem";
import { cn } from "@/lib/utils";

const ETIKETLER: Record<Donem["gorunum"], string> = { gun: "Günlük", ay: "Aylık", yil: "Yıllık" };

/** Görünüm değişince aynı dönemde kalır: gün→ay→yıl geçişlerinde param kısaltılır/uzatılır. */
function tarihParami(d: Donem, yeni: Donem["gorunum"]): string {
  const p = d.param;
  if (yeni === "gun") return d.gorunum === "gun" ? p : d.gorunum === "ay" ? `${p}-01` : `${p}-01-01`;
  if (yeni === "ay") return d.gorunum === "yil" ? `${p}-01` : p.slice(0, 7);
  return p.slice(0, 4);
}

/**
 * Kasa / Banka / Kredi Kartı ekranlarının ortak dönem çubuğu: Günlük-Aylık-Yıllık anahtarı, önceki/sonraki, "Bugüne dön".
 * URL: `?gorunum=gun|ay|yil&tarih=...` (+ `ek`: sayfaya özgü ek parametreler, ör. `hesap=...`).
 */
export function DonemCubugu({ yol, donem, gorunumler = ["gun", "ay", "yil"], ek = "" }: { yol: string; donem: Donem; gorunumler?: Donem["gorunum"][]; ek?: string }) {
  const bugun = bugunIstanbulTarihi();
  const ekParam = ek ? `&${ek}` : "";
  const baglanti = (g: Donem["gorunum"], tarih: string) => `${yol}?gorunum=${g}&tarih=${tarih}${ekParam}`;
  const bugunParami = donem.gorunum === "gun" ? bugun : donem.gorunum === "ay" ? bugun.slice(0, 7) : bugun.slice(0, 4);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-lg border border-border p-1" role="group" aria-label="Görünüm">
        {gorunumler.map((g) => (
          <Link key={g} href={baglanti(g, tarihParami(donem, g))} aria-current={donem.gorunum === g ? "true" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", donem.gorunum === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-3")}>
            {ETIKETLER[g]}
          </Link>
        ))}
      </div>
      <Link href={baglanti(donem.gorunum, donem.oncekiParam)} aria-label="Önceki dönem" className={buttonVariants({ variant: "outline", size: "icon" })}>
        <ChevronLeft aria-hidden />
      </Link>
      <Link href={baglanti(donem.gorunum, donem.sonrakiParam)} aria-label="Sonraki dönem" className={buttonVariants({ variant: "outline", size: "icon" })}>
        <ChevronRight aria-hidden />
      </Link>
      <Link href={baglanti(donem.gorunum, bugunParami)} className="text-sm font-semibold text-primary hover:underline">
        Bugüne dön
      </Link>
    </div>
  );
}

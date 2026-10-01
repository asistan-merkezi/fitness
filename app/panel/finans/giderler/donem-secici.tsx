import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import type { Donem } from "@/lib/donem";
import { cn } from "@/lib/utils";

/** Aylık / Yıllık görünüm anahtarı + önceki/sonraki gezinme (URL: ?gorunum=ay|yil&donem=YYYY-MM|YYYY). */
export function DonemSecici({ yol, donem }: { yol: string; donem: Donem }) {
  const yil = donem.param.slice(0, 4);
  const bugun = bugunIstanbulTarihi();
  const aylik = donem.gorunum === "ay";
  const aylikParam = aylik ? donem.param : `${yil}-${yil === bugun.slice(0, 4) ? bugun.slice(5, 7) : "01"}`;
  const baglanti = (gorunum: "ay" | "yil", param: string) => `${yol}?gorunum=${gorunum}&donem=${param}`;
  const birim = aylik ? "ay" : "yıl";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1 rounded-xl border border-border bg-surface-2 p-1" role="group" aria-label="Dönem türü">
        <Link href={baglanti("ay", aylikParam)} aria-current={aylik ? "true" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", aylik ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-3")}>
          Aylık
        </Link>
        <Link href={baglanti("yil", yil)} aria-current={!aylik ? "true" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", !aylik ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-3")}>
          Yıllık
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <Link href={baglanti(donem.gorunum === "yil" ? "yil" : "ay", donem.oncekiParam)} aria-label={`Önceki ${birim}`} className={buttonVariants({ variant: "outline", size: "icon-sm" })}>
          <ChevronLeft aria-hidden />
        </Link>
        <span className="min-w-32 text-center text-sm font-medium capitalize">{donem.etiket}</span>
        <Link href={baglanti(donem.gorunum === "yil" ? "yil" : "ay", donem.sonrakiParam)} aria-label={`Sonraki ${birim}`} className={buttonVariants({ variant: "outline", size: "icon-sm" })}>
          <ChevronRight aria-hidden />
        </Link>
      </div>
    </div>
  );
}

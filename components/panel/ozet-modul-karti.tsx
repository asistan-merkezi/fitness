import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { IconTile, type IconTileTone } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";

/** Müşteri kartındaki bölüm kartı (klinik hasta dosyasındaki ModuleCard düzeni): renkli ikon, başlık, tek satır özet, eksik uyarı noktası. */
export function OzetModulKarti({
  href,
  etiket,
  ozet,
  ikon,
  ton,
  ozetTonu,
  uyari = false,
  yakinda = false,
  className,
}: {
  href: string;
  etiket: string;
  ozet?: string;
  ikon: LucideIcon;
  ton: IconTileTone;
  ozetTonu?: "emerald" | "rose";
  uyari?: boolean;
  yakinda?: boolean;
  className?: string;
}) {
  const sinif = cn("flex h-full min-h-28 flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left", className);
  const icerik = (
    <>
      <div className="flex w-full items-center justify-between">
        <IconTile icon={ikon} tone={yakinda ? "neutral" : ton} />
        {uyari && <span className="size-2 rounded-full bg-amber-500" role="img" aria-label="Eksik bilgi" />}
      </div>
      <span className="text-sm font-semibold text-card-foreground">{etiket}</span>
      {(ozet || yakinda) && (
        <span className={cn("text-xs text-muted-foreground", ozetTonu === "emerald" && "text-success", ozetTonu === "rose" && "text-destructive")}>{yakinda ? "Yakında" : ozet}</span>
      )}
    </>
  );
  if (yakinda) {
    return (
      <div aria-disabled="true" className={cn(sinif, "opacity-60")}>
        {icerik}
      </div>
    );
  }
  return (
    <Link href={href} className={cn(sinif, "shadow-z1 transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30")}>
      {icerik}
    </Link>
  );
}

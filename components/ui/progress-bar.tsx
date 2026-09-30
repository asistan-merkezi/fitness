import * as React from "react";
import { cn } from "@/lib/utils";

/** İlerleme çubuğu: marka renkli dolgu, yüzey-3 iz. `ton="uyari"` az kalan süre/hak için amber. */
export function ProgressBar({
  value,
  max = 100,
  showLabel = false,
  ton = "marka",
  className,
}: {
  /** 0-max arası; dışındaki değerler kırpılır. */
  value: number;
  max?: number;
  showLabel?: boolean;
  ton?: "marka" | "uyari";
  className?: string;
}) {
  const yuzde = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        className="h-2 w-full flex-1 overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", ton === "uyari" ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${yuzde}%` }}
        />
      </div>
      {showLabel && <span className="text-xs font-medium tabular-nums text-muted-foreground">%{Math.round(yuzde)}</span>}
    </div>
  );
}

/** Seans blokları: kullanılan/kalan hak görseli (ör. 10 seans = 10 blok). */
export function SeansBloklari({ toplam, kalan, className }: { toplam: number; kalan: number; className?: string }) {
  const blok = Math.min(toplam, 24);
  const kullanilan = Math.max(0, Math.min(blok, blok - Math.round((kalan / toplam) * blok)));
  return (
    <div className={cn("flex gap-1", className)} role="img" aria-label={`${toplam} seansın ${kalan} tanesi kaldı`}>
      {Array.from({ length: blok }, (_, i) => (
        <span key={i} className={cn("h-2.5 flex-1 rounded-[3px]", i < kullanilan ? "bg-surface-3" : "bg-primary")} />
      ))}
    </div>
  );
}

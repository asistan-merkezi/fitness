import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** İkon rozeti: nötr yüzey veya durum tonu (tek marka vurgusu için "blue"/"cyan" eski adları marka tonuna gider). */
export type IconTileTone = "blue" | "cyan" | "emerald" | "amber" | "violet" | "sky" | "rose" | "neutral";

const MARKA = "bg-primary/14 text-primary";
const TONE_SINIFLARI: Record<IconTileTone, string> = {
  blue: MARKA,
  cyan: MARKA,
  violet: MARKA,
  neutral: "bg-surface-3 text-muted-foreground",
  emerald: "bg-emerald-600/12 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-400",
  amber: "bg-amber-600/14 text-amber-700 dark:bg-amber-500/12 dark:text-amber-400",
  sky: "bg-sky-600/12 text-sky-700 dark:bg-sky-500/12 dark:text-sky-400",
  rose: "bg-rose-600/12 text-rose-700 dark:bg-rose-500/12 dark:text-rose-400",
};

export function IconTile({ icon: Icon, tone, className }: { icon: LucideIcon; tone: IconTileTone; className?: string }) {
  return (
    <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", TONE_SINIFLARI[tone], className)}>
      <Icon className="size-5" strokeWidth={1.5} aria-hidden />
    </div>
  );
}

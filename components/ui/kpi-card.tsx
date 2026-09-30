import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { IconTile, type IconTileTone } from "@/components/ui/icon-tile";

/**
 * KPI kartı (DESIGN.md): etiket 11px büyük harf, değer `text-metric` (28px kalın, tabular), opsiyonel alt satır.
 * `vurgu`: tek ana metrik için marka rengi dolu kart (ekranda en fazla bir tane).
 * `value` boşsa "—" gösterilir; kart UYDURMA sayı basmaz.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  iconTone = "neutral",
  trend,
  vurgu = false,
  className,
}: {
  label: string;
  /** Zaten formatlanmış gösterim değeri (₺, adet vb. çağıran tarafta biçimlenir). */
  value: React.ReactNode | null | undefined;
  icon?: LucideIcon;
  iconTone?: IconTileTone;
  trend?: React.ReactNode;
  vurgu?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("min-h-[120px] justify-between gap-3", vurgu && "border-primary bg-primary text-primary-foreground", className)}>
      <div className="flex items-start justify-between px-(--card-spacing)">
        <span className={cn("text-etiket", vurgu ? "text-primary-foreground/80" : "text-muted-foreground")}>{label}</span>
        {Icon && (
          <IconTile icon={Icon} tone={vurgu ? "neutral" : iconTone} className={cn("size-8", vurgu && "bg-primary-foreground/15 text-primary-foreground")} />
        )}
      </div>
      <div className="px-(--card-spacing)">
        <p className={cn("text-metric", vurgu ? "text-primary-foreground" : "text-foreground")}>
          {value === null || value === undefined || value === "" ? "—" : value}
        </p>
        {trend && <div className={cn("mt-1 text-xs", vurgu ? "text-primary-foreground/80" : "text-muted-foreground")}>{trend}</div>}
      </div>
    </Card>
  );
}

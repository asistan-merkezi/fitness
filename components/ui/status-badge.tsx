import * as React from "react";
import { cn } from "@/lib/utils";
import { DURUM_NOKTA_RENGI, DURUM_TONU_SINIFLARI, type StatusTone } from "@/lib/ui/durum-tonlari";

export type { StatusTone };

/**
 * Durum hapı (DESIGN.md): 24px yükseklik, tam yuvarlak, solda 6px nokta, 11px KALIN BÜYÜK HARF etiket.
 * `pulse`: canlı durum için nokta nabzı (azaltılmış harekette durur).
 */
export function StatusBadge({
  tone,
  pulse = false,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & {
  tone: StatusTone;
  pulse?: boolean;
}) {
  return (
    <span
      data-slot="status-badge"
      className={cn(
        "inline-flex h-6 w-fit items-center gap-1.5 rounded-full px-2 text-[11px] leading-none font-bold tracking-[0.04em] whitespace-nowrap uppercase",
        DURUM_TONU_SINIFLARI[tone],
        className
      )}
      {...props}
    >
      <span className="relative flex size-1.5 shrink-0" aria-hidden>
        {pulse && <span className={cn("absolute inline-flex size-full rounded-full opacity-75 motion-safe:animate-ping", DURUM_NOKTA_RENGI[tone])} />}
        <span className={cn("relative inline-flex size-1.5 rounded-full", DURUM_NOKTA_RENGI[tone])} />
      </span>
      {children}
    </span>
  );
}

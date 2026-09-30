import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * docs/DESIGN.md tipografi ölçeği: başlık headline-lg/md, alt metin body-md
 * muted. Sağda aksiyon slotu, mobilde sarar (flex-wrap — projede zaten
 * yerleşik desen, bkz. panel/finans/giderler/kamusal-giderler/page.tsx).
 *
 * `icon`: SADECE Server Component'ten (veya zaten client olan bir üst
 * bileşenden) doğrudan bir `LucideIcon` referansı geçirilmeli — bu bileşenin
 * kendisi "use client" DEĞİL, bir Server Component çağırabilir. Ama eğer bu
 * bileşen bir "use client" bileşenin İÇİNDEN, bir üst Server Component'ten
 * gelen `icon`'u devralarak render ediyorsa, o zaman fonksiyon zaten
 * server→client sınırını geçmiş demektir — CLAUDE.md'nin defalarca
 * belgelediği hata (bkz. Mesajlaşma modülü 500 hatası). Böyle bir durumda
 * ikon her zaman ÇAĞIRAN client bileşenin kendi dahili haritasından
 * çözülmeli, buraya asla server'dan iletilmemeli.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  breadcrumb,
  actions,
  className,
}: {
  title: string;
  description?: string;
  /** Opsiyonel, başlığın solunda küçük bir ikon rozeti. */
  icon?: LucideIcon;
  /** Opsiyonel, örn. "Hastalar / Mehmet Yılmaz" gibi bir geri-link satırı. */
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-primary">
            <Icon className="size-5" strokeWidth={1.5} aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          {breadcrumb && <div className="mb-1 text-sm text-muted-foreground">{breadcrumb}</div>}
          <h1 className="text-[1.625rem] leading-[2.125rem] font-bold tracking-[-0.015em] text-foreground sm:text-[2rem] sm:leading-10 sm:tracking-[-0.02em]">
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

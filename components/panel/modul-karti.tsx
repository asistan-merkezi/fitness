import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { MENU_IKONLARI, type MenuIkonu } from "@/components/panel/menu-ikonlari";
import { cn } from "@/lib/utils";

/** Hub sayfalarındaki kart. `yakinda`: planlı ama henüz yok → tıklanmaz, soluk ve "Yakında" rozetli. */
export function ModulKarti({ href, etiket, ikon, yakinda = false }: { href: string; etiket: string; ikon: MenuIkonu; yakinda?: boolean }) {
  const Ikon = MENU_IKONLARI[ikon];
  const icerik = (
    <>
      <div className="flex w-full items-start justify-between gap-2">
        <span className={cn("flex size-10 items-center justify-center rounded-lg", yakinda ? "bg-surface-3 text-muted-foreground" : "bg-primary/14 text-primary")}>
          <Ikon className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        {yakinda && <StatusBadge tone="slate">Yakında</StatusBadge>}
      </div>
      <span className="text-sm font-semibold leading-snug">{etiket}</span>
    </>
  );
  const sinif = "flex h-full min-h-28 flex-col items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left";

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

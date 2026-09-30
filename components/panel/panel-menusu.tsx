"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function PanelMenusu({ ogeler }: { ogeler: { href: string; etiket: string }[] }) {
  const yol = usePathname();

  return (
    <nav aria-label="Panel menüsü" className="flex gap-1 overflow-x-auto border-b border-border px-2 sm:px-4">
      {ogeler.map((o) => {
        const aktif = o.href === "/panel" ? yol === "/panel" : yol === o.href || yol.startsWith(`${o.href}/`);
        return (
          <Link
            key={o.href}
            href={o.href}
            aria-current={aktif ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              aktif ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {o.etiket}
          </Link>
        );
      })}
    </nav>
  );
}

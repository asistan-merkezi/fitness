import Link from "next/link";
import { Landmark, Receipt, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const SEKMELER = [
  { href: "/panel/finans/giderler", etiket: "Genel Giderler", ikon: Wallet },
  { href: "/panel/finans/giderler/kamusal-giderler", etiket: "Kamusal Giderler", ikon: Landmark },
  { href: "/panel/finans/giderler/gelen-faturalar", etiket: "Gelen Faturalar", ikon: Receipt },
] as const;

/** Giderler'in 3 sekmesi (klinikteki düzen): link tabanlı, her sekme kendi rotası. */
export function GiderlerSekmeCubugu({ aktif }: { aktif: (typeof SEKMELER)[number]["href"] }) {
  return (
    <nav aria-label="Gider sekmeleri" className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-border bg-surface-2 p-1">
      {SEKMELER.map(({ href, etiket, ikon: Ikon }) => (
        <Link
          key={href}
          href={href}
          aria-current={href === aktif ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
            href === aktif ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
          )}
        >
          <Ikon className="size-4" aria-hidden /> {etiket}
        </Link>
      ))}
    </nav>
  );
}

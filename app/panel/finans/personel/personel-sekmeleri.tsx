import Link from "next/link";
import { Banknote, ClipboardList, FileUser, UsersRound, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const SEKMELER = [
  { kod: "liste", href: "/panel/finans/personel", etiket: "Liste", ikon: UsersRound },
  { kod: "hesap", href: "/panel/finans/personel/hesap", etiket: "Hesap", ikon: Banknote },
  { kod: "hakedis", href: "/panel/finans/personel/hakedis", etiket: "Hakediş", ikon: Wallet },
  { kod: "puantaj", href: "/panel/finans/personel/puantaj", etiket: "Puantaj", ikon: ClipboardList },
  { kod: "basvurular", href: "/panel/finans/personel/basvurular", etiket: "Başvurular", ikon: FileUser },
] as const;

export type PersonelSekmesi = (typeof SEKMELER)[number]["kod"];

/** Personel bölümünün sekmeleri (klinikteki Personel hub'ı): Liste · Hesap · Hakediş · Puantaj · Başvurular. Her sekme kendi rotasıdır. */
export function PersonelSekmeleri({ aktif }: { aktif: PersonelSekmesi }) {
  return (
    <nav aria-label="Personel bölümleri" className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-border bg-surface-2 p-1">
      {SEKMELER.map(({ kod, href, etiket, ikon: Ikon }) => (
        <Link
          key={kod}
          href={href}
          aria-current={kod === aktif ? "page" : undefined}
          className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors", kod === aktif ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-3 hover:text-foreground")}
        >
          <Ikon className="size-4" aria-hidden /> {etiket}
        </Link>
      ))}
    </nav>
  );
}

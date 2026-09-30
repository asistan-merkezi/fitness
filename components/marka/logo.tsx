import { cn } from "@/lib/utils";

/**
 * Fitness Asistanı işareti: ağırlık plakasını andıran altıgen + onay işareti (check-in).
 * Küçük boyutta (16px) okunur: kalın çizgi, ince ayrıntı yok.
 *  - "tile": grafit yuvarlak kare üstünde limon altıgen (favicon/uygulama ikonu ile aynı)
 *  - "duz": yalnız altıgen + onay, rengi çevresinden alır (currentColor)
 */
export function MarkaIsareti({ boyut = 32, varyant = "tile", className }: { boyut?: number; varyant?: "tile" | "duz"; className?: string }) {
  return (
    <svg width={boyut} height={boyut} viewBox="0 0 120 120" role="img" aria-label="Fitness Asistanı" className={className}>
      {varyant === "tile" && <rect width="120" height="120" rx="28" fill="#121316" />}
      <path d="M60 18 L95 38 V82 L60 102 L25 82 V38 Z" fill={varyant === "tile" ? "#C8F53C" : "currentColor"} />
      <path
        d="M43 61 L55 73 L78 47"
        fill="none"
        stroke={varyant === "tile" ? "#121316" : "var(--background)"}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className, altEtiket = true }: { className?: string; altEtiket?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <MarkaIsareti boyut={32} />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-extrabold tracking-[-0.02em] text-foreground">Fitness Asistanı</span>
        {altEtiket && <span className="mt-1 text-[9px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Asistan Merkezi</span>}
      </span>
    </span>
  );
}

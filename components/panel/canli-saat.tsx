"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const ABONE = (bildir: () => void) => {
  const id = setInterval(bildir, 1000);
  return () => clearInterval(id);
};

const BICIM = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const ANLIK = () => BICIM.format(new Date());

/**
 * Canlı durum etiketi + İstanbul saati. Sayfa verisi `yenilemeSn` saniyede bir sunucudan tazelenir (sekme görünürken),
 * böylece çizelge ve durumlar elle yenilemeden güncel kalır. Sunucuda saat boş çizilir (hidrasyon farkı olmaz).
 */
export function CanliSaat({ yenilemeSn = 30 }: { yenilemeSn?: number }) {
  const router = useRouter();
  const saat = useSyncExternalStore(ABONE, ANLIK, () => "");

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, yenilemeSn * 1000);
    return () => clearInterval(id);
  }, [router, yenilemeSn]);

  return (
    <div className="flex items-center gap-3">
      <span className="text-etiket inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-primary" title={`Sayfa ${yenilemeSn} saniyede bir otomatik yenilenir`}>
        <span className="size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" aria-hidden />
        Canlı Takip
      </span>
      <span className="font-mono text-sm tabular-nums text-muted-foreground" suppressHydrationWarning>
        {saat || "--:--:--"}
      </span>
    </div>
  );
}

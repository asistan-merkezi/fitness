import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { DoorOpen } from "lucide-react";
import { formatTime } from "@/lib/datetime";
import { DERS_DURUMU } from "@/lib/panel/etiketler";
import { blokKonumu, cizelgeSaatAraligi, SAAT_PX, suAnKonumu } from "@/lib/panel/cizelge";
import { DURUM_NOKTA_RENGI, DURUM_TONU_SINIFLARI } from "@/lib/ui/durum-tonlari";
import { cn } from "@/lib/utils";
import type { DersDurumu } from "@/types/veritabani";

export type CizelgeDersi = {
  id: string;
  musteri_adi: string;
  antrenor_adi: string;
  alan_id: string;
  baslangic: string;
  bitis: string;
  durum: DersDurumu;
};

/**
 * Günün çizelgesi: sütunlar alan/stüdyo, satırlar saat (klinikteki oda çizelgesinin karşılığı).
 * Saf yerleşimdir; ders blokları konumu `lib/panel/cizelge.ts` hesaplar. Bugünse "şu an" çizgisi gösterilir.
 */
export function GunCizelgesi({
  dersler,
  alanlar,
  bugunMu,
  ayrintiHref,
  maxYukseklik = 560,
}: {
  dersler: CizelgeDersi[];
  alanlar: { id: string; ad: string }[];
  bugunMu: boolean;
  ayrintiHref: (dersId: string) => string;
  maxYukseklik?: number;
}) {
  if (alanlar.length === 0) {
    return <EmptyState compact icon={DoorOpen} title="Çizelge için önce Yönetim > Donanım'dan bir alan ekleyin." />;
  }

  const aralik = cizelgeSaatAraligi(dersler);
  const saatler = Array.from({ length: aralik.bit - aralik.bas }, (_, i) => aralik.bas + i);
  const yukseklik = saatler.length * SAAT_PX;
  const suAn = bugunMu ? suAnKonumu(new Date().toISOString(), aralik) : null;
  const sutunSablonu = `56px repeat(${alanlar.length}, minmax(150px, 1fr))`;

  return (
    <div className="overflow-auto rounded-xl border border-border bg-card" style={{ maxHeight: maxYukseklik }}>
      <div className="grid min-w-fit" style={{ gridTemplateColumns: sutunSablonu }}>
        <div className="sticky top-0 left-0 z-20 border-b border-border bg-surface" />
        {alanlar.map((a) => (
          <div key={a.id} className="sticky top-0 z-10 truncate border-b border-l border-border bg-surface px-3 py-2.5 text-sm font-semibold">
            {a.ad}
          </div>
        ))}

        <div className="sticky left-0 z-10 border-r border-border bg-surface" style={{ height: yukseklik }}>
          <div className="relative h-full">
            {saatler.map((s, i) => (
              <span key={s} className="absolute right-2 -translate-y-1/2 font-mono text-xs text-muted-foreground tabular-nums" style={{ top: i === 0 ? 10 : i * SAAT_PX }}>
                {String(s).padStart(2, "0")}:00
              </span>
            ))}
          </div>
        </div>

        {alanlar.map((alan) => (
          <div
            key={alan.id}
            className="relative border-l border-border"
            style={{
              height: yukseklik,
              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${SAAT_PX - 1}px, var(--border) ${SAAT_PX - 1}px, var(--border) ${SAAT_PX}px)`,
            }}
          >
            {dersler
              .filter((d) => d.alan_id === alan.id)
              .map((d) => {
                const konum = blokKonumu(d.baslangic, d.bitis, aralik.bas);
                const durum = DERS_DURUMU[d.durum];
                const kapali = d.durum === "iptal" || d.durum === "gelmedi";
                return (
                  <Link
                    key={d.id}
                    href={ayrintiHref(d.id)}
                    title={`${d.musteri_adi} · ${durum.etiket}`}
                    className={cn(
                      "absolute inset-x-1 overflow-hidden rounded-md border border-current/15 py-1 pr-2 pl-3 text-xs leading-tight transition-shadow hover:shadow-z2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      DURUM_TONU_SINIFLARI[durum.ton],
                      kapali && "opacity-60"
                    )}
                    style={{ top: konum.top, height: konum.height - 2 }}
                  >
                    <span className={cn("absolute inset-y-0 left-0 w-1", DURUM_NOKTA_RENGI[durum.ton])} aria-hidden />
                    <span className="block font-semibold tabular-nums">
                      {formatTime(d.baslangic)}–{formatTime(d.bitis)}
                    </span>
                    <span className={cn("block truncate font-medium text-foreground", kapali && "line-through")}>{d.musteri_adi}</span>
                    {konum.height >= 60 && <span className="block truncate opacity-80">{d.antrenor_adi}</span>}
                  </Link>
                );
              })}
          </div>
        ))}

        {suAn !== null && (
          <div className="pointer-events-none relative z-10 col-span-full" style={{ gridColumn: "1 / -1", gridRow: 2, height: 0 }}>
            <div className="absolute inset-x-0 flex items-center" style={{ top: suAn }}>
              <span className="ml-[50px] size-2.5 -translate-x-1/2 rounded-full bg-destructive" aria-hidden />
              <span className="h-px flex-1 bg-destructive" aria-hidden />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

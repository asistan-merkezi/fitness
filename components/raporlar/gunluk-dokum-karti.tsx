"use client";

import { useState } from "react";
import { Banknote, CalendarClock, ChevronDown, CircleDollarSign, Receipt, Undo2, Users, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { kurusTLyazi } from "@/lib/para";
import { DERS_DURUMU } from "@/lib/panel/etiketler";
import type { GunlukKalem, GunlukOzet } from "@/lib/raporlar/hesaplamalar";
import { cn } from "@/lib/utils";

const IKON: Record<GunlukKalem["tur"], LucideIcon> = { ders: CalendarClock, tahsilat: Banknote, iade: Undo2, gider: Receipt, personel: Users };

/** "YYYY-MM-DD" -> "GG.AA.YYYY — Gün" (saf takvim tarihi; saat dilimine dokunmaz). */
function gunEtiketi(tarih: string): string {
  const [yil, ay, gun] = tarih.split("-").map(Number);
  const gunAdi = new Date(Date.UTC(yil, ay - 1, gun, 12)).toLocaleDateString("tr-TR", { weekday: "long", timeZone: "UTC" });
  return `${String(gun).padStart(2, "0")}.${String(ay).padStart(2, "0")}.${yil} — ${gunAdi}`;
}

export function KalemListesi({ kalemler }: { kalemler: GunlukKalem[] }) {
  if (kalemler.length === 0) return <EmptyState compact icon={CircleDollarSign} title="Bu günde kayıt yok." />;
  return (
    <div className="flex flex-col gap-2">
      {kalemler.map((k, i) => {
        const Ikon = IKON[k.tur];
        const durum = k.durum ? DERS_DURUMU[k.durum] : null;
        return (
          <div key={i} className="flex items-center gap-2.5 text-xs">
            <Ikon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="w-11 shrink-0 tabular-nums text-muted-foreground">{k.saat ?? ""}</span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-foreground">{k.baslik}</span>
              {k.altBaslik && <span className={cn("truncate", k.altBaslik.startsWith("Cariye") ? "text-destructive" : "text-muted-foreground")}>{k.altBaslik}</span>}
            </div>
            {durum && (
              <StatusBadge tone={durum.ton} className="shrink-0">
                {durum.etiket}
              </StatusBadge>
            )}
            {k.yon !== "notr" && (
              <span className={cn("shrink-0 tabular-nums", k.yon === "gelir" ? "text-success" : "text-destructive")}>
                {k.yon === "gelir" ? "+" : "−"}
                {kurusTLyazi(k.tutar)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Aylık görünümde günlük döküm: her gün bir satır (gelir / gider / ders), tıklayınca o günün kalemleri açılır. */
export function GunlukDokumKarti({ gunler }: { gunler: GunlukOzet[] }) {
  const [acik, setAcik] = useState<Set<string>>(new Set());
  if (gunler.length === 0) return <EmptyState compact icon={CircleDollarSign} title="Bu dönemde günlük kayıt yok." />;
  const degistir = (tarih: string) =>
    setAcik((onceki) => {
      const yeni = new Set(onceki);
      if (yeni.has(tarih)) yeni.delete(tarih);
      else yeni.add(tarih);
      return yeni;
    });

  return (
    <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {gunler.map((g) => {
        const gorunur = acik.has(g.tarih);
        return (
          <div key={g.tarih}>
            <button type="button" onClick={() => degistir(g.tarih)} aria-expanded={gorunur} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-2">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", gorunur && "rotate-180")} aria-hidden />
                {gunEtiketi(g.tarih)}
              </span>
              <span className="flex items-center gap-4 text-sm tabular-nums">
                <span className="text-xs text-muted-foreground">{g.dersSayisi} ders</span>
                <span className="text-success">{g.gelir > 0 ? `+${kurusTLyazi(g.gelir)}` : "—"}</span>
                <span className="text-destructive">{g.gider > 0 ? `−${kurusTLyazi(g.gider)}` : "—"}</span>
              </span>
            </button>
            {gorunur && (
              <div className="border-t border-border bg-surface-2/60 px-3 py-3 pl-8">
                <KalemListesi kalemler={g.kalemler} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

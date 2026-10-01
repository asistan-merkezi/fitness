"use client";

import { useState } from "react";
import { ChevronDown, Landmark } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { kurusTLyazi } from "@/lib/para";
import { AY_ADLARI, type DefterSatiri } from "@/lib/panel/finans";
import { cn } from "@/lib/utils";

type Grup = { anahtar: string; etiket: string; giren: number; cikan: number; bakiye: number; satirlar: DefterSatiri[] };

/** "YYYY-MM-DD" -> "GG.AA.YYYY" (saf takvim tarihi; saat dilimine dokunmaz). */
const gunEtiketi = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`;

/** Karşı tarafların kısa özeti: "Ayşe Yılmaz (2), Kira". */
function ozet(satirlar: DefterSatiri[]): string | null {
  const sayac = new Map<string, number>();
  for (const s of satirlar) {
    const ad = s.ayrinti ?? s.baslik;
    sayac.set(ad, (sayac.get(ad) ?? 0) + 1);
  }
  const metin = [...sayac.entries()].map(([ad, adet]) => (adet > 1 ? `${ad} (${adet})` : ad)).join(", ");
  return metin || null;
}

/**
 * Hesap defteri (klinikteki LedgerView düzeni): hareketler günlere (yıllık görünümde aylara) göre gruplanır, her grupta
 * giren / çıkan ve YÜRÜYEN bakiye görünür; satıra tıklayınca o günün kalemleri açılır. Bakiye açılış bakiyesinden başlar.
 * Tutarlar işaretlidir (+ giriş, − çıkış). Yalnız dönemin satırları verilmelidir; açılış = dönem başı bakiye.
 */
export function GrupluDefter({ satirlar, acilisKurus, gruplama, bosMesaj = "Bu dönemde hareket yok.", acik = false }: { satirlar: DefterSatiri[]; acilisKurus: number; gruplama: "gun" | "ay"; bosMesaj?: string; acik?: boolean }) {
  const [acikSatirlar, setAcikSatirlar] = useState<Set<string>>(new Set());

  const harita = new Map<string, DefterSatiri[]>();
  for (const s of [...satirlar].sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0))) {
    const anahtar = gruplama === "gun" ? s.tarih : s.tarih.slice(0, 7);
    harita.set(anahtar, [...(harita.get(anahtar) ?? []), s]);
  }
  const gruplar: Grup[] = [];
  let bakiye = acilisKurus;
  for (const [anahtar, liste] of harita) {
    const giren = liste.filter((s) => s.tutar_kurus > 0).reduce((t, s) => t + s.tutar_kurus, 0);
    const cikan = liste.filter((s) => s.tutar_kurus < 0).reduce((t, s) => t - s.tutar_kurus, 0);
    bakiye += giren - cikan;
    gruplar.push({ anahtar, etiket: gruplama === "gun" ? gunEtiketi(anahtar) : `${AY_ADLARI[Number(anahtar.slice(5, 7)) - 1]} ${anahtar.slice(0, 4)}`, giren, cikan, bakiye, satirlar: liste });
  }

  if (gruplar.length === 0) return <EmptyState compact icon={Landmark} title={bosMesaj} />;

  const degistir = (anahtar: string) =>
    setAcikSatirlar((onceki) => {
      const yeni = new Set(onceki);
      if (yeni.has(anahtar)) yeni.delete(anahtar);
      else yeni.add(anahtar);
      return yeni;
    });

  return (
    <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
      <div className="flex items-center justify-between gap-3 bg-surface-2 px-3 py-2 text-xs font-semibold text-muted-foreground">
        <span>Dönem başı bakiye</span>
        <span className="tabular-nums">{kurusTLyazi(acilisKurus)}</span>
      </div>
      {gruplar.map((g) => {
        const gorunur = acik || acikSatirlar.has(g.anahtar);
        const ozetMetni = ozet(g.satirlar);
        return (
          <div key={g.anahtar}>
            <button type="button" onClick={() => degistir(g.anahtar)} aria-expanded={gorunur} className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-surface-2">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", gorunur && "rotate-180")} aria-hidden />
                  {g.etiket}
                </span>
                <span className="flex items-center gap-4 text-sm tabular-nums">
                  <span className="text-success">{g.giren > 0 ? `+${kurusTLyazi(g.giren)}` : "—"}</span>
                  <span className="text-destructive">{g.cikan > 0 ? `−${kurusTLyazi(g.cikan)}` : "—"}</span>
                  <span className="w-28 text-right font-semibold">{kurusTLyazi(g.bakiye)}</span>
                </span>
              </div>
              {ozetMetni && <p className="pl-5.5 text-xs text-muted-foreground">{ozetMetni}</p>}
            </button>
            {gorunur && (
              <div className="flex flex-col gap-1.5 border-t border-border bg-surface-2/60 px-3 py-2 pl-8">
                {g.satirlar.map((s, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {gruplama === "ay" && `${gunEtiketi(s.tarih)} — `}
                      <span className="font-medium text-foreground">{s.baslik}</span>
                      {s.ayrinti && ` · ${s.ayrinti}`}
                      {s.yontem && ` · ${s.yontem}`}
                    </span>
                    <span className={cn("shrink-0 tabular-nums", s.tutar_kurus >= 0 ? "text-success" : "text-destructive")}>
                      {s.tutar_kurus >= 0 ? "+" : "−"}
                      {kurusTLyazi(Math.abs(s.tutar_kurus))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

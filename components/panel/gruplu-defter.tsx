"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Landmark } from "lucide-react";
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
    const ad = s.karsiTaraf ?? s.tur;
    sayac.set(ad, (sayac.get(ad) ?? 0) + 1);
  }
  const metin = [...sayac.entries()].map(([ad, adet]) => (adet > 1 ? `${ad} (${adet})` : ad)).join(", ");
  return metin || null;
}

/**
 * Hesap defteri (klinikteki LedgerView düzeni): hareketler günlere (yıllık görünümde aylara) göre gruplanır, her grupta
 * giren / çıkan ve YÜRÜYEN bakiye görünür; satıra tıklayınca o günün/ayın tüm hareketleri (Tarih · Tür · Karşı Taraf · Açıklama · Tutar) açılır. Bakiye açılış bakiyesinden başlar.
 * Tutarlar işaretlidir (+ giriş, − çıkış). Yalnız dönemin satırları verilmelidir; açılış = dönem başı bakiye.
 */
export function GrupluDefter({
  satirlar,
  acilisKurus,
  gruplama,
  bosMesaj = "Bu dönemde hareket yok.",
  acik = false,
  girenBaslik,
  cikanBaslik,
}: {
  satirlar: DefterSatiri[];
  acilisKurus: number;
  gruplama: "gun" | "ay";
  bosMesaj?: string;
  acik?: boolean;
  /** Verilirse klinik düzeni: sütun başlıklı tablo, başlıkta "dönem başı" satırı yok (KPI kartında). */
  girenBaslik?: string;
  cikanBaslik?: string;
}) {
  const sutunlu = girenBaslik !== undefined && cikanBaslik !== undefined;
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

  const izgara = "grid grid-cols-[minmax(7rem,1fr)_minmax(7rem,1.4fr)_minmax(7rem,1.4fr)_minmax(6.5rem,0.9fr)] items-start gap-x-4";
  const sutunBaslik = "text-etiket text-muted-foreground";

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[40rem] flex-col divide-y divide-border rounded-xl border border-border">
        {sutunlu ? (
          <div className={cn(izgara, "px-3 py-2.5")}>
            <span className={sutunBaslik}>Tarih</span>
            <span className={cn(sutunBaslik, "text-right")}>{girenBaslik}</span>
            <span className={cn(sutunBaslik, "text-right")}>{cikanBaslik}</span>
            <span className={cn(sutunBaslik, "text-right")}>Bakiye</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 bg-surface-2 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <span>Dönem başı bakiye</span>
            <span className="tabular-nums">{kurusTLyazi(acilisKurus)}</span>
          </div>
        )}
        {gruplar.map((g) => {
          const gorunur = acik || acikSatirlar.has(g.anahtar);
          const ozetMetni = ozet(g.satirlar);
          const girenOzet = ozet(g.satirlar.filter((s) => s.tutar_kurus > 0));
          const cikanOzet = ozet(g.satirlar.filter((s) => s.tutar_kurus < 0));
          return (
            <div key={g.anahtar}>
              {sutunlu ? (
                <button type="button" onClick={() => degistir(g.anahtar)} aria-expanded={gorunur} className={cn(izgara, "w-full px-3 py-3 text-left hover:bg-surface-2")}>
                  <span className="flex items-center gap-1.5 pt-0.5 text-sm font-medium">
                    <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", gorunur && "rotate-90")} aria-hidden />
                    {g.etiket}
                  </span>
                  <span className="flex flex-col items-end text-sm tabular-nums">
                    <span className={g.giren > 0 ? "text-success" : "text-muted-foreground/60"}>{g.giren > 0 ? kurusTLyazi(g.giren) : "—"}</span>
                    {girenOzet && <span className="text-xs text-muted-foreground">{girenOzet}</span>}
                  </span>
                  <span className="flex flex-col items-end text-sm tabular-nums">
                    <span className={g.cikan > 0 ? "text-destructive" : "text-muted-foreground/60"}>{g.cikan > 0 ? kurusTLyazi(g.cikan) : "—"}</span>
                    {cikanOzet && <span className="text-xs text-muted-foreground">{cikanOzet}</span>}
                  </span>
                  <span className="pt-0.5 text-right text-sm font-semibold tabular-nums">{kurusTLyazi(g.bakiye)}</span>
                </button>
              ) : (
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
              )}
              {gorunur && (
                <div className="overflow-x-auto border-t border-border bg-surface-2/60 px-3 py-2">
                  <table className="w-full min-w-[34rem] text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-3 font-medium">Tarih</th>
                        <th className="py-1 pr-3 font-medium">Tür</th>
                        <th className="py-1 pr-3 font-medium">Karşı Taraf</th>
                        <th className="py-1 pr-3 font-medium">Açıklama</th>
                        <th className="py-1 text-right font-medium">Tutar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.satirlar.map((s, i) => (
                        <tr key={i} className="border-t border-border/60 align-top">
                          <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-muted-foreground">{gunEtiketi(s.tarih)}</td>
                          <td className="py-1.5 pr-3 font-medium">
                            {s.tur}
                            {s.yontem && <span className="font-normal text-muted-foreground"> · {s.yontem}</span>}
                          </td>
                          <td className="py-1.5 pr-3">{s.karsiTaraf ?? "—"}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{s.aciklama ?? "—"}</td>
                          <td className={cn("whitespace-nowrap py-1.5 text-right font-medium tabular-nums", s.tutar_kurus >= 0 ? "text-success" : "text-destructive")}>
                            {s.tutar_kurus >= 0 ? "+" : "−"}
                            {kurusTLyazi(Math.abs(s.tutar_kurus))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

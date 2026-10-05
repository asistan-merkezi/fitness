"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTime } from "@/lib/datetime";
import { DERS_DURUMU } from "@/lib/panel/etiketler";
import type { DersDurumu } from "@/types/veritabani";

export type BugunkuDers = { id: string; baslangic: string; bitis: string; musteri_adi: string; antrenor_adi: string; alan_adi: string; durum: DersDurumu };

/**
 * Ana ekrandaki "Bugünkü dersler" KPI kartı (klinikteki Bugünkü Seanslar kartı gibi): tıklanınca bugünün ders listesi
 * (saat, müşteri, antrenör, alan, durum) salt-okunur bir bilgi penceresinde açılır. Veri sayfa yüklendiği andaki sunucu görüntüsüdür.
 */
export function BugunkuDerslerKarti({ dersler }: { dersler: BugunkuDers[] }) {
  const [acik, setAcik] = useState(false);
  const planli = dersler.filter((d) => d.durum !== "iptal").length;
  const tamamlanan = dersler.filter((d) => d.durum === "tamamlandi").length;

  return (
    <>
      <button
        type="button"
        onClick={() => setAcik(true)}
        aria-label="Bugünkü ders listesini aç"
        className="rounded-2xl text-left transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <KpiCard
          vurgu
          label="Bugünkü dersler"
          value={
            <>
              {tamamlanan} <span className="text-base font-medium">/ {planli}</span>
            </>
          }
          icon={CalendarDays}
          className="h-full cursor-pointer"
        />
      </button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bugünkü Dersler</DialogTitle>
            <DialogDescription>
              {planli} ders planlı · {tamamlanan} tamamlandı
            </DialogDescription>
          </DialogHeader>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Saat</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead className="hidden sm:table-cell">Antrenör</TableHead>
                <TableHead className="hidden sm:table-cell">Alan</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dersler.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Bugün ders yok
                  </TableCell>
                </TableRow>
              )}
              {dersler.map((d) => {
                const durum = DERS_DURUMU[d.durum];
                return (
                  <TableRow key={d.id}>
                    <TableCell className="tabular whitespace-nowrap">
                      {formatTime(d.baslangic)}–{formatTime(d.bitis)}
                    </TableCell>
                    <TableCell className="font-medium">{d.musteri_adi}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{d.antrenor_adi}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{d.alan_adi}</TableCell>
                    <TableCell>
                      <StatusBadge tone={durum.ton}>{durum.etiket}</StatusBadge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </>
  );
}

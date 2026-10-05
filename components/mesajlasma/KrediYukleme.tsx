"use client";

import { useActionState, useState } from "react";
import { CreditCard } from "lucide-react";
import { krediOdemeBaslat } from "@/app/panel/ayarlar/mesajlasma/kredi/[kanal]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { cn } from "@/lib/utils";
import type { MesajKanal, MesajKrediHareketi } from "@/types/mesajlasma";

export type KrediPaketiGosterim = { paketId: string; adet: number; fiyatKurus: number; paraBirimi: string };

function fiyatYaz(kurus: number, paraBirimi: string): string {
  return paraBirimi === "TRY" ? kurusTLyazi(kurus) : `${(kurus / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${paraBirimi}`;
}

/** Kredi Yükleme: merkezin anlık fiyat çizelgesi + paket seç → "Ödeme Yap" (merkezin ödeme sayfasına yönlenir) + geçmiş yüklemeler. */
export function KrediYukleme({ kanal, paketler, merkezHatasi, hareketler }: { kanal: MesajKanal; paketler: KrediPaketiGosterim[]; merkezHatasi: string | null; hareketler: MesajKrediHareketi[] }) {
  const [durum, eylem, bekliyor] = useActionState(krediOdemeBaslat, null);
  const [secili, setSecili] = useState("");

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Kredi Adet ve Fiyat Çizelgesi</CardTitle>
          <CardDescription>Fiyatlar Asistan Merkezi&apos;nden anlık çekilir. Ödeme, merkezin güvenli ödeme sayfasında tamamlanır.</CardDescription>
        </CardHeader>
        <CardContent>
          {merkezHatasi ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {merkezHatasi}
            </p>
          ) : paketler.length === 0 ? (
            <EmptyState compact icon={CreditCard} title="Şu an satın alınabilir kredi paketi yok." />
          ) : (
            <form action={eylem} className="flex flex-col gap-4">
              <input type="hidden" name="kanal" value={kanal} />
              <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <legend className="sr-only">Kredi paketi</legend>
                {paketler.map((p) => (
                  <label key={p.paketId} className={cn("flex cursor-pointer flex-col gap-1 rounded-xl border bg-card p-4 transition-colors", secili === p.paketId ? "border-primary ring-2 ring-primary/30" : "border-border hover:bg-surface-3")}>
                    <input type="radio" name="paket_id" value={p.paketId} checked={secili === p.paketId} onChange={() => setSecili(p.paketId)} className="sr-only" />
                    <span className="text-metric tabular-nums">{p.adet.toLocaleString("tr-TR")}</span>
                    <span className="text-xs text-muted-foreground">adet kredi</span>
                    <span className="mt-1 font-semibold tabular-nums">{fiyatYaz(p.fiyatKurus, p.paraBirimi)}</span>
                  </label>
                ))}
              </fieldset>
              {durum && !durum.success && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {durum.message}
                </p>
              )}
              <div>
                <Button type="submit" disabled={!secili || bekliyor}>
                  {bekliyor ? "Yönlendiriliyor…" : "Ödeme Yap"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yükleme geçmişi</CardTitle>
        </CardHeader>
        <CardContent>
          {hareketler.length === 0 ? (
            <EmptyState compact icon={CreditCard} title="Henüz kredi yüklemesi yok." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="text-right">Miktar</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead>Açıklama</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hareketler.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(h.created_at)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">+{h.miktar}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.tutar_kurus !== null ? kurusTLyazi(Number(h.tutar_kurus)) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{h.aciklama ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

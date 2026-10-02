"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { kurusTLyazi } from "@/lib/para";
import { cn } from "@/lib/utils";

export type CariOzetSatiri = { musteri_id: string; uye_no: number; ad_soyad: string; toplam_borc_kurus: number; tahsil_kurus: number; kalan_kurus: number };

/** Müşteri adı/üye no ile aranabilir cari alacak tablosu; satır tıklanınca müşterinin Cari & Ödeme sekmesine gider. */
export function CariAlacaklarListesi({ satirlar }: { satirlar: CariOzetSatiri[] }) {
  const [arama, setArama] = useState("");

  const filtreli = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (!q) return satirlar;
    return satirlar.filter((s) => s.ad_soyad.toLocaleLowerCase("tr").includes(q) || String(s.uye_no) === q);
  }, [satirlar, arama]);
  const kalanToplam = filtreli.reduce((t, s) => t + Math.max(s.kalan_kurus, 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" placeholder="Müşteri adı veya üye no ile ara" aria-label="Müşteri ara" value={arama} onChange={(e) => setArama(e.target.value)} className="pl-8" />
        </div>
        <p className="text-sm text-muted-foreground">
          Toplam kalan: <span className="font-semibold text-destructive tabular-nums">{kurusTLyazi(kalanToplam)}</span>
        </p>
      </div>

      {filtreli.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aramayla eşleşen müşteri bulunamadı.</p>
      ) : (
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Müşteri</TableHead>
              <TableHead className="text-right">Toplam borç</TableHead>
              <TableHead className="text-right">Tahsil edilen</TableHead>
              <TableHead className="text-right">Kalan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtreli.map((s) => {
              const href = `/panel/musteriler/${s.musteri_id}?sekme=cari`;
              return (
                <TableRow key={s.musteri_id}>
                  <TableCell className="p-0">
                    <Link href={href} className="block px-4 py-3.5 font-medium hover:underline">
                      {s.ad_soyad}
                      <span className="block text-xs font-normal text-muted-foreground tabular-nums">Üye no {s.uye_no}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={href} className="block px-4 py-3.5 text-right tabular-nums">
                      {kurusTLyazi(s.toplam_borc_kurus)}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={href} className="block px-4 py-3.5 text-right tabular-nums text-success">
                      {kurusTLyazi(s.tahsil_kurus)}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={href} className={cn("block px-4 py-3.5 text-right font-semibold tabular-nums", s.kalan_kurus > 0 ? "text-destructive" : "text-muted-foreground")}>
                      {kurusTLyazi(s.kalan_kurus)}
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

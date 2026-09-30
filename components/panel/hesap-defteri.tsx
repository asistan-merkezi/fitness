import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { GIDER_KATEGORI_ETIKETLERI, GIDER_YONTEMLERI, hareketBasligi } from "@/lib/panel/finans";
import type { HesapHareketSatiri } from "@/lib/panel/hesap-hareketleri";
import { cn } from "@/lib/utils";
import { Landmark } from "lucide-react";

/** Hesap hareket defteri: tarih, ne, kimle/açıklama, yöntem ve işaretli tutar (yeşil giriş, kırmızı çıkış). */
export function HesapDefteri({ satirlar, bosMesaj = "Bu dönemde hareket yok." }: { satirlar: HesapHareketSatiri[]; bosMesaj?: string }) {
  if (satirlar.length === 0) return <EmptyState compact icon={Landmark} title={bosMesaj} />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tarih</TableHead>
          <TableHead>Hareket</TableHead>
          <TableHead>Yöntem</TableHead>
          <TableHead className="text-right">Tutar</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {satirlar.map((s, i) => {
          const giris = s.tutar_kurus >= 0;
          const ayrinti = s.kaynak === "musteri" ? s.musteri_adi : s.kaynak === "gider" ? (GIDER_KATEGORI_ETIKETLERI[s.aciklama ?? ""] ?? s.aciklama) : s.aciklama;
          return (
            <TableRow key={`${s.kaynak_id}-${i}`}>
              <TableCell className="whitespace-nowrap tabular-nums">{gunYazi(s.tarih)}</TableCell>
              <TableCell>
                <StatusBadge tone={giris ? "emerald" : "rose"}>{hareketBasligi(s)}</StatusBadge>
                {ayrinti && <span className="mt-1 block text-xs text-muted-foreground">{ayrinti}</span>}
              </TableCell>
              <TableCell>{s.yontem ? (GIDER_YONTEMLERI[s.yontem] ?? s.yontem) : "—"}</TableCell>
              <TableCell className={cn("text-right font-semibold tabular-nums", giris ? "text-success" : "text-destructive")}>
                {giris ? "+" : "−"}
                {kurusTLyazi(Math.abs(s.tutar_kurus))}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

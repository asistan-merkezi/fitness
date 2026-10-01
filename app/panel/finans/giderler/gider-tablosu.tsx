import { TrendingDown } from "lucide-react";
import type { HesapSecenegi } from "@/components/panel/yontem-hesap-secimi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { AY_ADLARI, GIDER_KATEGORI_ETIKETLERI, GIDER_YONTEMLERI, vadesiGecti } from "@/lib/panel/finans";
import { plakaBicimle } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { GiderIptalFormu, GiderOdeFormu } from "./formlar";
import { type AracSecenegi, type Gider, giderDonemi } from "./sorgular";

/** Ödenecek (bekleyen) giderler: dönemden bağımsız, vadesi en yakın önce; öde / iptal et eylemleriyle. */
export function BekleyenGiderler({ bekleyenler, hesaplar, yonetici, bugun, baslik }: { bekleyenler: Gider[]; hesaplar: HesapSecenegi[]; yonetici: boolean; bugun: string; baslik: string }) {
  if (bekleyenler.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {baslik} ({bekleyenler.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border p-0">
        {bekleyenler.map((g) => (
          <div key={g.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="font-semibold">{g.tedarikci_adi ?? GIDER_KATEGORI_ETIKETLERI[g.kategori]}</p>
              <p className="text-sm text-muted-foreground">
                {GIDER_KATEGORI_ETIKETLERI[g.kategori]} · {kurusTLyazi(g.tutar_kurus)}
              </p>
              <p className={cn("text-xs tabular-nums", vadesiGecti(g.vade_tarihi, bugun) ? "font-semibold text-destructive" : "text-muted-foreground")}>
                Vade: {g.vade_tarihi ? gunYazi(g.vade_tarihi) : "—"}
                {vadesiGecti(g.vade_tarihi, bugun) && " (gecikmiş)"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <GiderOdeFormu giderId={g.id} hesaplar={hesaplar} />
              {yonetici && <GiderIptalFormu giderId={g.id} />}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Dönem kayıtları tablosu (Genel ve Kamusal sekmelerinde ortak). */
export function GiderTablosu({ baslik, giderler, yonetici, bugun, bosMetin, araclar, kamusal = false }: { baslik: string; giderler: Gider[]; yonetici: boolean; bugun: string; bosMetin: string; araclar: AracSecenegi[]; kamusal?: boolean }) {
  const aracPlaka = new Map(araclar.map((a) => [a.id, plakaBicimle(a.plaka)]));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{baslik}</CardTitle>
      </CardHeader>
      <CardContent>
        {giderler.length === 0 ? (
          <EmptyState compact icon={TrendingDown} title={bosMetin} />
        ) : (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{kamusal ? "Dönem" : "Tarih"}</TableHead>
                <TableHead>{kamusal ? "Ödeme" : "Gider"}</TableHead>
                <TableHead>Belge no</TableHead>
                <TableHead>Yöntem</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {giderler.map((g) => (
                <TableRow key={g.id} className={g.durum === "iptal" ? "opacity-60" : undefined}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {kamusal ? (
                      <>
                        {AY_ADLARI[giderDonemi(g).ay - 1]} {giderDonemi(g).yil}
                        <span className="block text-xs text-muted-foreground">Kayıt: {gunYazi(g.tarih)}</span>
                      </>
                    ) : (
                      gunYazi(g.tarih)
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{g.tedarikci_adi ?? GIDER_KATEGORI_ETIKETLERI[g.kategori]}</span>
                    <span className="block text-xs text-muted-foreground">
                      {GIDER_KATEGORI_ETIKETLERI[g.kategori]}
                      {g.arac_id && aracPlaka.get(g.arac_id) && ` · ${aracPlaka.get(g.arac_id)}`}
                      {g.aciklama && ` · ${g.aciklama}`}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{g.belge_no ?? "—"}</TableCell>
                  <TableCell>{g.odeme_yontemi ? GIDER_YONTEMLERI[g.odeme_yontemi] : "—"}</TableCell>
                  <TableCell className={cn("text-right font-semibold tabular-nums", g.durum === "iptal" && "line-through")}>{kurusTLyazi(g.tutar_kurus)}</TableCell>
                  <TableCell>
                    {g.durum === "odendi" ? (
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge tone="emerald">Ödendi</StatusBadge>
                        {yonetici && <GiderIptalFormu giderId={g.id} />}
                      </div>
                    ) : g.durum === "bekliyor" ? (
                      <StatusBadge tone={vadesiGecti(g.vade_tarihi, bugun) ? "rose" : "amber"}>{vadesiGecti(g.vade_tarihi, bugun) ? "Vadesi geçti" : "Bekliyor"}</StatusBadge>
                    ) : (
                      <span title={g.iptal_nedeni ?? undefined}>
                        <StatusBadge tone="slate">İptal</StatusBadge>
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

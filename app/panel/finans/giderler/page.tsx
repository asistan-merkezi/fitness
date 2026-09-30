import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, TrendingDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, gunYazi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { GIDER_KATEGORI_ETIKETLERI, GIDER_YONTEMLERI, kategoriDagilimi, vadesiGecti } from "@/lib/panel/finans";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { GiderFormu, GiderIptalFormu, GiderOdeFormu } from "./formlar";

export const metadata: Metadata = { title: "Giderler" };

type Gider = {
  id: string;
  tur: "gider" | "kamusal";
  kategori: string;
  tedarikci_adi: string | null;
  aciklama: string | null;
  tutar_kurus: number;
  tarih: string;
  vade_tarihi: string | null;
  durum: "bekliyor" | "odendi" | "iptal";
  odeme_yontemi: string | null;
  odeme_tarihi: string | null;
  iptal_nedeni: string | null;
};

export default async function GiderlerSayfasi({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";
  const { ay } = await searchParams;
  const donem = donemCoz({ gorunum: "ay", tarih: ay });
  const bugun = bugunIstanbulTarihi();
  const buAy = bugun.slice(0, 7);

  const supabase = await createClient();
  const [{ data: donemVeri }, { data: bekleyenVeri }, { data: hesapVeri }] = await Promise.all([
    supabase
      .from("gider")
      .select("id, tur, kategori, tedarikci_adi, aciklama, tutar_kurus, tarih, vade_tarihi, durum, odeme_yontemi, odeme_tarihi, iptal_nedeni")
      .gte("tarih", donem.baslangicTarih)
      .lt("tarih", donem.bitisTarih)
      .order("tarih", { ascending: false })
      .limit(300),
    supabase.from("gider").select("id, tur, kategori, tedarikci_adi, aciklama, tutar_kurus, tarih, vade_tarihi, durum, odeme_yontemi, odeme_tarihi, iptal_nedeni").eq("durum", "bekliyor").order("vade_tarihi", { ascending: true, nullsFirst: false }),
    supabase.rpc("banka_hesap_secenekleri"),
  ]);
  const giderler = (donemVeri ?? []) as Gider[];
  const bekleyenler = (bekleyenVeri ?? []) as Gider[];
  const hesaplar = (hesapVeri ?? []) as { id: string; ad: string }[];

  const odenenler = giderler.filter((g) => g.durum === "odendi");
  const toplam = odenenler.reduce((t, g) => t + Number(g.tutar_kurus), 0);
  const bekleyenToplam = bekleyenler.reduce((t, g) => t + Number(g.tutar_kurus), 0);
  const gecikenToplam = bekleyenler.filter((g) => vadesiGecti(g.vade_tarihi, bugun)).reduce((t, g) => t + Number(g.tutar_kurus), 0);
  const dagilim = kategoriDagilimi(odenenler.map((g) => ({ kategori: g.kategori, tutar_kurus: Number(g.tutar_kurus) })));
  const baglanti = (p: string) => `/panel/finans/giderler?ay=${p}`;

  return (
    <>
      <PageHeader title="Giderler" description={`${donem.etiket} dönemi`} icon={TrendingDown} />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={baglanti(donem.oncekiParam)} aria-label="Önceki ay" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeft aria-hidden />
        </Link>
        <Link href={baglanti(buAy)} aria-current={donem.param === buAy ? "date" : undefined} className={buttonVariants({ variant: donem.param === buAy ? "default" : "outline" })}>
          Bu Ay
        </Link>
        <Link href={baglanti(donem.sonrakiParam)} aria-label="Sonraki ay" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronRight aria-hidden />
        </Link>
      </div>

      <section aria-label="Gider özeti" className="grid gap-4 sm:grid-cols-3">
        <KpiCard vurgu label="Dönemde ödenen gider" value={kurusTLyazi(toplam)} icon={TrendingDown} />
        <KpiCard label="Ödenecek (bekleyen)" value={kurusTLyazi(bekleyenToplam)} icon={TrendingDown} iconTone="amber" />
        <KpiCard label="Vadesi geçen" value={kurusTLyazi(gecikenToplam)} icon={TrendingDown} iconTone={gecikenToplam > 0 ? "rose" : "neutral"} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Yeni gider</CardTitle>
          <CardDescription>Ödenmiş gider kasayı/bankayı hemen etkiler. Vadeli (ödenecek) gider, ödendi işaretlenene kadar hesaplara yansımaz.</CardDescription>
        </CardHeader>
        <CardContent>
          <GiderFormu hesaplar={hesaplar} bugun={bugun} />
        </CardContent>
      </Card>

      {bekleyenler.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ödenecek giderler ({bekleyenler.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {bekleyenler.map((g) => (
              <div key={g.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {g.tedarikci_adi ?? GIDER_KATEGORI_ETIKETLERI[g.kategori]}
                    {g.tur === "kamusal" && <span className="ml-2"><StatusBadge tone="sky">Kamu</StatusBadge></span>}
                  </p>
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
      )}

      {dagilim.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Kategori dağılımı</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {dagilim.map((d) => (
              <div key={d.kategori} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{GIDER_KATEGORI_ETIKETLERI[d.kategori] ?? d.kategori}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {kurusTLyazi(d.tutar_kurus)} · %{String(d.yuzde).replace(".", ",")}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${GIDER_KATEGORI_ETIKETLERI[d.kategori] ?? d.kategori}: %${d.yuzde}`}>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(d.yuzde, 1)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dönem giderleri</CardTitle>
        </CardHeader>
        <CardContent>
          {giderler.length === 0 ? (
            <EmptyState compact icon={TrendingDown} title="Bu dönemde gider kaydı yok." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Gider</TableHead>
                  <TableHead>Yöntem</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {giderler.map((g) => (
                  <TableRow key={g.id} className={g.durum === "iptal" ? "opacity-60" : undefined}>
                    <TableCell className="whitespace-nowrap tabular-nums">{gunYazi(g.tarih)}</TableCell>
                    <TableCell>
                      <span className="font-medium">{g.tedarikci_adi ?? GIDER_KATEGORI_ETIKETLERI[g.kategori]}</span>
                      <span className="block text-xs text-muted-foreground">
                        {GIDER_KATEGORI_ETIKETLERI[g.kategori]}
                        {g.aciklama && ` · ${g.aciklama}`}
                      </span>
                    </TableCell>
                    <TableCell>{g.odeme_yontemi ? GIDER_YONTEMLERI[g.odeme_yontemi] : "—"}</TableCell>
                    <TableCell className={cn("text-right font-semibold tabular-nums", g.durum === "iptal" && "line-through")}>{kurusTLyazi(g.tutar_kurus)}</TableCell>
                    <TableCell>
                      {g.durum === "odendi" ? (
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge tone="emerald">Ödendi</StatusBadge>
                          {yonetici && <GiderIptalFormu giderId={g.id} />}
                        </div>
                      ) : g.durum === "bekliyor" ? (
                        <StatusBadge tone="amber">Bekliyor</StatusBadge>
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
    </>
  );
}

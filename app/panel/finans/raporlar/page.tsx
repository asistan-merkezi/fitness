import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ChevronLeft, ChevronRight, Landmark, Receipt, TrendingDown, TrendingUp, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { GIDER_KATEGORI_ETIKETLERI, kategoriDagilimi } from "@/lib/panel/finans";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Finans Raporları" };

type Ozet = {
  tahsilat_kurus: number;
  iade_kurus: number;
  net_tahsilat_kurus: number;
  satis_kurus: number;
  iskonto_kurus: number;
  gider_kurus: number;
  personel_odeme_kurus: number;
  personel_hakedis_kurus: number;
  acik_alacak_kurus: number;
  nakit_sonuc_kurus: number;
};
type HesapSatiri = { hesap: string; banka_hesap_id: string | null; ad: string | null; acilis_kurus: number; giren_kurus: number; cikan_kurus: number; kapanis_kurus: number };

export default async function RaporlarSayfasi({ searchParams }: { searchParams: Promise<{ gorunum?: string; tarih?: string }> }) {
  await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const p = await searchParams;
  const gorunum = p.gorunum === "yil" ? "yil" : "ay";
  const donem = donemCoz({ gorunum, tarih: p.tarih });
  const bugun = bugunIstanbulTarihi();
  const simdi = gorunum === "yil" ? bugun.slice(0, 4) : bugun.slice(0, 7);

  const supabase = await createClient();
  const [{ data: ozetVeri }, { data: hesapVeri }, { data: giderVeri }] = await Promise.all([
    supabase.rpc("finans_ozet", { p_baslangic: donem.baslangicTarih, p_bitis: donem.bitisTarih }),
    supabase.rpc("hesap_ozet", { p_baslangic: donem.baslangicTarih, p_bitis: donem.bitisTarih }),
    supabase.from("gider").select("kategori, tutar_kurus").eq("durum", "odendi").gte("odeme_tarihi", donem.baslangicTarih).lt("odeme_tarihi", donem.bitisTarih).limit(2000),
  ]);
  const ham = (ozetVeri ?? {}) as Record<string, number | string>;
  const o = Object.fromEntries(Object.entries(ham).map(([k, v]) => [k, Number(v)])) as unknown as Ozet;
  const hesaplar = ((hesapVeri ?? []) as HesapSatiri[]).map((h) => ({ ...h, acilis_kurus: Number(h.acilis_kurus), giren_kurus: Number(h.giren_kurus), cikan_kurus: Number(h.cikan_kurus), kapanis_kurus: Number(h.kapanis_kurus) }));
  const dagilim = kategoriDagilimi(((giderVeri ?? []) as { kategori: string; tutar_kurus: number | string }[]).map((g) => ({ kategori: g.kategori, tutar_kurus: Number(g.tutar_kurus) })));
  const baglanti = (g: string, t: string) => `/panel/finans/raporlar?gorunum=${g}&tarih=${t}`;

  return (
    <>
      <PageHeader title="Finans Raporları" description={`${donem.etiket} · gelir, gider ve nakit özeti`} icon={BarChart3} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-border p-1" role="group" aria-label="Görünüm">
          {[
            { g: "ay", e: "Aylık", t: donem.gorunum === "yil" ? `${donem.param}-01` : donem.param },
            { g: "yil", e: "Yıllık", t: donem.param.slice(0, 4) },
          ].map(({ g, e, t }) => (
            <Link key={g} href={baglanti(g, t)} aria-current={gorunum === g ? "true" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", gorunum === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-3")}>
              {e}
            </Link>
          ))}
        </div>
        <Link href={baglanti(gorunum, donem.oncekiParam)} aria-label="Önceki dönem" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeft aria-hidden />
        </Link>
        <Link href={baglanti(gorunum, simdi)} aria-current={donem.param === simdi ? "date" : undefined} className={buttonVariants({ variant: donem.param === simdi ? "default" : "outline" })}>
          {gorunum === "yil" ? "Bu Yıl" : "Bu Ay"}
        </Link>
        <Link href={baglanti(gorunum, donem.sonrakiParam)} aria-label="Sonraki dönem" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronRight aria-hidden />
        </Link>
      </div>

      <section aria-label="Dönem özeti" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Net tahsilat" value={kurusTLyazi(o.net_tahsilat_kurus ?? 0)} icon={TrendingUp} iconTone="emerald" />
        <KpiCard label="Satış (iskonto öncesi)" value={kurusTLyazi(o.satis_kurus ?? 0)} icon={Receipt} />
        <KpiCard label="Gider" value={kurusTLyazi(o.gider_kurus ?? 0)} icon={TrendingDown} iconTone="rose" />
        <KpiCard vurgu label="Nakit sonucu" value={kurusTLyazi(o.nakit_sonuc_kurus ?? 0)} icon={BarChart3} />
        <KpiCard label="Verilen iskonto" value={kurusTLyazi(o.iskonto_kurus ?? 0)} icon={Receipt} />
        <KpiCard label="İade" value={kurusTLyazi(o.iade_kurus ?? 0)} icon={TrendingDown} iconTone="rose" />
        <KpiCard label="Personel ödemesi" value={kurusTLyazi(o.personel_odeme_kurus ?? 0)} icon={Users} />
        <KpiCard label="Açık cari alacak" value={kurusTLyazi(o.acik_alacak_kurus ?? 0)} icon={Landmark} iconTone="amber" />
      </section>
      <p className="text-xs text-muted-foreground">
        Nakit sonucu = net tahsilat − gider − personel ödemesi. Personel hakediş tahakkuku ({kurusTLyazi(o.personel_hakedis_kurus ?? 0)}) ödenene kadar nakit sonucuna girmez.
      </p>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gider dağılımı</CardTitle>
            <CardDescription>Ödenmiş giderler, kategoriye göre</CardDescription>
          </CardHeader>
          <CardContent>
            {dagilim.length === 0 ? (
              <EmptyState compact icon={TrendingDown} title="Bu dönemde ödenmiş gider yok" />
            ) : (
              <ul className="grid gap-3">
                {dagilim.map((d) => (
                  <li key={d.kategori}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{GIDER_KATEGORI_ETIKETLERI[d.kategori] ?? d.kategori}</span>
                      <span className="tabular-nums">
                        {kurusTLyazi(d.tutar_kurus)} <span className="text-muted-foreground">(%{d.yuzde})</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${d.yuzde}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hesap özeti</CardTitle>
            <CardDescription>Kasa, banka ve kredi kartı hesaplarının dönem hareketi</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hesap</TableHead>
                  <TableHead className="text-right">Giren</TableHead>
                  <TableHead className="text-right">Çıkan</TableHead>
                  <TableHead className="text-right">Kapanış</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hesaplar.map((h) => (
                  <TableRow key={`${h.hesap}-${h.banka_hesap_id ?? "x"}`}>
                    <TableCell className="font-medium">{h.hesap === "kasa" ? "Kasa" : (h.ad ?? "Hesap atanmamış")}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">{kurusTLyazi(h.giren_kurus)}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">{kurusTLyazi(h.cikan_kurus)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{kurusTLyazi(h.kapanis_kurus)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

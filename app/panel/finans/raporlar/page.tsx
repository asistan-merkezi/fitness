import type { Metadata } from "next";
import { BarChart3, Landmark, Receipt, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { DonemCubugu } from "@/components/panel/donem-cubugu";
import { YazdirDugmesi } from "@/components/panel/yazdir-dugmesi";
import { GunlukDokumKarti, KalemListesi } from "@/components/raporlar/gunluk-dokum-karti";
import { YillikGrafik } from "@/components/raporlar/yillik-grafik";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { GIDER_KATEGORI_ETIKETLERI, kategoriDagilimi } from "@/lib/panel/finans";
import { hesapHareketleriGetir } from "@/lib/panel/hesap-hareketleri";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { dersDurumOzetiHesapla, dersleriGetir, finansOzetiCoz, gelirOzetiHesapla, giderKirilimiHesapla, gunlukDokumHesapla, odenmisGiderleriGetir, toplamGider, yillikSeriGetir } from "@/lib/raporlar/hesaplamalar";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { musteriAdlariGetir } from "@/lib/panel/musteri-adlari";

export const metadata: Metadata = { title: "Finans Raporları" };

type HesapSatiri = { hesap: string; banka_hesap_id: string | null; ad: string | null; acilis_kurus: number; giren_kurus: number; cikan_kurus: number; kapanis_kurus: number };

/**
 * Finans Raporları (klinik düzeni): Günlük / Aylık / Yıllık. Gelir = net tahsilat (müşteri ödemeleri − iadeler, Kasa/Banka/Kredi Kartı
 * ile aynı kaynak). Gider = ödenmiş giderler + personel hakediş/prim TAHAKKUKU; nakit sonucu (personel ÖDEMESİ düşülerek) ayrıca gösterilir.
 */
export default async function RaporlarSayfasi({ searchParams }: { searchParams: Promise<{ gorunum?: string; tarih?: string }> }) {
  await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const p = await searchParams;
  const donem = donemCoz({ gorunum: p.gorunum === "gun" || p.gorunum === "yil" ? p.gorunum : "ay", tarih: p.tarih });
  const gunluk = donem.gorunum === "gun";
  const yillik = donem.gorunum === "yil";

  const supabase = await createClient();
  const [{ data: ozetVeri }, { data: hesapVeri }, hareketler, giderler, dersler, aylar] = await Promise.all([
    supabase.rpc("finans_ozet", { p_baslangic: donem.baslangicTarih, p_bitis: donem.bitisTarih }),
    supabase.rpc("hesap_ozet", { p_baslangic: donem.baslangicTarih, p_bitis: donem.bitisTarih }),
    hesapHareketleriGetir(supabase, { baslangic: donem.baslangicTarih, bitis: donem.bitisTarih }),
    odenmisGiderleriGetir(supabase, donem.baslangicTarih, donem.bitisTarih),
    dersleriGetir(supabase, donem.baslangic, donem.bitis),
    yillik ? yillikSeriGetir(supabase, Number(donem.param)) : Promise.resolve([]),
  ]);
  const o = finansOzetiCoz(ozetVeri);
  const hesaplar = ((hesapVeri ?? []) as HesapSatiri[]).map((h) => ({ ...h, acilis_kurus: Number(h.acilis_kurus), giren_kurus: Number(h.giren_kurus), cikan_kurus: Number(h.cikan_kurus), kapanis_kurus: Number(h.kapanis_kurus) }));

  const gelir = gelirOzetiHesapla(hareketler);
  const kirilim = giderKirilimiHesapla(giderler, o.personel_hakedis_kurus ?? 0);
  const dagilim = kategoriDagilimi(giderler.map((g) => ({ kategori: g.kategori, tutar_kurus: g.tutar_kurus })));
  const durum = dersDurumOzetiHesapla(dersler);
  const netTahsilat = o.net_tahsilat_kurus ?? 0;
  const gider = toplamGider(o);
  const netKar = netTahsilat - gider;
  const marj = netTahsilat > 0 ? (netKar / netTahsilat) * 100 : 0;
  const ortDersGeliri = durum.tamamlanan > 0 ? netTahsilat / durum.tamamlanan : 0;

  let gunlukDokum: ReturnType<typeof gunlukDokumHesapla> = [];
  if (!yillik) {
    const musteriAdi = await musteriAdlariGetir(supabase, dersler.map((d) => d.musteri_id));
    gunlukDokum = gunlukDokumHesapla(hareketler, dersler, musteriAdi);
  }

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <style>{`@media print { aside, header[role="banner"] { display: none !important; } @page { margin: 12mm; } }`}</style>
      <PageHeader
        title="Finans Raporları"
        description={`${donem.etiket} · gelir, gider ve net sonuç`}
        icon={BarChart3}
        actions={
          <div className="print:hidden">
            <YazdirDugmesi />
          </div>
        }
      />

      <div className="print:hidden">
        <DonemCubugu yol="/panel/finans/raporlar" donem={donem} />
      </div>

      <section aria-label="Dönem özeti" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Toplam gelir" value={kurusTLyazi(netTahsilat)} icon={TrendingUp} iconTone="emerald" />
        <KpiCard label="Toplam gider" value={kurusTLyazi(gider)} icon={TrendingDown} iconTone="rose" />
        <KpiCard vurgu label={`Net kâr · %${marj.toFixed(0)} marj`} value={kurusTLyazi(netKar)} icon={BarChart3} />
        <KpiCard label={`Ort. ders geliri · ${durum.tamamlanan} ders`} value={kurusTLyazi(ortDersGeliri)} icon={Receipt} />
      </section>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ders durumu — {donem.etiket}</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(
              [
                ["Tamamlandı", durum.tamamlanan, "bg-success-soft text-success"],
                ["Planlı / derste", durum.planlanan, "bg-primary/10 text-primary"],
                ["Ertelendi", durum.ertelenen, "bg-surface-3 text-foreground"],
                ["İptal / Gelmedi", durum.iptalVeGelmedi, "bg-destructive-soft text-destructive"],
              ] as const
            ).map(([etiket, deger, sinif]) => (
              <div key={etiket} className="flex flex-col items-center gap-2 text-center">
                <span className={cn("flex size-14 items-center justify-center rounded-2xl text-lg font-semibold tabular-nums", sinif)}>{deger}</span>
                <span className="text-xs text-muted-foreground">{etiket}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {yillik && (
        <Card>
          <CardHeader>
            <CardTitle>{donem.etiket} — Aylık Gelir &amp; Gider</CardTitle>
          </CardHeader>
          <CardContent>
            <YillikGrafik aylar={aylar} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gelir detayı</CardTitle>
            <CardDescription>Müşteri ödemeleri yönteme göre; Kasa, Banka ve Kredi Kartı ekranlarıyla mutabıktır.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col text-sm">
            {[
              { etiket: "Nakit tahsilat", tutar: gelir.nakit },
              { etiket: "Kredi kartı tahsilat", tutar: gelir.krediKarti },
              { etiket: "Havale / EFT tahsilat", tutar: gelir.bankaHavalesi },
              ...(gelir.belirtilmemis > 0 ? [{ etiket: "Yöntemi belirtilmemiş tahsilat", tutar: gelir.belirtilmemis }] : []),
              { etiket: "Müşteri iadeleri", tutar: -gelir.iade },
            ].map((k) => (
              <div key={k.etiket} className="flex items-center justify-between border-b border-border py-2.5 last:border-b-0">
                <dt className="text-muted-foreground">{k.etiket}</dt>
                <dd className="tabular-nums">{kurusTLyazi(k.tutar)}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 font-semibold">
              <dt>Net tahsilat</dt>
              <dd className="tabular-nums text-success">{kurusTLyazi(gelir.netTahsilat)}</dd>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gider kalemleri</CardTitle>
            <CardDescription>Ödenmiş giderler ve personel hakediş/prim tahakkuku{gunluk ? " (maaş tahakkuku tek bir güne ait değildir; günlük görünümde 0 olabilir)" : ""}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col text-sm">
            {[
              { etiket: "Genel giderler", tutar: kirilim.genel },
              { etiket: "Kamu ödemeleri (vergi, SGK…)", tutar: kirilim.kamusal },
              { etiket: "Personel hakediş ve prim (tahakkuk)", tutar: kirilim.personel },
            ].map((k) => (
              <div key={k.etiket} className="flex items-center justify-between border-b border-border py-2.5 last:border-b-0">
                <dt className="text-muted-foreground">{k.etiket}</dt>
                <dd className="tabular-nums">{kurusTLyazi(k.tutar)}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 font-semibold">
              <dt>Toplam gider</dt>
              <dd className="tabular-nums text-destructive">{kurusTLyazi(kirilim.toplam)}</dd>
            </div>
            {dagilim.length > 0 && (
              <details className="mt-3 text-xs text-muted-foreground print:open">
                <summary className="cursor-pointer select-none text-foreground print:hidden">Kategori dağılımı ({dagilim.length})</summary>
                <ul className="mt-2 grid gap-2.5">
                  {dagilim.map((d) => (
                    <li key={d.kategori}>
                      <div className="mb-1 flex justify-between">
                        <span className="font-medium text-foreground">{GIDER_KATEGORI_ETIKETLERI[d.kategori] ?? d.kategori}</span>
                        <span className="tabular-nums">
                          {kurusTLyazi(d.tutar_kurus)} (%{d.yuzde})
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(d.yuzde, 1)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className={netKar < 0 ? "border-destructive-border" : undefined}>
        <CardHeader>
          <CardTitle>Net kâr / zarar</CardTitle>
          <CardDescription>Net tahsilat − (ödenmiş giderler + personel tahakkuku).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className={cn("text-2xl font-semibold tabular-nums", netKar >= 0 ? "text-success" : "text-destructive")}>{kurusTLyazi(netKar)}</p>
            <p className="text-xs text-muted-foreground">Kâr marjı: %{marj.toFixed(0)}</p>
          </div>
          <div className="flex flex-col items-end gap-1 text-sm text-muted-foreground">
            <span>
              Gelir: <span className="font-medium text-success tabular-nums">{kurusTLyazi(netTahsilat)}</span>
            </span>
            <span>
              Gider: <span className="font-medium text-destructive tabular-nums">{kurusTLyazi(gider)}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      <section aria-label="Nakit özeti" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Satış (iskonto öncesi)" value={kurusTLyazi(o.satis_kurus ?? 0)} icon={Receipt} />
        <KpiCard label="Verilen iskonto" value={kurusTLyazi(o.iskonto_kurus ?? 0)} icon={Receipt} />
        <KpiCard label="Personel ödemesi" value={kurusTLyazi(o.personel_odeme_kurus ?? 0)} icon={Users} />
        <KpiCard label="Açık cari alacak" value={kurusTLyazi(o.acik_alacak_kurus ?? 0)} icon={Landmark} iconTone="amber" />
        <KpiCard vurgu label="Nakit sonucu" value={kurusTLyazi(o.nakit_sonuc_kurus ?? 0)} icon={Wallet} />
      </section>
      <p className="-mt-3 text-xs text-muted-foreground">
        Nakit sonucu = net tahsilat − ödenmiş giderler − personel ödemesi. Personel hakediş tahakkuku ({kurusTLyazi(o.personel_hakedis_kurus ?? 0)}) ödenene kadar nakit sonucuna girmez.
      </p>

      {!yillik && (
        <Card>
          <CardHeader>
            <CardTitle>{gunluk ? "İş dökümü" : "Günlük döküm"}</CardTitle>
            <CardDescription>Dersler ve nakit hareketleri (tahsilat, iade, gider, personel ödemesi). Kasa/banka arası manuel kayıtlar dahil değildir.</CardDescription>
          </CardHeader>
          <CardContent>{gunluk ? <KalemListesi kalemler={gunlukDokum[0]?.kalemler ?? []} /> : <GunlukDokumKarti gunler={gunlukDokum} />}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Hesap özeti</CardTitle>
          <CardDescription>Kasa, banka ve kredi kartı hesaplarının dönem hareketi</CardDescription>
        </CardHeader>
        <CardContent>
          {hesaplar.length === 0 ? (
            <EmptyState compact icon={Landmark} title="Hesap hareketi yok" />
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

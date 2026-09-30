import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { HesapDefteri } from "@/components/panel/hesap-defteri";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { type Donem, donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { hesapHareketleriGetir } from "@/lib/panel/hesap-hareketleri";
import { FINANS_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AcilisFormu, ManuelHareketFormu } from "../finans/hesaplar/manuel-formlar";

export const metadata: Metadata = { title: "Kasa" };

type OzetSatiri = { hesap: string; banka_hesap_id: string | null; acilis_kurus: number; giren_kurus: number; cikan_kurus: number; kapanis_kurus: number };

/** Görünüm değişince aynı dönemde kal: gün→ay→yıl geçişlerinde param kısaltılır/uzatılır. */
function gorunumBaglantisi(d: Donem, yeni: Donem["gorunum"]): string {
  const p = d.param;
  const tarih = yeni === "gun" ? (d.gorunum === "gun" ? p : d.gorunum === "ay" ? `${p}-01` : `${p}-01-01`) : yeni === "ay" ? (d.gorunum === "yil" ? `${p}-01` : p.slice(0, 7)) : p.slice(0, 4);
  return `/panel/kasa?gorunum=${yeni}&tarih=${tarih}`;
}

export default async function KasaSayfasi({ searchParams }: { searchParams: Promise<{ gorunum?: string; tarih?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_ROLLERI);
  // Resepsiyon gider/personel/banka hareketlerini göremez: yalnız tahsilat özetine yönlenir.
  if (kullanici.rol === "resepsiyon") redirect("/panel/kasa/tahsilatlar");
  const yonetici = kullanici.rol === "isletme_admin";
  const parametreler = await searchParams;
  const donem = donemCoz(parametreler);
  const bugun = bugunIstanbulTarihi();

  const supabase = await createClient();
  const [{ data: ozetVeri }, satirlar, { data: hesapVeri }] = await Promise.all([
    supabase.rpc("hesap_ozet", { p_baslangic: donem.baslangicTarih, p_bitis: donem.bitisTarih }),
    hesapHareketleriGetir(supabase, { baslangic: donem.baslangicTarih, bitis: donem.bitisTarih, hesap: "kasa" }),
    supabase.rpc("banka_hesap_secenekleri"),
  ]);
  const kasa = ((ozetVeri ?? []) as OzetSatiri[]).map((o) => ({ ...o, acilis_kurus: Number(o.acilis_kurus), giren_kurus: Number(o.giren_kurus), cikan_kurus: Number(o.cikan_kurus), kapanis_kurus: Number(o.kapanis_kurus) })).find((o) => o.hesap === "kasa");
  const hesaplar = [{ kod: "kasa", ad: "Kasa" }, ...((hesapVeri ?? []) as { id: string; ad: string }[]).map((h) => ({ kod: h.id, ad: h.ad }))];
  const gorunumler: { g: Donem["gorunum"]; e: string }[] = [
    { g: "gun", e: "Günlük" },
    { g: "ay", e: "Aylık" },
    { g: "yil", e: "Yıllık" },
  ];

  return (
    <>
      <PageHeader
        title="Kasa"
        description={`${donem.etiket} · nakit hareketleri: tahsilat, iade, gider, personel ödemesi ve manuel kayıtlar`}
        icon={Banknote}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/panel/kasa/tahsilatlar" className={buttonVariants({ variant: "outline" })}>
              Tahsilat Özeti
            </Link>
            {yonetici && (
              <Link href="/panel/kasa/hizli-tahsilat" className={buttonVariants()}>
                <Plus aria-hidden /> Hızlı Tahsilat
              </Link>
            )}
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-border p-1" role="group" aria-label="Görünüm">
          {gorunumler.map(({ g, e }) => (
            <Link key={g} href={gorunumBaglantisi(donem, g)} aria-current={donem.gorunum === g ? "true" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", donem.gorunum === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-3")}>
              {e}
            </Link>
          ))}
        </div>
        <Link href={`/panel/kasa?gorunum=${donem.gorunum}&tarih=${donem.oncekiParam}`} aria-label="Önceki dönem" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeft aria-hidden />
        </Link>
        <Link href={`/panel/kasa?gorunum=${donem.gorunum}&tarih=${donem.sonrakiParam}`} aria-label="Sonraki dönem" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronRight aria-hidden />
        </Link>
        <Link href={`/panel/kasa?gorunum=${donem.gorunum}&tarih=${donem.gorunum === "gun" ? bugun : donem.gorunum === "ay" ? bugun.slice(0, 7) : bugun.slice(0, 4)}`} className="text-sm font-semibold text-primary hover:underline">
          Bugüne dön
        </Link>
      </div>

      <section aria-label="Kasa özeti" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Açılış bakiyesi" value={kurusTLyazi(kasa?.acilis_kurus ?? 0)} icon={Banknote} />
        <KpiCard label="Kasaya giren" value={kurusTLyazi(kasa?.giren_kurus ?? 0)} icon={Banknote} iconTone="emerald" />
        <KpiCard label="Kasadan çıkan" value={kurusTLyazi(kasa?.cikan_kurus ?? 0)} icon={Banknote} iconTone="rose" />
        <KpiCard vurgu label="Kapanış bakiyesi" value={kurusTLyazi(kasa?.kapanis_kurus ?? 0)} icon={Banknote} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Kasa hareketleri</CardTitle>
          <CardDescription>Nakit tahsilat/iade, nakit gider ve personel ödemesi otomatik düşer; diğer girişleri aşağıdan manuel kaydedin.</CardDescription>
        </CardHeader>
        <CardContent>
          <HesapDefteri satirlar={satirlar} bosMesaj="Bu dönemde kasa hareketi yok." />
        </CardContent>
      </Card>

      {yonetici && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Manuel hareket</CardTitle>
              <CardDescription>Kasaya giriş/çıkış veya hesaplar arası transfer. Kayıtlar değişmez; hata için ters kayıt girin.</CardDescription>
            </CardHeader>
            <CardContent>
              <ManuelHareketFormu hesaplar={hesaplar} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Kasa açılış bakiyesi</CardTitle>
            </CardHeader>
            <CardContent>
              <AcilisFormu hesapKodu="kasa" acilisKurus={kasa?.acilis_kurus ?? 0} />
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

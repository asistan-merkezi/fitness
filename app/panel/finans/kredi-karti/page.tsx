import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CreditCard } from "lucide-react";
import { HesapDefteri } from "@/components/panel/hesap-defteri";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { girenCikan } from "@/lib/panel/finans";
import { hesapHareketleriGetir } from "@/lib/panel/hesap-hareketleri";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kredi Kartı" };

export default async function KrediKartiSayfasi({ searchParams }: { searchParams: Promise<{ yil?: string }> }) {
  await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const { yil } = await searchParams;
  const donem = donemCoz({ gorunum: "yil", tarih: yil });
  const buYil = bugunIstanbulTarihi().slice(0, 4);

  const supabase = await createClient();
  const satirlar = await hesapHareketleriGetir(supabase, { baslangic: donem.baslangicTarih, bitis: donem.bitisTarih, hesap: "banka", yontem: "kredi_karti", limit: 500 });
  const { giren, cikan } = girenCikan(satirlar);
  const baglanti = (p: string) => `/panel/finans/kredi-karti?yil=${p}`;

  return (
    <>
      <PageHeader title="Kredi Kartı" description={`${donem.etiket} · kartla yapılan tahsilat, iade ve ödemeler`} icon={CreditCard} />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={baglanti(donem.oncekiParam)} aria-label="Önceki yıl" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeft aria-hidden />
        </Link>
        <Link href={baglanti(buYil)} aria-current={donem.param === buYil ? "date" : undefined} className={buttonVariants({ variant: donem.param === buYil ? "default" : "outline" })}>
          Bu Yıl
        </Link>
        <Link href={baglanti(donem.sonrakiParam)} aria-label="Sonraki yıl" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronRight aria-hidden />
        </Link>
      </div>

      <section aria-label="Kart özeti" className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Kart tahsilatı" value={kurusTLyazi(giren)} icon={CreditCard} iconTone="emerald" />
        <KpiCard label="Kart iadesi / ödemesi" value={kurusTLyazi(cikan)} icon={CreditCard} iconTone="rose" />
        <KpiCard vurgu label="Net" value={kurusTLyazi(giren - cikan)} icon={CreditCard} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Kart hareketleri</CardTitle>
          <CardDescription>Bu ekran salt okunurdur; kayıtlar müşteri ödemesi, iade ve gider ekranlarından oluşur.</CardDescription>
        </CardHeader>
        <CardContent>
          <HesapDefteri satirlar={satirlar} bosMesaj="Bu yıl kredi kartı hareketi yok." />
        </CardContent>
      </Card>
    </>
  );
}

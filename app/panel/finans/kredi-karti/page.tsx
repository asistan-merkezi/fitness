import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { DonemCubugu } from "@/components/panel/donem-cubugu";
import { GrupluDefter } from "@/components/panel/gruplu-defter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { defterSatirlari } from "@/lib/panel/finans";
import { hesapHareketleriGetir } from "@/lib/panel/hesap-hareketleri";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kredi Kartı" };

type OzetSatiri = { hesap: string; acilis_kurus: number; giren_kurus: number; cikan_kurus: number; kapanis_kurus: number };

/**
 * Kredi Kartı: POS ile alınan tahsilatlar ve kartla yapılan giderlerin mutabakatı (klinik düzeni). Üçüncü ödeme rayıdır
 * (nakit → Kasa, havale → Banka); salt okunurdur: kart için "elden" bir kasa kavramı yok, manuel kayıt girilmez.
 */
export default async function KrediKartiSayfasi({ searchParams }: { searchParams: Promise<{ gorunum?: string; tarih?: string }> }) {
  await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const parametreler = await searchParams;
  const donem = donemCoz(parametreler);

  const supabase = await createClient();
  const [{ data: ozetVeri }, satirlar] = await Promise.all([
    supabase.rpc("hesap_ozet", { p_baslangic: donem.baslangicTarih, p_bitis: donem.bitisTarih }),
    hesapHareketleriGetir(supabase, { baslangic: donem.baslangicTarih, bitis: donem.bitisTarih, hesap: "kart" }),
  ]);
  const kart = ((ozetVeri ?? []) as OzetSatiri[]).map((o) => ({ ...o, acilis_kurus: Number(o.acilis_kurus), giren_kurus: Number(o.giren_kurus), cikan_kurus: Number(o.cikan_kurus), kapanis_kurus: Number(o.kapanis_kurus) })).find((o) => o.hesap === "kart");

  return (
    <>
      <PageHeader title="Kredi Kartı" description={`${donem.etiket} · POS ile alınan tahsilatlar ve kartla yapılan giderlerin mutabakatı`} icon={CreditCard} />

      <DonemCubugu yol="/panel/finans/kredi-karti" donem={donem} />

      <section aria-label="Kart özeti" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Dönem başı bakiye" value={kurusTLyazi(kart?.acilis_kurus ?? 0)} icon={CreditCard} />
        <KpiCard label="Kart tahsilatı (gelen)" value={kurusTLyazi(kart?.giren_kurus ?? 0)} icon={CreditCard} iconTone="emerald" />
        <KpiCard label="İade / kartla ödeme (giden)" value={kurusTLyazi(kart?.cikan_kurus ?? 0)} icon={CreditCard} iconTone="rose" />
        <KpiCard vurgu label="Dönem sonu bakiye" value={kurusTLyazi(kart?.kapanis_kurus ?? 0)} icon={CreditCard} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Kart hareketleri</CardTitle>
          <CardDescription>Bu ekran salt okunurdur; kayıtlar müşteri ödemesi, iade ve gider ekranlarından oluşur. Satıra tıklayınca kalemler açılır.</CardDescription>
        </CardHeader>
        <CardContent>
          <GrupluDefter satirlar={defterSatirlari(satirlar)} acilisKurus={kart?.acilis_kurus ?? 0} gruplama={donem.gorunum === "yil" ? "ay" : "gun"} acik={donem.gorunum === "gun"} bosMesaj="Bu dönemde kredi kartı hareketi yok." />
        </CardContent>
      </Card>
    </>
  );
}

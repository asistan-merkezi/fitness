import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, Plus } from "lucide-react";
import { DonemCubugu } from "@/components/panel/donem-cubugu";
import { GrupluDefter } from "@/components/panel/gruplu-defter";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { defterSatirlari } from "@/lib/panel/finans";
import { hesapHareketleriGetir, manuelKayitlariGetir } from "@/lib/panel/hesap-hareketleri";
import { FINANS_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { CikanDiyalog, GirenDiyalog } from "../finans/hesaplar/hareket-diyaloglari";
import { AcilisFormu } from "../finans/hesaplar/manuel-formlar";
import { ManuelKayitlar } from "../finans/hesaplar/manuel-kayitlar";
import { hareketPencereVerileri } from "../finans/hesaplar/veri";

export const metadata: Metadata = { title: "Kasa" };

type OzetSatiri = { hesap: string; banka_hesap_id: string | null; acilis_kurus: number; giren_kurus: number; cikan_kurus: number; kapanis_kurus: number };

export default async function KasaSayfasi({ searchParams }: { searchParams: Promise<{ gorunum?: string; tarih?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_ROLLERI);
  // Resepsiyon gider/personel/banka hareketlerini göremez: yalnız tahsilat özetine yönlenir.
  if (kullanici.rol === "resepsiyon") redirect("/panel/kasa/tahsilatlar");
  const yonetici = kullanici.rol === "isletme_admin";
  const parametreler = await searchParams;
  const donem = donemCoz(parametreler);
  const bugun = bugunIstanbulTarihi();

  const supabase = await createClient();
  const [{ data: ozetVeri }, satirlar, manuelKayitlar, pencere, { data: isletmeVeri }] = await Promise.all([
    supabase.rpc("hesap_ozet", { p_baslangic: donem.baslangicTarih, p_bitis: donem.bitisTarih }),
    hesapHareketleriGetir(supabase, { baslangic: donem.baslangicTarih, bitis: donem.bitisTarih, hesap: "kasa", limit: 5000 }),
    manuelKayitlariGetir(supabase, { baslangic: donem.baslangicTarih, bitis: donem.bitisTarih, hesap: "kasa" }),
    hareketPencereVerileri(supabase),
    supabase.from("isletme").select("kasa_acilis_kurus").eq("id", kullanici.isletme_id).maybeSingle<{ kasa_acilis_kurus: number }>(),
  ]);
  const baslangicTutari = Number(isletmeVeri?.kasa_acilis_kurus ?? 0);
  const kasa = ((ozetVeri ?? []) as OzetSatiri[]).map((o) => ({ ...o, acilis_kurus: Number(o.acilis_kurus), giren_kurus: Number(o.giren_kurus), cikan_kurus: Number(o.cikan_kurus), kapanis_kurus: Number(o.kapanis_kurus) })).find((o) => o.hesap === "kasa");
  const hesaplar = [{ kod: "kasa", ad: "Kasa" }, ...pencere.hesapSecenekleri.map((h) => ({ kod: h.id, ad: h.ad }))];
  const hesapAdlari = new Map(pencere.hesapSecenekleri.map((h) => [h.id, h.ad]));

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

      <DonemCubugu yol="/panel/kasa" donem={donem} />

      <section aria-label="Kasa özeti" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Açılış bakiyesi" value={kurusTLyazi(kasa?.acilis_kurus ?? 0)} icon={Banknote} />
        <KpiCard label="Kasaya giren" value={kurusTLyazi(kasa?.giren_kurus ?? 0)} icon={Banknote} iconTone="emerald" />
        <KpiCard label="Kasadan çıkan" value={kurusTLyazi(kasa?.cikan_kurus ?? 0)} icon={Banknote} iconTone="rose" />
        <KpiCard vurgu label="Kapanış bakiyesi" value={kurusTLyazi(kasa?.kapanis_kurus ?? 0)} icon={Banknote} />
      </section>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Kasa başlangıç tutarı</p>
            <p className="text-xl font-semibold tabular-nums">{kurusTLyazi(baslangicTutari)}</p>
          </div>
          {yonetici && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-primary select-none">Düzenle</summary>
              <div className="mt-3">
                <AcilisFormu hesapKodu="kasa" acilisKurus={baslangicTutari} />
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {yonetici && (
        <div className="flex flex-wrap gap-2">
          <GirenDiyalog hesap="kasa" bankaMi={false} bugun={bugun} />
          <CikanDiyalog hesap="kasa" bankaMi={false} hesaplar={hesaplar} hesapSecenekleri={pencere.hesapSecenekleri} personel={pencere.personel} araclar={pencere.araclar} bugun={bugun} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Kasa hareketleri</CardTitle>
          <CardDescription>Nakit tahsilat/iade, nakit gider ve personel ödemesi otomatik düşer; diğer girişleri ve çıkışları yukarıdaki düğmelerle kaydedin. Satıra tıklayınca kalemler açılır.</CardDescription>
        </CardHeader>
        <CardContent>
          <GrupluDefter satirlar={defterSatirlari(satirlar)} acilisKurus={kasa?.acilis_kurus ?? 0} gruplama={donem.gorunum === "yil" ? "ay" : "gun"} acik={donem.gorunum === "gun"} bosMesaj="Bu dönemde kasa hareketi yok." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manuel kasa kayıtları</CardTitle>
          <CardDescription>Elle girilen giriş, çıkış ve transferler. Kayıtlar değişmez; hata için ters kayıt girin.</CardDescription>
        </CardHeader>
        <CardContent>
          <ManuelKayitlar kayitlar={manuelKayitlar} hesap="kasa" hesapAdlari={hesapAdlari} bosMetin="Bu dönemde manuel kasa kaydı yok." />
        </CardContent>
      </Card>
    </>
  );
}

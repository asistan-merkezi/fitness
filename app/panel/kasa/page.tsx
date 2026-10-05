import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { KlinikDonemCubugu } from "@/components/panel/donem-cubugu";
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
import { hesapHareketleriGetir } from "@/lib/panel/hesap-hareketleri";
import { FINANS_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { CikanDiyalog, GirenDiyalog } from "../finans/hesaplar/hareket-diyaloglari";
import { KasaKontrolDiyalog } from "../finans/hesaplar/kasa-kontrol";
import { hareketPencereVerileri } from "../finans/hesaplar/veri";

export const metadata: Metadata = { title: "Kasa" };

type IsletmeKasa = { kasa_acilis_kurus: number; kasa_baslangic_zamani: string | null; kasa_baslangic_giren: { ad_soyad: string } | null };
type OzetSatiri = { hesap: string; banka_hesap_id: string | null; acilis_kurus: number; giren_kurus: number; cikan_kurus: number; kapanis_kurus: number };

export default async function KasaSayfasi({ searchParams }: { searchParams: Promise<{ gorunum?: string; tarih?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_ROLLERI);
  // Resepsiyon gider/personel/banka hareketlerini göremez: yalnız tahsilat özetine yönlenir.
  if (kullanici.rol === "resepsiyon") redirect("/panel/kasa/tahsilatlar");
  const yonetici = kullanici.rol === "isletme_admin";
  const parametreler = await searchParams;
  // Klinikteki gibi Kasa Yıllık/Aylık görünür; eski günlük bağlantılar o ayın görünümüne düşer.
  const donem = donemCoz({ gorunum: parametreler.gorunum === "yil" ? "yil" : "ay", tarih: parametreler.gorunum === "yil" ? parametreler.tarih?.slice(0, 4) : parametreler.tarih?.slice(0, 7) });
  const bugun = bugunIstanbulTarihi();

  const supabase = await createClient();
  const [{ data: ozetVeri }, satirlar, pencere, { data: isletmeVeri }] = await Promise.all([
    supabase.rpc("hesap_ozet", { p_baslangic: donem.baslangicTarih, p_bitis: donem.bitisTarih }),
    hesapHareketleriGetir(supabase, { baslangic: donem.baslangicTarih, bitis: donem.bitisTarih, hesap: "kasa" }),
    hareketPencereVerileri(supabase),
    // Kasa Kontrol penceresi: başlangıç tutarı + giriş zamanı + giren kişi (yalnız yönetici penceresi kullanır).
    yonetici ? supabase.from("isletme").select("kasa_acilis_kurus, kasa_baslangic_zamani, kasa_baslangic_giren:kullanici!kasa_baslangic_giren_id(ad_soyad)").eq("id", kullanici.isletme_id).maybeSingle<IsletmeKasa>() : Promise.resolve({ data: null }),
  ]);
  const baslangicTutari = Number(isletmeVeri?.kasa_acilis_kurus ?? 0);
  const kasa = ((ozetVeri ?? []) as OzetSatiri[]).map((o) => ({ ...o, acilis_kurus: Number(o.acilis_kurus), giren_kurus: Number(o.giren_kurus), cikan_kurus: Number(o.cikan_kurus), kapanis_kurus: Number(o.kapanis_kurus) })).find((o) => o.hesap === "kasa");
  const hesaplar = [{ kod: "kasa", ad: "Kasa" }, ...pencere.hesapSecenekleri.map((h) => ({ kod: h.id, ad: h.ad }))];

  return (
    <>
      <PageHeader
        title="Kasa"
        breadcrumb="Finans › Kasa"
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

      <div className="flex flex-wrap items-center justify-end gap-3">
        {yonetici && (
          <div className="flex flex-wrap gap-2">
            <KasaKontrolDiyalog baslangicKurus={baslangicTutari} baslangicZamani={isletmeVeri?.kasa_baslangic_zamani ?? null} baslangicGiren={isletmeVeri?.kasa_baslangic_giren?.ad_soyad ?? null} girenKisi={kullanici.ad_soyad ?? ""} />
            <GirenDiyalog hesap="kasa" bankaMi={false} bugun={bugun} />
            <CikanDiyalog hesap="kasa" bankaMi={false} hesaplar={hesaplar} hesapSecenekleri={pencere.hesapSecenekleri} personel={pencere.personel} araclar={pencere.araclar} bugun={bugun} />
          </div>
        )}
      </div>

      <KlinikDonemCubugu yol="/panel/kasa" donem={donem} />

      <section aria-label="Kasa özeti" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Dönem Başı Bakiye" value={kurusTLyazi(kasa?.acilis_kurus ?? 0)} />
        <KpiCard label="Toplam Nakit Tahsilat" value={<span className="text-success">{kurusTLyazi(kasa?.giren_kurus ?? 0)}</span>} />
        <KpiCard label="Toplam Nakit Ödenen Gider" value={<span className="text-destructive">{kurusTLyazi(kasa?.cikan_kurus ?? 0)}</span>} />
        <KpiCard label="Dönem Sonu Bakiye" value={kurusTLyazi(kasa?.kapanis_kurus ?? 0)} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Kasa Hareketleri</CardTitle>
          <CardDescription>Nakit tahsilat/iade, nakit gider, personel ödemesi, manuel giriş/çıkış/transfer, kasa başlangıç ve dengeleme burada tek listede görünür. Satıra tıklayınca o günün (yıllıkta o ayın) tüm hareketleri açılır. Defter değişmezdir: hata için ters kayıt girin.</CardDescription>
        </CardHeader>
        <CardContent>
          <GrupluDefter satirlar={defterSatirlari(satirlar)} acilisKurus={kasa?.acilis_kurus ?? 0} gruplama={donem.gorunum === "yil" ? "ay" : "gun"} girenBaslik="Nakit Tahsilat" cikanBaslik="Nakit Ödenen Gider" bosMesaj="Bu dönemde kasa hareketi yok." />
        </CardContent>
      </Card>
    </>
  );
}

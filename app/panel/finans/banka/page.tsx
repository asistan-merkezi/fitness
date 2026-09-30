import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Landmark } from "lucide-react";
import { HesapDefteri } from "@/components/panel/hesap-defteri";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { hesapHareketleriGetir } from "@/lib/panel/hesap-hareketleri";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AcilisFormu, ManuelHareketFormu } from "../hesaplar/manuel-formlar";

export const metadata: Metadata = { title: "Banka" };

type OzetSatiri = { hesap: string; banka_hesap_id: string | null; ad: string | null; acilis_kurus: number; giren_kurus: number; cikan_kurus: number; kapanis_kurus: number };

export default async function BankaSayfasi({ searchParams }: { searchParams: Promise<{ ay?: string; hesap?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";
  const { ay, hesap } = await searchParams;
  const donem = donemCoz({ gorunum: "ay", tarih: ay });
  const buAy = bugunIstanbulTarihi().slice(0, 7);

  const supabase = await createClient();
  const [{ data: ozetVeri }, { data: hesapVeri }] = await Promise.all([
    supabase.rpc("hesap_ozet", { p_baslangic: donem.baslangicTarih, p_bitis: donem.bitisTarih }),
    supabase.rpc("banka_hesap_secenekleri"),
  ]);
  const bankaSatirlari = ((ozetVeri ?? []) as OzetSatiri[])
    .filter((o) => o.hesap === "banka")
    .map((o) => ({ ...o, acilis_kurus: Number(o.acilis_kurus), giren_kurus: Number(o.giren_kurus), cikan_kurus: Number(o.cikan_kurus), kapanis_kurus: Number(o.kapanis_kurus) }));
  const hesaplar = [{ kod: "kasa", ad: "Kasa" }, ...((hesapVeri ?? []) as { id: string; ad: string }[]).map((h) => ({ kod: h.id, ad: h.ad }))];

  const secili = hesap && (hesap === "atanmamis" || bankaSatirlari.some((b) => b.banka_hesap_id === hesap)) ? hesap : undefined;
  const satirlar = await hesapHareketleriGetir(supabase, { baslangic: donem.baslangicTarih, bitis: donem.bitisTarih, hesap: "banka", bankaHesapId: secili });
  const toplam = bankaSatirlari.reduce((t, b) => t + b.kapanis_kurus, 0);
  const baglanti = (p: string, h?: string) => `/panel/finans/banka?ay=${p}${h ? `&hesap=${h}` : ""}`;

  return (
    <>
      <PageHeader title="Banka" description={`${donem.etiket} · havale / EFT ve kart hareketleri hesap hesap`} icon={Landmark} />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={baglanti(donem.oncekiParam, secili)} aria-label="Önceki ay" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeft aria-hidden />
        </Link>
        <Link href={baglanti(buAy, secili)} aria-current={donem.param === buAy ? "date" : undefined} className={buttonVariants({ variant: donem.param === buAy ? "default" : "outline" })}>
          Bu Ay
        </Link>
        <Link href={baglanti(donem.sonrakiParam, secili)} aria-label="Sonraki ay" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronRight aria-hidden />
        </Link>
      </div>

      {bankaSatirlari.length === 0 ? (
        <EmptyState icon={Landmark} title="Banka hareketi yok" description="Şirket Bilgileri sayfasından IBAN ekleyin; tahsilatlar ve giderler hesaba göre izlenir." />
      ) : (
        <>
          <section aria-label="Banka özeti" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard vurgu label="Toplam banka bakiyesi" value={kurusTLyazi(toplam)} icon={Landmark} />
            {bankaSatirlari.map((b) => (
              <Link key={b.banka_hesap_id ?? "atanmamis"} href={baglanti(donem.param, b.banka_hesap_id ?? "atanmamis")} className="block">
                <KpiCard label={b.ad ?? "Hesap atanmamış"} value={kurusTLyazi(b.kapanis_kurus)} icon={Landmark} />
              </Link>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Hesap hareketleri</CardTitle>
              <CardDescription>
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={baglanti(donem.param)} className={cn("rounded-md px-2 py-1 text-xs font-semibold", !secili ? "bg-primary text-primary-foreground" : "bg-surface-3")}>
                    Tümü
                  </Link>
                  {bankaSatirlari.map((b) => {
                    const id = b.banka_hesap_id ?? "atanmamis";
                    return (
                      <Link key={id} href={baglanti(donem.param, id)} className={cn("rounded-md px-2 py-1 text-xs font-semibold", secili === id ? "bg-primary text-primary-foreground" : "bg-surface-3")}>
                        {b.ad ?? "Hesap atanmamış"}
                      </Link>
                    );
                  })}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HesapDefteri satirlar={satirlar} bosMesaj="Bu dönemde banka hareketi yok." />
            </CardContent>
          </Card>
        </>
      )}

      {yonetici && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Manuel hareket</CardTitle>
              <CardDescription>Banka hesabına giriş/çıkış veya hesaplar arası transfer (ör. kasadan bankaya yatırma).</CardDescription>
            </CardHeader>
            <CardContent>
              <ManuelHareketFormu hesaplar={hesaplar} varsayilanHesap={hesaplar[1]?.kod ?? "kasa"} />
            </CardContent>
          </Card>
          {bankaSatirlari.some((b) => b.banka_hesap_id) && (
            <Card>
              <CardHeader>
                <CardTitle>Açılış bakiyeleri</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {bankaSatirlari
                  .filter((b) => b.banka_hesap_id)
                  .map((b) => (
                    <div key={b.banka_hesap_id}>
                      <p className="mb-2 text-sm font-semibold">{b.ad}</p>
                      <AcilisFormu hesapKodu={b.banka_hesap_id as string} acilisKurus={b.acilis_kurus} />
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  );
}

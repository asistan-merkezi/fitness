import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { GIDER_KATEGORI_ETIKETLERI, kategoriDagilimi, vadesiGecti } from "@/lib/panel/finans";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { DonemSecici } from "./donem-secici";
import { BekleyenGiderler, GiderTablosu } from "./gider-tablosu";
import { GiderlerSekmeCubugu } from "./giderler-sekme-cubugu";
import { bekleyenGiderleriGetir, GIDER_SECIM, type Gider } from "./sorgular";
import { YeniGiderButonu } from "./yeni-gider-butonu";

export const metadata: Metadata = { title: "Giderler" };

/** Genel Giderler: kira, fatura, malzeme gibi olağan işletme giderleri (`tur='gider'`); Aylık/Yıllık dönemli. */
export default async function GiderlerSayfasi({ searchParams }: { searchParams: Promise<{ gorunum?: string; donem?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";
  const { gorunum, donem: donemParam } = await searchParams;
  const donem = donemCoz({ gorunum: gorunum === "yil" ? "yil" : "ay", tarih: donemParam });
  const bugun = bugunIstanbulTarihi();

  const supabase = await createClient();
  const [{ data: donemVeri }, bekleyenler, { data: hesapVeri }] = await Promise.all([
    supabase.from("gider").select(GIDER_SECIM).eq("tur", "gider").gte("tarih", donem.baslangicTarih).lt("tarih", donem.bitisTarih).order("tarih", { ascending: false }).limit(500),
    bekleyenGiderleriGetir(supabase, "gider"),
    supabase.rpc("banka_hesap_secenekleri"),
  ]);
  const giderler = (donemVeri ?? []) as Gider[];
  const hesaplar = (hesapVeri ?? []) as { id: string; ad: string }[];

  const odenenler = giderler.filter((g) => g.durum === "odendi");
  const toplam = odenenler.reduce((t, g) => t + Number(g.tutar_kurus), 0);
  const bekleyenToplam = bekleyenler.reduce((t, g) => t + Number(g.tutar_kurus), 0);
  const gecikenToplam = bekleyenler.filter((g) => vadesiGecti(g.vade_tarihi, bugun)).reduce((t, g) => t + Number(g.tutar_kurus), 0);
  const dagilim = kategoriDagilimi(odenenler.map((g) => ({ kategori: g.kategori, tutar_kurus: Number(g.tutar_kurus) })));

  return (
    <>
      <PageHeader title="Giderler" description="Kira, sarf malzeme, fatura gibi genel işletme giderleri." icon={Wallet} actions={<YeniGiderButonu tur="gider" hesaplar={hesaplar} bugun={bugun} />} />

      <GiderlerSekmeCubugu aktif="/panel/finans/giderler" />
      <DonemSecici yol="/panel/finans/giderler" donem={donem} />

      <section aria-label="Gider özeti" className="grid gap-4 sm:grid-cols-3">
        <KpiCard vurgu label="Dönem toplamı (ödenen)" value={kurusTLyazi(toplam)} icon={Wallet} />
        <KpiCard label="Ödenecek (bekleyen)" value={kurusTLyazi(bekleyenToplam)} icon={Wallet} iconTone="amber" />
        <KpiCard label="Vadesi geçen" value={kurusTLyazi(gecikenToplam)} icon={Wallet} iconTone={gecikenToplam > 0 ? "rose" : "neutral"} />
      </section>

      <BekleyenGiderler bekleyenler={bekleyenler} hesaplar={hesaplar} yonetici={yonetici} bugun={bugun} baslik="Ödenecek giderler" />

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

      <GiderTablosu baslik="Dönem giderleri" giderler={giderler} yonetici={yonetici} bugun={bugun} bosMetin="Bu dönemde gider kaydı yok." />
    </>
  );
}

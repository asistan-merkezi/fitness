import type { Metadata } from "next";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { DonemCubugu } from "@/components/panel/donem-cubugu";
import { GrupluDefter } from "@/components/panel/gruplu-defter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { defterSatirlari } from "@/lib/panel/finans";
import { hesapHareketleriGetir, manuelKayitlariGetir } from "@/lib/panel/hesap-hareketleri";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { CikanDiyalog, GirenDiyalog } from "../hesaplar/hareket-diyaloglari";
import { AcilisFormu } from "../hesaplar/manuel-formlar";
import { ManuelKayitlar } from "../hesaplar/manuel-kayitlar";
import { hareketPencereVerileri } from "../hesaplar/veri";

export const metadata: Metadata = { title: "Banka" };

type OzetSatiri = { hesap: string; banka_hesap_id: string | null; ad: string | null; acilis_kurus: number; giren_kurus: number; cikan_kurus: number; kapanis_kurus: number };

/** Banka: hesap hesap havale/EFT takibi (klinik düzeni). Kredi kartı hareketleri burada değil, Kredi Kartı ekranındadır. */
export default async function BankaSayfasi({ searchParams }: { searchParams: Promise<{ gorunum?: string; tarih?: string; hesap?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";
  const parametreler = await searchParams;
  const donem = donemCoz(parametreler);
  const bugun = bugunIstanbulTarihi();

  const supabase = await createClient();
  const [{ data: ozetVeri }, pencere, { data: hesapKayitlari }] = await Promise.all([
    supabase.rpc("hesap_ozet", { p_baslangic: donem.baslangicTarih, p_bitis: donem.bitisTarih }),
    hareketPencereVerileri(supabase),
    // Açılış bakiyesinin KAYITLI değeri (özetteki "açılış" öncesi hareketleri de içerir; düzenleme formu kaydedileni göstermeli).
    supabase.from("isletme_banka_hesabi").select("id, acilis_bakiye_kurus"),
  ]);
  const bankaSatirlari = ((ozetVeri ?? []) as OzetSatiri[])
    .filter((o) => o.hesap === "banka")
    .map((o) => ({ ...o, acilis_kurus: Number(o.acilis_kurus), giren_kurus: Number(o.giren_kurus), cikan_kurus: Number(o.cikan_kurus), kapanis_kurus: Number(o.kapanis_kurus) }));
  const kayitliAcilis = new Map(((hesapKayitlari ?? []) as { id: string; acilis_bakiye_kurus: number }[]).map((h) => [h.id, Number(h.acilis_bakiye_kurus)]));
  const hesaplar = [{ kod: "kasa", ad: "Kasa" }, ...pencere.hesapSecenekleri.map((h) => ({ kod: h.id, ad: h.ad }))];
  const hesapAdlari = new Map(pencere.hesapSecenekleri.map((h) => [h.id, h.ad]));

  const secili = parametreler.hesap && (parametreler.hesap === "atanmamis" || bankaSatirlari.some((b) => b.banka_hesap_id === parametreler.hesap)) ? parametreler.hesap : undefined;
  const seciliGercek = secili && secili !== "atanmamis" ? secili : undefined; // işlem yapılabilen (kayıtlı) hesap
  const gorunenSatirlar = secili ? bankaSatirlari.filter((b) => (b.banka_hesap_id ?? "atanmamis") === secili) : bankaSatirlari;
  const toplam = (alan: "acilis_kurus" | "giren_kurus" | "cikan_kurus" | "kapanis_kurus") => gorunenSatirlar.reduce((t, b) => t + b[alan], 0);

  const [satirlar, manuelKayitlar] = await Promise.all([
    hesapHareketleriGetir(supabase, { baslangic: donem.baslangicTarih, bitis: donem.bitisTarih, hesap: "banka", bankaHesapId: secili, limit: 5000 }),
    manuelKayitlariGetir(supabase, { baslangic: donem.baslangicTarih, bitis: donem.bitisTarih, hesap: seciliGercek ?? "banka" }),
  ]);
  const hesapAnahtari = (id: string | null) => id ?? "atanmamis";
  const baglanti = (h?: string) => `/panel/finans/banka?gorunum=${donem.gorunum}&tarih=${donem.param}${h ? `&hesap=${h}` : ""}`;
  const seciliAd = secili ? (bankaSatirlari.find((b) => hesapAnahtari(b.banka_hesap_id) === secili)?.ad ?? "Hesap") : "Tüm hesaplar";

  return (
    <>
      <PageHeader title="Banka" description={`${donem.etiket} · banka hesapları bazında havale / EFT gelir-gider takibi`} icon={Landmark} />

      <DonemCubugu yol="/panel/finans/banka" donem={donem} ek={secili ? `hesap=${secili}` : ""} />

      {bankaSatirlari.length === 0 ? (
        <EmptyState icon={Landmark} title="Kayıtlı banka hesabı yok" description="Ayarlar > Şirket Bilgileri'nden banka hesabı (IBAN) ekleyin; tahsilatlar ve giderler hesaba göre izlenir." />
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Hesap">
            <Link href={baglanti()} aria-current={!secili ? "true" : undefined} className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold", !secili ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2 hover:bg-surface-3")}>
              Tümü
            </Link>
            {bankaSatirlari.map((b) => {
              const anahtar = hesapAnahtari(b.banka_hesap_id);
              return (
                <Link key={anahtar} href={baglanti(anahtar)} aria-current={secili === anahtar ? "true" : undefined} className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold", secili === anahtar ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2 hover:bg-surface-3")}>
                  {b.ad ?? "Hesap atanmamış"}
                </Link>
              );
            })}
          </div>

          <section aria-label="Banka özeti" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Dönem başı bakiye" value={kurusTLyazi(toplam("acilis_kurus"))} icon={Landmark} />
            <KpiCard label="Bankaya giren" value={kurusTLyazi(toplam("giren_kurus"))} icon={Landmark} iconTone="emerald" />
            <KpiCard label="Bankadan çıkan" value={kurusTLyazi(toplam("cikan_kurus"))} icon={Landmark} iconTone="rose" />
            <KpiCard vurgu label={`${seciliAd} — dönem sonu`} value={kurusTLyazi(toplam("kapanis_kurus"))} icon={Landmark} />
          </section>

          {yonetici &&
            (seciliGercek ? (
              <div className="flex flex-wrap gap-2">
                <GirenDiyalog hesap={seciliGercek} bankaMi bugun={bugun} />
                <CikanDiyalog hesap={seciliGercek} bankaMi hesaplar={hesaplar} hesapSecenekleri={pencere.hesapSecenekleri} personel={pencere.personel} araclar={pencere.araclar} bugun={bugun} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Hareket eklemek için yukarıdan bir banka hesabı seçin.</p>
            ))}

          <Card>
            <CardHeader>
              <CardTitle>Hesap hareketleri</CardTitle>
              <CardDescription>Havale/EFT tahsilat ve iadeleri, havale ile ödenen giderler ve personel ödemeleri otomatik düşer. Satıra tıklayınca kalemler açılır.</CardDescription>
            </CardHeader>
            <CardContent>
              <GrupluDefter satirlar={defterSatirlari(satirlar)} acilisKurus={toplam("acilis_kurus")} gruplama={donem.gorunum === "yil" ? "ay" : "gun"} acik={donem.gorunum === "gun"} bosMesaj="Bu dönemde banka hareketi yok." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Havale kayıtları</CardTitle>
              <CardDescription>Elle girilen giriş, çıkış ve transferler. Kayıtlar değişmez; hata için ters kayıt girin.</CardDescription>
            </CardHeader>
            <CardContent>
              <ManuelKayitlar kayitlar={manuelKayitlar} hesap={seciliGercek ?? ""} hesapAdlari={hesapAdlari} bosMetin="Bu dönemde manuel banka kaydı yok." />
            </CardContent>
          </Card>

          {yonetici && (
            <Card>
              <CardHeader>
                <CardTitle>Açılış bakiyeleri</CardTitle>
                <CardDescription>Kayıtlara başlamadan önceki bakiye. Hesabı kullanmaya başlarken bir kez girilir.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {bankaSatirlari
                  .filter((b) => b.banka_hesap_id && (!seciliGercek || b.banka_hesap_id === seciliGercek))
                  .map((b) => (
                    <div key={b.banka_hesap_id}>
                      <p className="mb-2 text-sm font-semibold">{b.ad}</p>
                      <AcilisFormu hesapKodu={b.banka_hesap_id as string} acilisKurus={kayitliAcilis.get(b.banka_hesap_id as string) ?? 0} />
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

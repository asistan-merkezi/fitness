import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { KlinikDonemCubugu } from "@/components/panel/donem-cubugu";
import { GrupluDefter } from "@/components/panel/gruplu-defter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { defterSatirlari } from "@/lib/panel/finans";
import { hesapHareketleriGetir } from "@/lib/panel/hesap-hareketleri";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { CikanDiyalog, GirenDiyalog } from "../hesaplar/hareket-diyaloglari";
import { AcilisFormu } from "../hesaplar/manuel-formlar";
import { hareketPencereVerileri } from "../hesaplar/veri";

export const metadata: Metadata = { title: "Banka" };

type OzetSatiri = { hesap: string; banka_hesap_id: string | null; ad: string | null; acilis_kurus: number; giren_kurus: number; cikan_kurus: number; kapanis_kurus: number };

/** Banka: hesap hesap havale/EFT takibi (klinik düzeni). Kredi kartı hareketleri burada değil, Kredi Kartı ekranındadır. */
export default async function BankaSayfasi({ searchParams }: { searchParams: Promise<{ gorunum?: string; tarih?: string; hesap?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";
  const parametreler = await searchParams;
  // Klinikteki gibi Banka Yıllık/Aylık görünür (eski günlük bağlantılar o ayın görünümüne düşer).
  const yillik = parametreler.gorunum === "yil";
  const donem = donemCoz({ gorunum: yillik ? "yil" : "ay", tarih: yillik ? parametreler.tarih?.slice(0, 4) : parametreler.tarih?.slice(0, 7) });
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

  // Klinikteki gibi tek hesap seçilidir (varsayılan: ilk hesap); "Tümü" sekmesi yoktur.
  const hesapAnahtari = (id: string | null) => id ?? "atanmamis";
  const secili = bankaSatirlari.find((b) => hesapAnahtari(b.banka_hesap_id) === parametreler.hesap) ? parametreler.hesap : bankaSatirlari[0] ? hesapAnahtari(bankaSatirlari[0].banka_hesap_id) : undefined;
  const seciliGercek = secili && secili !== "atanmamis" ? secili : undefined; // işlem yapılabilen (kayıtlı) hesap
  const gorunenSatirlar = secili ? bankaSatirlari.filter((b) => (b.banka_hesap_id ?? "atanmamis") === secili) : bankaSatirlari;
  const toplam = (alan: "acilis_kurus" | "giren_kurus" | "cikan_kurus" | "kapanis_kurus") => gorunenSatirlar.reduce((t, b) => t + b[alan], 0);

  const satirlar = await hesapHareketleriGetir(supabase, { baslangic: donem.baslangicTarih, bitis: donem.bitisTarih, hesap: "banka", bankaHesapId: secili });
  // Hesap adı veritabanında "Banka · Şube" gelir; klinikteki gibi "Banka — Şube" gösterilir.
  const hesapEtiketi = (ad: string | null) => (ad ?? "Hesap atanmamış").replace(" · ", " — ");
  const baglanti = (h?: string) => `/panel/finans/banka?gorunum=${donem.gorunum}&tarih=${donem.param}${h ? `&hesap=${h}` : ""}`;

  return (
    <>
      <PageHeader title="Banka" breadcrumb="Finans › Banka" />

      {/* Hesap yokken de tam düzen görünür (klinikteki gibi): hesap sekmesi yerine yönlendirme, hareket düğmeleri devre dışı. */}
      <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Hesap">
              {bankaSatirlari.length === 0 && (
                <p className="rounded-lg border border-dashed border-border bg-card px-4 py-2 text-sm text-muted-foreground">Kayıtlı banka hesabı yok — Ayarlar &gt; Şirket Bilgileri&apos;nden banka hesabı (IBAN) ekleyin.</p>
              )}
              {bankaSatirlari.map((b) => {
                const anahtar = hesapAnahtari(b.banka_hesap_id);
                return (
                  <Link key={anahtar} href={baglanti(anahtar)} aria-current={secili === anahtar ? "true" : undefined} className={cn("rounded-lg border px-4 py-2 text-sm font-medium", secili === anahtar ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-surface-2")}>
                    {hesapEtiketi(b.ad)}
                  </Link>
                );
              })}
            </div>
            {yonetici && bankaSatirlari.length === 0 && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled>
                  <ArrowDownToLine aria-hidden /> Bankaya Giren
                </Button>
                <Button type="button" variant="outline" disabled>
                  <ArrowUpFromLine aria-hidden /> Bankadan Çıkan
                </Button>
              </div>
            )}
            {yonetici && seciliGercek && (
              <div className="flex flex-wrap gap-2">
                <GirenDiyalog hesap={seciliGercek} bankaMi bugun={bugun} />
                <CikanDiyalog hesap={seciliGercek} bankaMi hesaplar={hesaplar} hesapSecenekleri={pencere.hesapSecenekleri} personel={pencere.personel} araclar={pencere.araclar} bugun={bugun} />
              </div>
            )}
          </div>

          <KlinikDonemCubugu yol="/panel/finans/banka" donem={donem} ek={secili ? `hesap=${secili}` : ""} />

          <section aria-label="Banka özeti" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Dönem Başı Bakiye" value={kurusTLyazi(toplam("acilis_kurus"))} />
            <KpiCard label="Toplam Havale Tahsilat" value={<span className="text-success">{kurusTLyazi(toplam("giren_kurus"))}</span>} />
            <KpiCard label="Toplam Havale Ödenen Gider" value={<span className="text-destructive">{kurusTLyazi(toplam("cikan_kurus"))}</span>} />
            <KpiCard label="Dönem Sonu Bakiye" value={kurusTLyazi(toplam("kapanis_kurus"))} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Hesap Hareketleri</CardTitle>
              <CardDescription>Havale/EFT tahsilat ve iadeleri, havale ile ödenen giderler, personel ödemeleri ve manuel giriş/çıkış/transferler burada tek listede görünür. Satıra tıklayınca o günün (yıllıkta o ayın) tüm hareketleri açılır. Defter değişmezdir: hata için ters kayıt girin.</CardDescription>
            </CardHeader>
            <CardContent>
              <GrupluDefter satirlar={defterSatirlari(satirlar)} acilisKurus={toplam("acilis_kurus")} gruplama={donem.gorunum === "yil" ? "ay" : "gun"} girenBaslik="Havale Tahsilat" cikanBaslik="Havale Ödenen Gider" bosMesaj="Bu dönemde banka hareketi yok." />
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
                      <p className="mb-2 text-sm font-semibold">{hesapEtiketi(b.ad)}</p>
                      <AcilisFormu hesapKodu={b.banka_hesap_id as string} acilisKurus={kayitliAcilis.get(b.banka_hesap_id as string) ?? 0} />
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
      </>
    </>
  );
}

import type { Metadata } from "next";
import { Landmark } from "lucide-react";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { vadesiGecti } from "@/lib/panel/finans";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { DonemSecici } from "../donem-secici";
import { BekleyenGiderler, GiderTablosu } from "../gider-tablosu";
import { GiderlerSekmeCubugu } from "../giderler-sekme-cubugu";
import { bekleyenGiderleriGetir, GIDER_SECIM, giderDonemTarihi, type Gider } from "../sorgular";
import { YeniGiderButonu } from "../yeni-gider-butonu";

export const metadata: Metadata = { title: "Kamusal Giderler" };

const YOL = "/panel/finans/giderler/kamusal-giderler";

function Ozet({ baslik, kayitlar }: { baslik: string; kayitlar: Gider[] }) {
  const odenen = kayitlar.filter((g) => g.durum === "odendi").reduce((t, g) => t + Number(g.tutar_kurus), 0);
  const bekleyen = kayitlar.filter((g) => g.durum === "bekliyor").reduce((t, g) => t + Number(g.tutar_kurus), 0);
  return (
    <section aria-label={`${baslik} özeti`} className="grid gap-4 sm:grid-cols-3">
      <KpiCard vurgu label={`${baslik} — Ödenen`} value={kurusTLyazi(odenen)} icon={Landmark} />
      <KpiCard label={`${baslik} — Bekleyen`} value={kurusTLyazi(bekleyen)} icon={Landmark} iconTone="amber" />
      <KpiCard label={`${baslik} — Toplam`} value={kurusTLyazi(odenen + bekleyen)} icon={Landmark} />
    </section>
  );
}

/** Kamusal Giderler: vergi, SGK, belediye gibi resmi ödemeler (`tur='kamusal'`); dönem = vade (yoksa gider tarihi). */
export default async function KamusalGiderlerSayfasi({ searchParams }: { searchParams: Promise<{ gorunum?: string; donem?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";
  const { gorunum, donem: donemParam } = await searchParams;
  const donem = donemCoz({ gorunum: gorunum === "yil" ? "yil" : "ay", tarih: donemParam });
  const yil = donem.param.slice(0, 4);
  const yilDonemi = donemCoz({ gorunum: "yil", tarih: yil });
  const bugun = bugunIstanbulTarihi();

  const supabase = await createClient();
  // Yıl içinde vadesi VEYA tarihi olan kamu ödemeleri; dönem ayrımı (vade ?? tarih) aşağıda yapılır.
  const aralik = (alan: string) => `and(${alan}.gte.${yilDonemi.baslangicTarih},${alan}.lt.${yilDonemi.bitisTarih})`;
  const [{ data: yilVeri }, bekleyenler, { data: hesapVeri }] = await Promise.all([
    supabase.from("gider").select(GIDER_SECIM).eq("tur", "kamusal").or(`${aralik("tarih")},${aralik("vade_tarihi")}`).order("tarih", { ascending: false }).limit(1000),
    bekleyenGiderleriGetir(supabase, "kamusal"),
    supabase.rpc("banka_hesap_secenekleri"),
  ]);
  const hesaplar = (hesapVeri ?? []) as { id: string; ad: string }[];
  const yilKayitlari = ((yilVeri ?? []) as Gider[]).filter((g) => {
    const t = giderDonemTarihi(g);
    return t >= yilDonemi.baslangicTarih && t < yilDonemi.bitisTarih;
  });
  const donemKayitlari = yilKayitlari.filter((g) => {
    const t = giderDonemTarihi(g);
    return t >= donem.baslangicTarih && t < donem.bitisTarih;
  });
  const gecikenVar = bekleyenler.some((g) => vadesiGecti(g.vade_tarihi, bugun));

  return (
    <>
      <PageHeader title="Kamusal Giderler" description="Vergi, SGK ve diğer resmi kesinti/ödeme takibi." icon={Landmark} actions={<YeniGiderButonu tur="kamusal" hesaplar={hesaplar} bugun={bugun} />} />

      <GiderlerSekmeCubugu aktif={YOL} />

      <Ozet baslik={`${yil} Yılı`} kayitlar={yilKayitlari} />

      <DonemSecici yol={YOL} donem={donem} />
      {donem.gorunum === "ay" && <Ozet baslik={donem.etiket} kayitlar={donemKayitlari} />}

      <BekleyenGiderler bekleyenler={bekleyenler} hesaplar={hesaplar} yonetici={yonetici} bugun={bugun} baslik={gecikenVar ? "Ödenecek kamu ödemeleri (vadesi geçen var)" : "Ödenecek kamu ödemeleri"} />

      <GiderTablosu baslik="Dönem kayıtları" giderler={donemKayitlari} yonetici={yonetici} bugun={bugun} bosMetin="Bu dönem için kayıtlı kamusal ödeme yok." />
    </>
  );
}

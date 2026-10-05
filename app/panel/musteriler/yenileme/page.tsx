import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Phone, RefreshCw, UserCheck, UserX } from "lucide-react";
import { DonemCubugu } from "@/components/panel/donem-cubugu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, gunYazi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { type BitenUyelik, type SonrakiUyelik, type YenilemeDurumu, type YenilemeSatiri, yenilemeOrani, yenilemeSiniflandir } from "@/lib/panel/yenileme";
import { tumSayfalariOku } from "@/lib/supabase/sayfali-oku";
import { createClient } from "@/lib/supabase/server";
import { telefonGoster } from "@/lib/utils";

export const metadata: Metadata = { title: "Üyelik Yenileme Takibi" };

type MusteriBilgisi = { id: string; ad_soyad: string; telefon: string; uye_no: number };

const GRUP = 80; // `.in()` id listesi GET adresine gömülür; URL sınırı için gruplanır.
const gruplara = <T,>(dizi: T[]) => Array.from({ length: Math.ceil(dizi.length / GRUP) }, (_, i) => dizi.slice(i * GRUP, (i + 1) * GRUP));

const BOLUMLER: { durum: YenilemeDurumu; baslik: string; aciklama: string }[] = [
  { durum: "bekliyor", baslik: "Bitişi yaklaşan, henüz yenilemeyenler", aciklama: "Hatırlatma için arayın; bitiş günü geçince “yenilemedi” listesine düşer." },
  { durum: "yenilemedi", baslik: "Yenilemeyenler", aciklama: "Üyeliği bitti, yeni üyelik almadı: geri kazanma listesi." },
  { durum: "yeniledi", baslik: "Yenileyenler", aciklama: "Bu üyelikten sonra yeni (daha ileri biten) bir üyelik aldı." },
];

/**
 * Üyelik Yenileme Takibi: seçilen ayda biten üyelikler ve müşterinin yenileyip yenilemediği (hesap `lib/panel/yenileme.ts`).
 * Telefon gösterildiği için yalnız yönetici ve resepsiyon; bitişsiz seans paketleri bitiş günü olmadığından listeye girmez.
 */
export default async function YenilemeSayfasi({ searchParams }: { searchParams: Promise<{ tarih?: string }> }) {
  await sayfaYetkisiIste(MUSTERI_ROLLERI);
  const { tarih } = await searchParams;
  const donem = donemCoz({ gorunum: "ay", tarih });
  const bugun = bugunIstanbulTarihi();
  const supabase = await createClient();

  const bitenler = await tumSayfalariOku<BitenUyelik>((bas, son) =>
    supabase
      .from("uyelik")
      .select("id, musteri_id, paket_adi, bitis_tarihi, created_at")
      .neq("durum", "iptal")
      .gte("bitis_tarihi", donem.baslangicTarih)
      .lt("bitis_tarihi", donem.bitisTarih)
      .order("id")
      .range(bas, son)
  );

  const musteriIdleri = [...new Set(bitenler.map((b) => b.musteri_id))];
  const enEskiSatis = bitenler.reduce((m, b) => (b.created_at < m ? b.created_at : m), bitenler[0]?.created_at ?? "");
  const [digerSonuclari, musteriSonuclari] = await Promise.all([
    Promise.all(
      gruplara(musteriIdleri).map((g) =>
        supabase.from("uyelik").select("id, musteri_id, paket_adi, bitis_tarihi, created_at").in("musteri_id", g).neq("durum", "iptal").gt("created_at", enEskiSatis)
      )
    ),
    Promise.all(gruplara(musteriIdleri).map((g) => supabase.from("musteri").select("id, ad_soyad, telefon, uye_no").in("id", g))),
  ]);
  const hata = [...digerSonuclari, ...musteriSonuclari].find((r) => r.error);
  if (hata?.error) throw new Error(`Veri okunamadı: ${hata.error.message}`);

  const digerleri = digerSonuclari.flatMap((r) => (r.data ?? []) as SonrakiUyelik[]);
  const musteri = new Map(musteriSonuclari.flatMap((r) => (r.data ?? []) as MusteriBilgisi[]).map((m) => [m.id, m]));
  const satirlar = yenilemeSiniflandir(bitenler, digerleri, bugun);
  const sayi = (d: YenilemeDurumu) => satirlar.filter((s) => s.durum === d).length;
  const oran = yenilemeOrani(satirlar);

  const satir = (s: YenilemeSatiri) => {
    const m = musteri.get(s.musteri_id);
    return (
      <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <Link href={`/panel/musteriler/${s.musteri_id}`} className="font-semibold hover:underline">
            {m?.ad_soyad ?? "Müşteri"}
          </Link>
          {m && <span className="ml-2 text-xs text-muted-foreground tabular-nums">#{m.uye_no}</span>}
          <p className="text-sm text-muted-foreground">
            {s.paket_adi} · bitiş {gunYazi(s.bitis_tarihi)}
            {s.yeniPaket && ` → ${s.yeniPaket}`}
          </p>
        </div>
        {m?.telefon && s.durum !== "yeniledi" && (
          <a href={`tel:${m.telefon}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline tabular-nums">
            <Phone className="size-4" aria-hidden /> {telefonGoster(m.telefon)}
          </a>
        )}
      </div>
    );
  };

  return (
    <>
      <Link href="/panel/musteriler" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Müşteriler
      </Link>
      <PageHeader title="Üyelik Yenileme Takibi" description={`${donem.etiket} içinde biten üyelikler ve yenileme durumu.`} icon={RefreshCw} />
      <DonemCubugu yol="/panel/musteriler/yenileme" donem={donem} gorunumler={["ay"]} />

      <section aria-label="Yenileme özeti" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard vurgu label="Yenileme oranı" value={oran === null ? null : `%${oran}`} icon={RefreshCw} />
        <KpiCard label="Yenileyen" value={sayi("yeniledi")} icon={UserCheck} iconTone="emerald" />
        <KpiCard label="Yenilemeyen" value={sayi("yenilemedi")} icon={UserX} iconTone="rose" />
        <KpiCard label="Bitişi yaklaşan" value={sayi("bekliyor")} icon={CalendarClock} iconTone="amber" />
      </section>
      {oran !== null && sayi("bekliyor") > 0 && <p className="text-sm text-muted-foreground">Oran yalnız bitiş günü geçmiş üyelikler üzerinden hesaplanır; bitişi yaklaşanlar dahil değildir.</p>}

      {satirlar.length === 0 ? (
        <EmptyState icon={RefreshCw} title="Bu ay biten üyelik yok." description="Bitiş tarihi olmayan seans paketleri bu rapora girmez." />
      ) : (
        BOLUMLER.map(({ durum, baslik, aciklama }) => {
          const liste = satirlar.filter((s) => s.durum === durum);
          if (liste.length === 0) return null;
          return (
            <Card key={durum}>
              <CardHeader>
                <CardTitle>
                  {baslik} ({liste.length})
                </CardTitle>
                <CardDescription>{aciklama}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border p-0">{liste.map(satir)}</CardContent>
            </Card>
          );
        })
      )}
    </>
  );
}

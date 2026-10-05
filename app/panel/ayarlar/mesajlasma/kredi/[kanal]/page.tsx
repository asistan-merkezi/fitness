import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { KrediTakip } from "@/components/mesajlasma/KrediTakip";
import { KrediYukleme, type KrediPaketiGosterim } from "@/components/mesajlasma/KrediYukleme";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { formatDateTime } from "@/lib/datetime";
import { type Donem, donemCoz } from "@/lib/donem";
import { merkezdenBakiyeCek, merkezdenKrediPaketleriCek, merkezYapilandirildiMi } from "@/lib/mesaj/merkez-client";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { KANAL_ETIKET, KANAL_SIRASI, type MesajKanal, type MesajKredi, type MesajKrediHareketi } from "@/types/mesajlasma";

export const metadata: Metadata = { title: "Mesaj Kredisi" };

type Parametreler = { sekme?: string; gorunum?: string; tarih?: string; odeme?: string };

/** Ödemeden dönüşte bakiyeyi merkezden çeker ve versiyon guard'lı RPC ile aynaya yazar (yerelde hesaplanmaz). */
async function bakiyeyiSenkronla(isletmeId: string, kanal: MesajKanal) {
  if (!merkezYapilandirildiMi()) return;
  const sonuc = await merkezdenBakiyeCek(isletmeId, kanal);
  if (!sonuc.ulasildi) return;
  const { error } = await createAdminClient().rpc("mesaj_kredi_senkronla", { p_isletme_id: isletmeId, p_kanal: kanal, p_bakiye: sonuc.bakiye, p_versiyon: sonuc.bakiyeVersiyonu });
  if (error) console.error("[kredi] senkron hatası:", error.message);
}

export default async function KrediDetaySayfasi({ params, searchParams }: { params: Promise<{ kanal: string }>; searchParams: Promise<Parametreler> }) {
  const { kullanici } = await sayfaYetkisiIste(YONETICI_ROLLERI);
  const { kanal: ham } = await params;
  const kanal = KANAL_SIRASI.find((k) => k === ham) as MesajKanal | undefined;
  const isletmeId = kullanici.isletme_id;
  if (!kanal || !isletmeId) notFound();

  const sp = await searchParams;
  const sekme = sp.sekme === "yukle" ? "yukle" : "takip";
  const donusu = sp.odeme === "donuldu";
  if (donusu) await bakiyeyiSenkronla(isletmeId, kanal);

  const supabase = await createClient();
  const { data: krediVeri } = await supabase.from("mesaj_kredi").select("kanal, bakiye, updated_at, son_senkron_zamani, merkez_bakiye_versiyonu").eq("isletme_id", isletmeId).eq("kanal", kanal).maybeSingle<MesajKredi>();

  // Gelecek döneme gidilemez: bugünün (İstanbul) dönemine döner.
  let donem: Donem = donemCoz({ gorunum: sp.gorunum, tarih: sp.tarih });
  const bugunDonemi = donemCoz({ gorunum: donem.gorunum });
  if (donem.param > bugunDonemi.param) donem = bugunDonemi;

  const yol = `/panel/ayarlar/mesajlasma/kredi/${kanal}`;
  const sekmeler = [
    { kod: "takip", etiket: "Kredi Takip" },
    { kod: "yukle", etiket: "Kredi Yükleme" },
  ] as const;

  let icerik: React.ReactNode;
  if (sekme === "takip") {
    icerik = <KrediTakip kanal={kanal} isletmeId={isletmeId} donem={donem} />;
  } else {
    const [paketSonucu, { data: hareketVeri }] = await Promise.all([
      merkezYapilandirildiMi() ? merkezdenKrediPaketleriCek(isletmeId, kanal) : Promise.resolve({ ulasildi: false as const, hata: "merkez_yapilandirilmadi" }),
      supabase.from("mesaj_kredi_hareket").select("id, kanal, miktar, tutar_kurus, aciklama, created_at").eq("isletme_id", isletmeId).eq("kanal", kanal).order("created_at", { ascending: false }).limit(50),
    ]);
    const paketler: KrediPaketiGosterim[] = paketSonucu.ulasildi ? paketSonucu.paketler : [];
    icerik = (
      <KrediYukleme
        kanal={kanal}
        paketler={paketler}
        merkezHatasi={paketSonucu.ulasildi ? null : "Kredi fiyat çizelgesi alınamadı: Asistan Merkezi'ne ulaşılamadı. Lütfen daha sonra tekrar deneyin."}
        hareketler={(hareketVeri ?? []) as MesajKrediHareketi[]}
      />
    );
  }

  return (
    <>
      <Link href="/panel/ayarlar/mesajlasma" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> SMS/Whatsapp/Mail Ayarları
      </Link>
      <PageHeader title={`${KANAL_ETIKET[kanal]} Kredisi`} description="Bakiye Asistan Merkezi'nden senkronlanır; yerelde hesaplanmaz." icon={MessageCircle} />

      {donusu && (
        <p role="status" className="rounded-lg border border-success-border bg-success-soft px-4 py-3 text-sm font-medium text-success">
          Ödeme sayfasından döndünüz. Ödeme doğrulandığında kredi bakiyenize yansır; bakiye gecikmeli güncellenebilir.
        </p>
      )}

      <section aria-label="Bakiye" className="grid gap-4 sm:grid-cols-2">
        <KpiCard vurgu label="Kalan kredi" value={krediVeri?.bakiye ?? 0} />
        <KpiCard label="Son senkron" value={krediVeri?.son_senkron_zamani ? formatDateTime(krediVeri.son_senkron_zamani) : "Henüz yok"} />
      </section>

      <nav aria-label="Kredi sekmeleri" className="flex gap-1 rounded-lg bg-surface-2 p-1 w-fit">
        {sekmeler.map((s) => (
          <Link key={s.kod} href={`${yol}?sekme=${s.kod}`} aria-current={sekme === s.kod ? "page" : undefined} className={cn("rounded-md px-4 py-1.5 text-sm font-medium", sekme === s.kod ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-surface-3")}>
            {s.etiket}
          </Link>
        ))}
      </nav>

      {icerik}
    </>
  );
}

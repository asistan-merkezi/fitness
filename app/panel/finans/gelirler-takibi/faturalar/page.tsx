import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { DonemCubugu } from "@/components/panel/donem-cubugu";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { gunYazi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { FINANS_ROLLERI, FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { FaturaIptalFormu } from "../formlar";
import { musteriAdlariGetir } from "../sorgular";

export const metadata: Metadata = { title: "Kesilen Faturalar" };

type Fatura = { id: string; durum: "bekliyor" | "kesildi" | "hata" | "iptal"; fatura_no: string | null; hata_mesaji: string | null };
type Kalem = { fatura: Fatura | null };
type Borc = { id: string; musteri_id: string; aciklama: string | null; islem_tarihi: string; tutar_kurus: number; iskonto_kurus: number; fatura_kalem: Kalem[] | Kalem | null };

const DURUM: Record<Fatura["durum"], { etiket: string; ton: StatusTone }> = {
  bekliyor: { etiket: "Kuyrukta", ton: "amber" },
  kesildi: { etiket: "Kesildi", ton: "emerald" },
  hata: { etiket: "Hata", ton: "rose" },
  iptal: { etiket: "İptal", ton: "slate" },
};

/**
 * Kesilen Faturalar (klinik düzeni): TÜM seans/paket borçları listelenir; her satırda Faturalı/Faturasız durumu görünür, faturasız
 * satırda "Fatura Kes" ile ayrı sayfaya gidilir. Dönem: Tümü (son 200) / Günlük / Aylık / Yıllık.
 */
export default async function FaturalarSayfasi({ searchParams }: { searchParams: Promise<{ gorunum?: string; tarih?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_ROLLERI);
  const iptalYetkili = (FINANS_YONETIM_ROLLERI as readonly string[]).includes(kullanici.rol);
  const { gorunum, tarih } = await searchParams;
  const donemli = gorunum === "gun" || gorunum === "ay" || gorunum === "yil";
  const donem = donemli ? donemCoz({ gorunum, tarih }) : null;

  const supabase = await createClient();
  let sorgu = supabase
    .from("musteri_bakiye_hareket")
    .select("id, musteri_id, aciklama, islem_tarihi, tutar_kurus, iskonto_kurus, fatura_kalem(fatura(id, durum, fatura_no, hata_mesaji))")
    .eq("tur", "borc")
    .order("islem_tarihi", { ascending: false })
    .order("created_at", { ascending: false });
  sorgu = donem ? sorgu.gte("islem_tarihi", donem.baslangicTarih).lt("islem_tarihi", donem.bitisTarih) : sorgu.limit(200);
  const { data } = await sorgu;

  // Ücretsiz (net 0) satırlar faturalanamaz; listede gösterilmez.
  const borclar = ((data ?? []) as unknown as Borc[]).filter((b) => Number(b.tutar_kurus) - Number(b.iskonto_kurus) > 0);
  const ad = await musteriAdlariGetir(supabase, borclar.map((b) => b.musteri_id));

  const satirlar = borclar.map((b) => {
    const kalem = Array.isArray(b.fatura_kalem) ? b.fatura_kalem[0] : b.fatura_kalem;
    return { ...b, net: Number(b.tutar_kurus) - Number(b.iskonto_kurus), fatura: kalem?.fatura ?? null };
  });
  const faturasiz = satirlar.filter((s) => !s.fatura).length;
  const modBaglantisi = (g: "tumu" | "gun" | "ay" | "yil") => (g === "tumu" ? "/panel/finans/gelirler-takibi/faturalar" : `/panel/finans/gelirler-takibi/faturalar?gorunum=${g}`);

  return (
    <>
      <PageHeader title="Kesilen Faturalar" description="Tüm seans ve paket bedelleri burada listelenir. Fatura kesmek istediğiniz satırda “Fatura Kes”e tıklayın; dokunmadığınız satırlar faturasız kayıt olarak kalır." icon={Receipt} />

      <div className="flex flex-wrap items-center gap-3">
        <Link href={modBaglantisi("tumu")} aria-current={!donemli ? "true" : undefined} className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium", !donemli ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-surface-3")}>
          Tümü
        </Link>
        {donem ? <DonemCubugu yol="/panel/finans/gelirler-takibi/faturalar" donem={donem} /> : (
          <span className="flex gap-1 text-sm text-muted-foreground">
            Dönem seç:
            {(["gun", "ay", "yil"] as const).map((g) => (
              <Link key={g} href={modBaglantisi(g)} className="rounded-md px-2 py-0.5 font-semibold text-primary hover:underline">
                {g === "gun" ? "Günlük" : g === "ay" ? "Aylık" : "Yıllık"}
              </Link>
            ))}
          </span>
        )}
      </div>

      {satirlar.length === 0 ? (
        <EmptyState icon={Receipt} title="Bu dönemde satış kaydı yok." />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {satirlar.length} kayıt · <span className={faturasiz > 0 ? "font-semibold text-warning" : undefined}>{faturasiz} faturasız</span>
            {!donemli && " · son 200 kayıt gösteriliyor"}
          </p>
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tarih</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Açıklama</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {satirlar.map((s) => {
                const durum = s.fatura ? DURUM[s.fatura.durum] : null;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{gunYazi(s.islem_tarihi)}</TableCell>
                    <TableCell>
                      <Link href={`/panel/musteriler/${s.musteri_id}`} className="font-medium hover:underline">
                        {ad.get(s.musteri_id) ?? "Müşteri"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.aciklama ?? "Borç"}
                      {s.fatura?.fatura_no && <span className="block text-xs">Fatura no: {s.fatura.fatura_no}</span>}
                      {s.fatura?.hata_mesaji && <span className="block text-xs text-destructive">{s.fatura.hata_mesaji}</span>}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{kurusTLyazi(s.net)}</TableCell>
                    <TableCell>{durum ? <StatusBadge tone={durum.ton}>{durum.etiket}</StatusBadge> : <StatusBadge tone="slate">Faturasız</StatusBadge>}</TableCell>
                    <TableCell className="text-right">
                      {!s.fatura ? (
                        <Link href={`/panel/finans/gelirler-takibi/faturalar/${s.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                          Fatura Kes
                        </Link>
                      ) : (
                        iptalYetkili && (s.fatura.durum === "bekliyor" || s.fatura.durum === "hata") && <FaturaIptalFormu faturaId={s.fatura.id} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
    </>
  );
}

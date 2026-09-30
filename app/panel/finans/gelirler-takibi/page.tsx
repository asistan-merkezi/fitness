import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Receipt, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { FINANS_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { FaturaIptalFormu, FaturaOlusturFormu, type FaturasizSatir } from "./formlar";

export const metadata: Metadata = { title: "Gelirler Takibi ve Faturalandırma" };

type Alacak = { musteri_id: string; uye_no: string | number | null; ad_soyad: string; borc_kurus: number };
type FaturasizBorc = FaturasizSatir & { musteri_id: string };
type Fatura = { id: string; musteri_id: string; durum: "bekliyor" | "kesildi" | "hata" | "iptal"; toplam_kurus: number; fatura_no: string | null; hata_mesaji: string | null; iptal_nedeni: string | null; created_at: string };

const DURUM_ETIKET: Record<Fatura["durum"], { etiket: string; ton: StatusTone }> = {
  bekliyor: { etiket: "Kuyrukta", ton: "amber" },
  kesildi: { etiket: "Kesildi", ton: "emerald" },
  hata: { etiket: "Hata", ton: "rose" },
  iptal: { etiket: "İptal", ton: "slate" },
};

export default async function GelirlerTakibiSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(FINANS_ROLLERI);
  const iptalYetkili = kullanici.rol !== "resepsiyon";
  const supabase = await createClient();

  const [{ data: alacakVeri }, { data: borcVeri }, { data: faturaVeri }] = await Promise.all([
    supabase.from("cari_alacak").select("musteri_id, uye_no, ad_soyad, borc_kurus").order("borc_kurus", { ascending: false }).limit(200),
    supabase.from("faturalanmamis_borc").select("id, musteri_id, aciklama, islem_tarihi, net_kurus").order("islem_tarihi", { ascending: true }).limit(500),
    supabase.from("fatura").select("id, musteri_id, durum, toplam_kurus, fatura_no, hata_mesaji, iptal_nedeni, created_at").order("created_at", { ascending: false }).limit(50),
  ]);
  const alacaklar = ((alacakVeri ?? []) as Alacak[]).map((a) => ({ ...a, borc_kurus: Number(a.borc_kurus) }));
  const borclar = ((borcVeri ?? []) as FaturasizBorc[]).map((b) => ({ ...b, net_kurus: Number(b.net_kurus) }));
  const faturalar = ((faturaVeri ?? []) as Fatura[]).map((f) => ({ ...f, toplam_kurus: Number(f.toplam_kurus) }));

  // Fatura ve borç satırlarındaki müşteri adları (muhasebe yalnız musteri_ozet görür).
  const idler = [...new Set([...borclar.map((b) => b.musteri_id), ...faturalar.map((f) => f.musteri_id)])];
  const { data: adVeri } = idler.length ? await supabase.from("musteri_ozet").select("id, ad_soyad").in("id", idler) : { data: [] };
  const ad = new Map(((adVeri ?? []) as { id: string; ad_soyad: string }[]).map((m) => [m.id, m.ad_soyad]));

  const borcGruplari = new Map<string, FaturasizBorc[]>();
  for (const b of borclar) borcGruplari.set(b.musteri_id, [...(borcGruplari.get(b.musteri_id) ?? []), b]);
  const acikAlacak = alacaklar.reduce((t, a) => t + a.borc_kurus, 0);
  const faturasizToplam = borclar.reduce((t, b) => t + b.net_kurus, 0);
  const kuyruktaki = faturalar.filter((f) => f.durum === "bekliyor").length;

  return (
    <>
      <PageHeader title="Gelirler Takibi ve Faturalandırma" description="Açık cari alacaklar, faturalanmamış satışlar ve fatura kuyruğu" icon={Receipt} />

      <section aria-label="Gelir özeti" className="grid gap-4 sm:grid-cols-3">
        <KpiCard vurgu label="Açık cari alacak" value={kurusTLyazi(acikAlacak)} icon={Wallet} />
        <KpiCard label="Faturalanmamış satış" value={kurusTLyazi(faturasizToplam)} icon={FileText} iconTone="amber" />
        <KpiCard label="Kuyruktaki fatura" value={String(kuyruktaki)} icon={Receipt} />
      </section>

      <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
        Muhasebe (Paraşüt) bağlantısı henüz kurulmadı: oluşturulan faturalar <strong>Kuyrukta</strong> bekler ve bağlantı kurulunca otomatik kesilir.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Faturalanmamış satışlar</CardTitle>
          <CardDescription>Bir fatura tek müşterinin satırlarını içerir; istediğiniz satırları işaretleyip faturalandırın.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {borcGruplari.size === 0 ? (
            <EmptyState compact icon={FileText} title="Faturalanmamış satış yok" />
          ) : (
            [...borcGruplari.entries()].map(([musteriId, satirlar]) => (
              <div key={musteriId} className="rounded-lg border border-border p-4">
                <Link href={`/panel/musteriler/${musteriId}`} className="mb-3 block font-semibold text-primary hover:underline">
                  {ad.get(musteriId) ?? "Müşteri"}
                </Link>
                <FaturaOlusturFormu satirlar={satirlar} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Faturalar</CardTitle>
        </CardHeader>
        <CardContent>
          {faturalar.length === 0 ? (
            <EmptyState compact icon={Receipt} title="Henüz fatura yok" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {faturalar.map((f) => {
                  const d = DURUM_ETIKET[f.durum];
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{gunYazi(f.created_at.slice(0, 10))}</TableCell>
                      <TableCell>
                        <Link href={`/panel/musteriler/${f.musteri_id}`} className="font-medium hover:underline">
                          {ad.get(f.musteri_id) ?? "Müşteri"}
                        </Link>
                        {f.fatura_no && <span className="mt-0.5 block text-xs text-muted-foreground">No: {f.fatura_no}</span>}
                        {f.hata_mesaji && <span className="mt-0.5 block text-xs text-destructive">{f.hata_mesaji}</span>}
                        {f.iptal_nedeni && <span className="mt-0.5 block text-xs text-muted-foreground">İptal: {f.iptal_nedeni}</span>}
                        {iptalYetkili && (f.durum === "bekliyor" || f.durum === "hata") && (
                          <div className="mt-1">
                            <FaturaIptalFormu faturaId={f.id} />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={d.ton}>{d.etiket}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{kurusTLyazi(f.toplam_kurus)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Açık cari alacaklar</CardTitle>
          <CardDescription>Bakiyesi eksi olan müşteriler; tahsilat müşteri kartından girilir.</CardDescription>
        </CardHeader>
        <CardContent>
          {alacaklar.length === 0 ? (
            <EmptyState compact icon={Wallet} title="Açık alacak yok" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Müşteri</TableHead>
                  <TableHead className="text-right">Borç</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alacaklar.map((a) => (
                  <TableRow key={a.musteri_id}>
                    <TableCell>
                      <Link href={`/panel/musteriler/${a.musteri_id}`} className="font-medium hover:underline">
                        {a.ad_soyad}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-destructive">{kurusTLyazi(a.borc_kurus)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

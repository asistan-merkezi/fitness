import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { kurusTLyazi } from "@/lib/para";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GiderlerSekmeCubugu } from "../giderler-sekme-cubugu";

export const metadata: Metadata = { title: "Gelen Faturalar" };

/**
 * Gelen Faturalar: satın alma faturaları (Paraşüt). Paraşüt hesabı/bağlantısı henüz YOK (bkz. CLAUDE.md),
 * bu yüzden sayfa klinikteki gibi boş iskelet gösterir; bağlantı kurulunca liste burada dolacak.
 */
export default async function GelenFaturalarSayfasi() {
  await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);

  return (
    <>
      <PageHeader title="Gelen Faturalar" description="Satın alma faturaları (Paraşüt entegrasyonu)." icon={Receipt} />

      <GiderlerSekmeCubugu aktif="/panel/finans/giderler/gelen-faturalar" />

      <section aria-label="Gelen fatura özeti" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Toplam fatura" value="0 adet" icon={Receipt} />
        <KpiCard label="Net toplam" value={kurusTLyazi(0)} icon={Receipt} />
        <KpiCard label="KDV" value={kurusTLyazi(0)} icon={Receipt} />
        <KpiCard vurgu label="Toplam tutar" value={kurusTLyazi(0)} icon={Receipt} />
      </section>

      <Table className="min-w-[700px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Fatura no</TableHead>
            <TableHead>Tedarikçi</TableHead>
            <TableHead>Tarih</TableHead>
            <TableHead className="text-right">Net toplam</TableHead>
            <TableHead className="text-right">KDV</TableHead>
            <TableHead>Durum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={6} className="py-10">
              <EmptyState compact icon={Receipt} title="Paraşüt bağlantısı kurulmadı." description="Hesap bağlandığında gelen satın alma faturaları burada listelenecek. Şimdilik giderleri Genel Giderler sekmesinden girebilirsiniz." />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </>
  );
}

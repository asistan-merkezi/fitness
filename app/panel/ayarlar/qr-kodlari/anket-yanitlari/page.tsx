import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ClipboardEdit, Star } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { formatDateTime } from "@/lib/datetime";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { telefonGoster } from "@/lib/utils";

export const metadata: Metadata = { title: "Anket Yanıtları" };

type Yanit = { id: string; puan: number; oneri: string | null; ad_soyad: string | null; telefon: string | null; created_at: string };

export default async function AnketYanitlariSayfasi() {
  await sayfaYetkisiIste(MUSTERI_ROLLERI);
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase.from("anket_yaniti").select("id, puan, oneri, ad_soyad, telefon, created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("anket_yaniti").select("id", { count: "exact", head: true }),
  ]);
  const yanitlar = (data ?? []) as Yanit[];
  const ortalama = yanitlar.length ? yanitlar.reduce((t, y) => t + y.puan, 0) / yanitlar.length : null;

  return (
    <>
      <Link href="/panel/ayarlar/qr-kodlari" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> QR Kodları
      </Link>
      <PageHeader title="Anket Yanıtları" description="QR ile toplanan memnuniyet puanları ve öneriler (son 100 yanıt)." icon={ClipboardEdit} />

      <section aria-label="Özet" className="grid gap-4 sm:grid-cols-2">
        <KpiCard vurgu label="Ortalama puan (son 100)" value={ortalama !== null ? <>{ortalama.toFixed(1).replace(".", ",")} <span className="text-base font-medium">/ 5</span></> : "—"} icon={Star} />
        <KpiCard label="Toplam yanıt" value={count ?? 0} icon={ClipboardEdit} />
      </section>

      {yanitlar.length === 0 ? (
        <EmptyState icon={ClipboardEdit} title="Henüz anket yanıtı yok" description="Anket QR kodunu yazdırıp salona asın." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tarih</TableHead>
              <TableHead>Puan</TableHead>
              <TableHead>Öneri</TableHead>
              <TableHead>Kişi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {yanitlar.map((y) => (
              <TableRow key={y.id}>
                <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(y.created_at)}</TableCell>
                <TableCell className="font-semibold tabular-nums">{y.puan} / 5</TableCell>
                <TableCell className="max-w-md text-muted-foreground">{y.oneri ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{y.ad_soyad ? `${y.ad_soyad}${y.telefon ? ` · ${telefonGoster(y.telefon)}` : ""}` : "Anonim"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}

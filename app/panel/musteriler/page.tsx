import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { KATEGORI_ETIKETLERI } from "@/lib/panel/etiketler";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { telefonGoster } from "@/lib/utils";
import type { MusteriSatiri } from "@/types/veritabani";

const SAYFA_BOYUTU = 50;

export default async function MusterilerSayfasi({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await sayfaYetkisiIste(MUSTERI_ROLLERI);
  const { q } = await searchParams;
  const sorgu = (q ?? "").trim().slice(0, 100);

  const supabase = await createClient();
  const { data, error } = sorgu
    ? await supabase.rpc("musteri_ara", { p_sorgu: sorgu, p_limit: SAYFA_BOYUTU })
    : await supabase
        .from("musteri")
        .select("id, uye_no, ad_soyad, telefon, kategori, aktif, created_at")
        .order("created_at", { ascending: false })
        .limit(SAYFA_BOYUTU);

  const musteriler = (data ?? []) as MusteriSatiri[];

  return (
    <>
      <PageHeader
        title="Müşteriler"
        description={sorgu ? `"${sorgu}" için sonuçlar` : "Son eklenen müşteriler"}
        icon={Users}
        actions={
          <Link href="/panel/musteriler/yeni" className={buttonVariants()}>
            <Plus className="size-4" aria-hidden />
            Yeni Müşteri
          </Link>
        }
      />

      <form action="/panel/musteriler" method="get" className="flex max-w-md gap-2" role="search">
        <Input name="q" defaultValue={sorgu} placeholder="Ad, telefon veya üye no ara..." aria-label="Müşteri ara" autoComplete="off" />
        <Button type="submit" variant="outline">
          <Search className="size-4" aria-hidden />
          Ara
        </Button>
      </form>

      {error && <p role="alert" className="text-sm text-destructive">Müşteriler yüklenemedi. Lütfen sayfayı yenileyin.</p>}

      {!error && musteriler.length === 0 ? (
        <EmptyState
          icon={Users}
          title={sorgu ? "Eşleşen müşteri yok" : "Henüz müşteri yok"}
          description={sorgu ? "Farklı bir ad, telefon veya üye numarası deneyin." : "İlk müşteriyi ekleyerek başlayın."}
        />
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Üye no</TableHead>
                  <TableHead>Ad soyad</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {musteriler.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="tabular-nums">{m.uye_no}</TableCell>
                    <TableCell>
                      <Link href={`/panel/musteriler/${m.id}`} className="font-medium hover:underline">
                        {m.ad_soyad}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{telefonGoster(m.telefon)}</TableCell>
                    <TableCell>{KATEGORI_ETIKETLERI[m.kategori]}</TableCell>
                    <TableCell>{m.aktif ? <StatusBadge tone="emerald">Aktif</StatusBadge> : <StatusBadge tone="slate">Pasif</StatusBadge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

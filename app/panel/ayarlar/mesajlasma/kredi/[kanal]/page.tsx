import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { formatDateTime } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { KANAL_ETIKET, KANAL_SIRASI, type MesajKanal, type MesajKredi, type MesajKrediHareketi } from "@/types/mesajlasma";

export const metadata: Metadata = { title: "Mesaj Kredisi" };

export default async function KrediDetaySayfasi({ params }: { params: Promise<{ kanal: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(YONETICI_ROLLERI);
  const { kanal: ham } = await params;
  const kanal = KANAL_SIRASI.find((k) => k === ham) as MesajKanal | undefined;
  if (!kanal) notFound();

  const supabase = await createClient();
  const [{ data: krediVeri }, { data: hareketVeri }] = await Promise.all([
    supabase.from("mesaj_kredi").select("kanal, bakiye, updated_at, son_senkron_zamani, merkez_bakiye_versiyonu").eq("isletme_id", kullanici.isletme_id).eq("kanal", kanal).maybeSingle<MesajKredi>(),
    supabase.from("mesaj_kredi_hareket").select("id, kanal, miktar, tutar_kurus, aciklama, created_at").eq("isletme_id", kullanici.isletme_id).eq("kanal", kanal).order("created_at", { ascending: false }).limit(50),
  ]);
  const hareketler = (hareketVeri ?? []) as MesajKrediHareketi[];

  return (
    <>
      <Link href="/panel/ayarlar/mesajlasma" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> SMS/Whatsapp/Mail Ayarları
      </Link>
      <PageHeader title={`${KANAL_ETIKET[kanal]} Kredisi`} description="Bakiye Asistan Merkezi'nden senkronlanır; yerelde hesaplanmaz." icon={MessageCircle} />

      <section aria-label="Bakiye" className="grid gap-4 sm:grid-cols-2">
        <KpiCard vurgu label="Kalan kredi" value={krediVeri?.bakiye ?? 0} />
        <KpiCard label="Son senkron" value={krediVeri?.son_senkron_zamani ? formatDateTime(krediVeri.son_senkron_zamani) : "Henüz yok"} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Kredi nasıl yüklenir?</CardTitle>
          <CardDescription>Kredi yüklemesi platform yöneticisi (Asistan Merkezi) tarafından, ödeme doğrulandıktan sonra tanımlanır. Kredi almak için destek talebi oluşturun.</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yükleme geçmişi</CardTitle>
        </CardHeader>
        <CardContent>
          {hareketler.length === 0 ? (
            <EmptyState compact icon={MessageCircle} title="Henüz kredi yüklemesi yok." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="text-right">Miktar</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead>Açıklama</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hareketler.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(h.created_at)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">+{h.miktar}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.tutar_kurus !== null ? kurusTLyazi(Number(h.tutar_kurus)) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{h.aciklama ?? ""}</TableCell>
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

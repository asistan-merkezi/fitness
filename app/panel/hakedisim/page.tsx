import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Coins } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { formatDateTime } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { PERSONEL_HAREKET_TURLERI } from "@/lib/panel/etiketler";
import { IZIN_TALEBI_YOLU } from "@/lib/panel/izin-yollari";
import { hakedisArtirirMi } from "@/lib/panel/personel-odeme";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Hakedişim" };

type Hareket = { id: string; tur: keyof typeof PERSONEL_HAREKET_TURLERI; tutar_kurus: number; donem: string | null; aciklama: string | null; odeme_yontemi: string | null; created_at: string };

/** Personelin KENDİ hakediş ve ödeme geçmişi (RLS: yalnız kendi satırları). */
export default async function HakedisimSayfasi() {
  const { authUser } = await sayfaYetkisiIste(["resepsiyon", "antrenor", "muhasebe", "isletme_admin"]);
  const supabase = await createClient();

  const [{ data: bakiyeVeri }, { data: hareketVeri }] = await Promise.all([
    supabase.from("personel_bakiye").select("hak_edilen_kurus, odenen_kurus, bakiye_kurus").eq("kullanici_id", authUser.id).maybeSingle<{ hak_edilen_kurus: number; odenen_kurus: number; bakiye_kurus: number }>(),
    supabase.from("personel_hesap_hareket").select("id, tur, tutar_kurus, donem, aciklama, odeme_yontemi, created_at").eq("kullanici_id", authUser.id).order("created_at", { ascending: false }).limit(100),
  ]);
  const bakiye = bakiyeVeri ? { hak: Number(bakiyeVeri.hak_edilen_kurus), odenen: Number(bakiyeVeri.odenen_kurus), kalan: Number(bakiyeVeri.bakiye_kurus) } : { hak: 0, odenen: 0, kalan: 0 };
  const hareketler = (hareketVeri ?? []) as Hareket[];

  return (
    <>
      <PageHeader title="Hakedişim" description="Kapanan dönemlerin hakediş, prim ve ödemelerim" icon={Coins}
        actions={
          <Link href={IZIN_TALEBI_YOLU} className={buttonVariants({ variant: "outline" })}>
            <CalendarClock aria-hidden /> İzin Talebi
          </Link>
        }
      />

      <section aria-label="Bakiye" className="grid gap-4 sm:grid-cols-3">
        <KpiCard vurgu label="Alacağım" value={kurusTLyazi(bakiye.kalan)} />
        <KpiCard label="Toplam hakediş + prim" value={kurusTLyazi(bakiye.hak)} />
        <KpiCard label="Ödenen + avans" value={kurusTLyazi(bakiye.odenen)} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Hareketlerim</CardTitle>
          <CardDescription>Hakediş ve primler dönem (ay) bittikten sonra yönetici tarafından kapatılınca burada görünür.</CardDescription>
        </CardHeader>
        <CardContent>
          {hareketler.length === 0 ? (
            <EmptyState compact icon={Coins} title="Henüz hareket yok." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead>Açıklama</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hareketler.map((h) => {
                  const tur = PERSONEL_HAREKET_TURLERI[h.tur];
                  const gelir = hakedisArtirirMi(h.tur);
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(h.created_at)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={tur.ton}>{tur.etiket}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {h.donem ? `${h.donem.slice(0, 7)} · ` : ""}
                        {h.aciklama ?? (h.odeme_yontemi === "nakit" ? "Nakit" : h.odeme_yontemi === "havale" ? "Havale / EFT" : "")}
                      </TableCell>
                      <TableCell className={gelir ? "text-right font-semibold tabular-nums" : "text-right font-semibold text-destructive tabular-nums"}>
                        {gelir ? "+" : "−"}
                        {kurusTLyazi(Number(h.tutar_kurus))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

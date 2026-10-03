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
import { bugunIstanbulTarihi, formatDateTime, gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { PERSONEL_HAREKET_TURLERI, PUANTAJ_DURUMU } from "@/lib/panel/etiketler";
import { IZIN_TALEBI_YOLU } from "@/lib/panel/izin-yollari";
import { hakedisArtirirMi } from "@/lib/panel/personel-odeme";
import { createClient } from "@/lib/supabase/server";
import { KendiPuantajim } from "./kendi-puantajim";

export const metadata: Metadata = { title: "Hakedişim ve Puantajım" };

type PuantajSatiri = { tarih: string; durum: string; giris_saati: string | null; cikis_saati: string | null; fazla_mesai_dk: number };

type Hareket = { id: string; tur: keyof typeof PERSONEL_HAREKET_TURLERI; tutar_kurus: number; donem: string | null; aciklama: string | null; odeme_yontemi: string | null; created_at: string };

/** Personelin KENDİ hakediş, ödeme ve puantajı; giriş/çıkışını da kendi oturumuyla buradan yazar (RLS: yalnız kendi satırları). */
export default async function HakedisimSayfasi() {
  const { authUser } = await sayfaYetkisiIste(["resepsiyon", "antrenor", "muhasebe", "isletme_admin"]);
  const supabase = await createClient();
  const bugun = bugunIstanbulTarihi();
  const ayBasi = `${bugun.slice(0, 7)}-01`;

  const [{ data: bakiyeVeri }, { data: hareketVeri }, { data: puantajVeri }, { data: izinVeri }, { count: kapaliSayisi }] = await Promise.all([
    supabase.from("personel_bakiye").select("hak_edilen_kurus, odenen_kurus, bakiye_kurus").eq("kullanici_id", authUser.id).maybeSingle<{ hak_edilen_kurus: number; odenen_kurus: number; bakiye_kurus: number }>(),
    supabase.from("personel_hesap_hareket").select("id, tur, tutar_kurus, donem, aciklama, odeme_yontemi, created_at").eq("kullanici_id", authUser.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("personel_puantaj").select("tarih, durum, giris_saati, cikis_saati, fazla_mesai_dk").eq("kullanici_id", authUser.id).gte("tarih", ayBasi).lte("tarih", bugun).order("tarih", { ascending: false }),
    supabase.from("izin_talebi").select("id").eq("kullanici_id", authUser.id).eq("durum", "onaylandi").lte("baslangic_tarihi", bugun).gte("bitis_tarihi", bugun),
    // Bu ayın hakedişi kapatıldıysa puantaj değişmez (düğmeler pasif olur).
    supabase.from("personel_hesap_hareket").select("id", { count: "exact", head: true }).eq("kullanici_id", authUser.id).in("tur", ["hakedis", "prim"]).eq("donem", ayBasi),
  ]);
  const puantajlar = (puantajVeri ?? []) as PuantajSatiri[];
  const bugunKaydi = puantajlar.find((p) => p.tarih === bugun);
  const engel = (izinVeri ?? []).length > 0 ? "Bugün onaylı izinlisiniz" : (kapaliSayisi ?? 0) > 0 ? "Bu ayın hakedişi kapatılmış" : null;
  const bakiye = bakiyeVeri ? { hak: Number(bakiyeVeri.hak_edilen_kurus), odenen: Number(bakiyeVeri.odenen_kurus), kalan: Number(bakiyeVeri.bakiye_kurus) } : { hak: 0, odenen: 0, kalan: 0 };
  const hareketler = (hareketVeri ?? []) as Hareket[];

  return (
    <>
      <PageHeader title="Hakedişim ve Puantajım" description="Giriş/çıkışım, bu ayın puantajı, hakediş, prim ve ödemelerim" icon={Coins}
        actions={
          <Link href={IZIN_TALEBI_YOLU} className={buttonVariants({ variant: "outline" })}>
            <CalendarClock aria-hidden /> İzin Talebi
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Giriş / Çıkış</CardTitle>
          <CardDescription>Kendi sistem hesabınızla oturum açtığınız için ayrıca şifre gerekmez; saat otomatik yazılır. Hatalı kayıt için yöneticinize başvurun.</CardDescription>
        </CardHeader>
        <CardContent>
          <KendiPuantajim giris={bugunKaydi?.giris_saati?.slice(0, 5) ?? null} cikis={bugunKaydi?.cikis_saati?.slice(0, 5) ?? null} engel={engel} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bu ay puantajım</CardTitle>
          <CardDescription>Yönetici cetvelde düzeltme yapabilir; onaylı izin, resmi tatil ve Pazar günleri cetvelde otomatik gösterilir.</CardDescription>
        </CardHeader>
        <CardContent>
          {puantajlar.length === 0 ? (
            <EmptyState compact title="Bu ay için puantaj kaydınız yok." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Giriş – Çıkış</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {puantajlar.map((p) => (
                  <TableRow key={p.tarih}>
                    <TableCell className="whitespace-nowrap tabular-nums">{gunYazi(p.tarih)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={PUANTAJ_DURUMU[p.durum]?.ton ?? "slate"}>{PUANTAJ_DURUMU[p.durum]?.etiket ?? p.durum}</StatusBadge>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {p.giris_saati ? p.giris_saati.slice(0, 5) : "—"} – {p.cikis_saati ? p.cikis_saati.slice(0, 5) : "—"}
                      {p.fazla_mesai_dk > 0 ? ` · +${p.fazla_mesai_dk} dk` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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

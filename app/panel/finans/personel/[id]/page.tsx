import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { formatDateTime, gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { PERSONEL_HAREKET_TURLERI } from "@/lib/panel/etiketler";
import { FINANS_YONETIM_ROLLERI, ROL_ETIKETLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import type { KullaniciRolu } from "@/lib/auth/gecerli-kullanici";
import { HareketFormu, ProfilFormu } from "../formlar";

export const metadata: Metadata = { title: "Personel Kartı" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Profil = { maas_kurus: number; ders_prim_kurus: number; ise_giris_tarihi: string | null; isten_cikis_tarihi: string | null };
type Hareket = { id: string; tur: keyof typeof PERSONEL_HAREKET_TURLERI; tutar_kurus: number; donem: string | null; odeme_yontemi: string | null; aciklama: string | null; created_at: string };

export default async function PersonelKartiSayfasi({ params }: { params: Promise<{ id: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: personel } = await supabase.from("kullanici").select("id, ad_soyad, rol, aktif").eq("id", id).maybeSingle<{ id: string; ad_soyad: string; rol: KullaniciRolu; aktif: boolean }>();
  if (!personel || personel.rol === "super_admin") notFound();

  const [{ data: profilVeri }, { data: hareketVeri }, { data: bakiyeVeri }, { data: hesapVeri }] = await Promise.all([
    supabase.from("personel_profil").select("maas_kurus, ders_prim_kurus, ise_giris_tarihi, isten_cikis_tarihi").eq("kullanici_id", id).maybeSingle<Profil>(),
    supabase.from("personel_hesap_hareket").select("id, tur, tutar_kurus, donem, odeme_yontemi, aciklama, created_at").eq("kullanici_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("personel_bakiye").select("hak_edilen_kurus, odenen_kurus, bakiye_kurus").eq("kullanici_id", id).maybeSingle<{ hak_edilen_kurus: number; odenen_kurus: number; bakiye_kurus: number }>(),
    supabase.rpc("banka_hesap_secenekleri"),
  ]);
  const profil = profilVeri ?? null;
  const hareketler = (hareketVeri ?? []) as Hareket[];
  const bakiye = bakiyeVeri ? { hak: Number(bakiyeVeri.hak_edilen_kurus), odenen: Number(bakiyeVeri.odenen_kurus), kalan: Number(bakiyeVeri.bakiye_kurus) } : { hak: 0, odenen: 0, kalan: 0 };

  return (
    <>
      <Link href="/panel/finans/personel" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Personel ve Hakediş
      </Link>

      <PageHeader
        title={personel.ad_soyad}
        description={ROL_ETIKETLERI[personel.rol]}
        actions={
          <span className="flex items-center gap-2">
            {!personel.aktif && <StatusBadge tone="slate">Pasif</StatusBadge>}
            <Avatar name={personel.ad_soyad} />
          </span>
        }
      />

      <section aria-label="Bakiye" className="grid gap-4 sm:grid-cols-3">
        <KpiCard vurgu label="Bakiye (işletmenin borcu)" value={kurusTLyazi(bakiye.kalan)} />
        <KpiCard label="Toplam hakediş + prim" value={kurusTLyazi(bakiye.hak)} />
        <KpiCard label="Ödenen + avans" value={kurusTLyazi(bakiye.odenen)} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Maaş ve prim</CardTitle>
          <CardDescription>
            {profil
              ? `Çalışma: ${profil.ise_giris_tarihi ? gunYazi(profil.ise_giris_tarihi) : "—"} → ${profil.isten_cikis_tarihi ? gunYazi(profil.isten_cikis_tarihi) : "devam ediyor"}`
              : "Henüz maaş tanımlanmamış."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {yonetici ? (
            <ProfilFormu kullaniciId={personel.id} profil={profil} />
          ) : profil ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Aylık sabit maaş</dt>
                <dd className="font-semibold tabular-nums">{kurusTLyazi(Number(profil.maas_kurus))}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ders başı prim</dt>
                <dd className="font-semibold tabular-nums">{kurusTLyazi(Number(profil.ders_prim_kurus))}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Maaş bilgisi işletme yöneticisi tarafından girilir.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ödeme / avans</CardTitle>
          <CardDescription>Kayıtlar değiştirilemez; hatalı kayıt için ters yönde yeni kayıt girin.</CardDescription>
        </CardHeader>
        <CardContent>
          <HareketFormu kullaniciId={personel.id} hesaplar={(hesapVeri ?? []) as { id: string; ad: string }[]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hesap hareketleri</CardTitle>
        </CardHeader>
        <CardContent>
          {hareketler.length === 0 ? (
            <EmptyState compact title="Henüz hareket yok. Dönem kapatılınca hakediş satırları burada görünür." />
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
                  const gelir = h.tur === "hakedis" || h.tur === "prim";
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

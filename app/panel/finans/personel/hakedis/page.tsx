import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, UserCog } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { FINANS_YONETIM_ROLLERI, ROL_ETIKETLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import type { KullaniciRolu } from "@/lib/auth/gecerli-kullanici";
import { DonemKapatFormu } from "../formlar";
import { PersonelSekmeleri } from "../personel-sekmeleri";

export const metadata: Metadata = { title: "Personel ve Hakediş" };

type Hesap = {
  kullanici_id: string;
  ad_soyad: string;
  rol: KullaniciRolu;
  calisilan_gun: number;
  toplam_gun: number;
  taban_kurus: number;
  ders_sayisi: number;
  prim_kurus: number;
  toplam_kurus: number;
  kapali: boolean;
};

export default async function PersonelHakedisSayfasi({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";
  const { ay } = await searchParams;
  const donem = donemCoz({ gorunum: "ay", tarih: ay });
  const buAy = bugunIstanbulTarihi().slice(0, 7);
  const bitti = donem.param < buAy;

  const supabase = await createClient();
  const { data: hesapVeri } = await supabase.rpc("personel_hakedis_hesapla", { p_ay: `${donem.param}-01` });
  const hesaplar = ((hesapVeri ?? []) as Hesap[]).map((h) => ({ ...h, taban_kurus: Number(h.taban_kurus), prim_kurus: Number(h.prim_kurus), toplam_kurus: Number(h.toplam_kurus) }));

  const toplam = hesaplar.reduce((t, h) => t + h.toplam_kurus, 0);
  const acikVar = hesaplar.some((h) => !h.kapali);
  const baglanti = (p: string) => `/panel/finans/personel/hakedis?ay=${p}`;

  return (
    <>
      <PageHeader title="Personel" description={`Hakediş · ${donem.etiket} dönemi`} icon={UserCog} />
      <PersonelSekmeleri aktif="hakedis" />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={baglanti(donem.oncekiParam)} aria-label="Önceki ay" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeft aria-hidden />
        </Link>
        <Link href={baglanti(buAy)} aria-current={donem.param === buAy ? "date" : undefined} className={buttonVariants({ variant: donem.param === buAy ? "default" : "outline" })}>
          Bu Ay
        </Link>
        <Link href={baglanti(donem.sonrakiParam)} aria-label="Sonraki ay" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronRight aria-hidden />
        </Link>
      </div>

      <section aria-label="Dönem özeti" className="grid gap-4 sm:grid-cols-2">
        <KpiCard vurgu label={bitti ? "Dönem toplam hakediş" : "Tahmini hakediş (dönem sürüyor)"} value={kurusTLyazi(toplam)} icon={UserCog} />
        <KpiCard label="Personel" value={<>{hesaplar.length} <span className="text-base font-medium text-muted-foreground">kişi</span></>} icon={UserCog} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Hakediş tablosu</CardTitle>
          <CardDescription>Sabit maaş (gün oranlı) + tamamlanan ders primi. Dönem bittikten sonra kapatılınca tutarlar deftere yazılır ve değişmez.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hesaplar.length === 0 ? (
            <EmptyState compact icon={UserCog} title="Bu dönem için hakediş yok. Personele maaş tanımlayın." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Personel</TableHead>
                  <TableHead className="text-right">Gün</TableHead>
                  <TableHead className="text-right">Maaş</TableHead>
                  <TableHead className="text-right">Ders</TableHead>
                  <TableHead className="text-right">Prim</TableHead>
                  <TableHead className="text-right">Toplam</TableHead>
                  <TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hesaplar.map((h) => (
                  <TableRow key={h.kullanici_id}>
                    <TableCell>
                      <Link href={`/panel/finans/personel/${h.kullanici_id}?sekme=odeme`} className="flex items-center gap-2 font-medium hover:underline">
                        <Avatar name={h.ad_soyad} size="sm" />
                        <span>
                          {h.ad_soyad}
                          <span className="block text-xs font-normal text-muted-foreground">{ROL_ETIKETLERI[h.rol]}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {h.calisilan_gun}/{h.toplam_gun}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{kurusTLyazi(h.taban_kurus)}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.ders_sayisi}</TableCell>
                    <TableCell className="text-right tabular-nums">{kurusTLyazi(h.prim_kurus)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{kurusTLyazi(h.toplam_kurus)}</TableCell>
                    <TableCell>{h.kapali ? <StatusBadge tone="emerald">Kapalı</StatusBadge> : <StatusBadge tone="amber">{bitti ? "Kapatılmadı" : "Tahmini"}</StatusBadge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {yonetici && bitti && acikVar && <DonemKapatFormu ay={donem.param} />}
          {yonetici && !bitti && <p className="text-xs text-muted-foreground">Dönem bittikten sonra kapatılabilir.</p>}
        </CardContent>
      </Card>
    </>
  );
}

import Link from "next/link";
import { Banknote, ChevronLeft, ChevronRight, CreditCard, Landmark, Plus, Wallet, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, formatDateTime } from "@/lib/datetime";
import { type Donem, donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { HAREKET_TURLERI, YONTEM_ETIKETLERI } from "@/lib/panel/etiketler";
import { FINANS_ROLLERI, MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { HareketSatiri, OdemeYontemi } from "@/types/veritabani";

type KasaSatiri = { odeme_yontemi: OdemeYontemi; tahsilat_kurus: number; iade_kurus: number; net_kurus: number; adet: number };

/** Görünüm değişince aynı dönemde kal: gün→ay→yıl geçişlerinde param kısaltılır/uzatılır. */
function gorunumBaglantisi(d: Donem, yeni: Donem["gorunum"]): string {
  const p = d.param;
  const tarih = yeni === "gun" ? (d.gorunum === "gun" ? p : d.gorunum === "ay" ? `${p}-01` : `${p}-01-01`) : yeni === "ay" ? (d.gorunum === "yil" ? `${p}-01` : p.slice(0, 7)) : p.slice(0, 4);
  return `/panel/kasa/tahsilatlar?gorunum=${yeni}&tarih=${tarih}`;
}

export default async function KasaSayfasi({ searchParams }: { searchParams: Promise<{ gorunum?: string; tarih?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_ROLLERI);
  // Muhasebe müşteri sayfasına giremez: ad düz metin olarak gösterilir.
  const musteriLinki = (MUSTERI_ROLLERI as readonly string[]).includes(kullanici.rol);
  const parametreler = await searchParams;
  const donem = donemCoz(parametreler);
  const bugun = bugunIstanbulTarihi();

  const supabase = await createClient();
  const [kasaSonuc, hareketSonuc, alacakSonuc] = await Promise.all([
    supabase.rpc("kasa_ozet", { p_baslangic: donem.baslangicTarih, p_bitis: donem.bitisTarih }),
    supabase
      .from("musteri_bakiye_hareket")
      .select("id, musteri_id, tur, tutar_kurus, iskonto_kurus, odeme_yontemi, aciklama, islem_zamani, islem_tarihi, iade_edilen_hareket_id")
      .in("tur", ["odeme", "iade"])
      .gte("islem_tarihi", donem.baslangicTarih)
      .lt("islem_tarihi", donem.bitisTarih)
      .order("islem_zamani", { ascending: false })
      .limit(200),
    supabase.from("cari_alacak").select("musteri_id, uye_no, ad_soyad, borc_kurus").order("borc_kurus", { ascending: false }).limit(50),
  ]);

  const kasa = (kasaSonuc.data ?? []) as KasaSatiri[];
  const hareketler = (hareketSonuc.data ?? []) as (HareketSatiri & { musteri_id: string })[];
  const alacaklar = (alacakSonuc.data ?? []) as { musteri_id: string; uye_no: number; ad_soyad: string; borc_kurus: number }[];

  const adHaritasi = new Map<string, string>();
  const idler = [...new Set(hareketler.map((h) => h.musteri_id))];
  if (idler.length) {
    const { data } = await supabase.from("musteri_ozet").select("id, ad_soyad").in("id", idler);
    for (const m of (data ?? []) as { id: string; ad_soyad: string }[]) adHaritasi.set(m.id, m.ad_soyad);
  }

  const toplam = (alan: keyof KasaSatiri) => kasa.reduce((t, k) => t + Number(k[alan]), 0);
  const toplamAlacak = alacaklar.reduce((t, a) => t + Number(a.borc_kurus), 0);
  const sekmeler: { g: Donem["gorunum"]; e: string }[] = [
    { g: "gun", e: "Günlük" },
    { g: "ay", e: "Aylık" },
    { g: "yil", e: "Yıllık" },
  ];

  return (
    <>
      <PageHeader
        title="Tahsilat Özeti"
        description="Tahsilat/iade özeti (İstanbul takvimine göre) ve açık alacaklar."
        icon={Landmark}
        actions={
          musteriLinki ? (
            <Link href="/panel/kasa/hizli-tahsilat" className={buttonVariants()}>
              <Plus aria-hidden /> Hızlı Tahsilat
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Görünüm" className="inline-flex rounded-lg border border-border p-0.5">
          {sekmeler.map((s) => (
            <Link
              key={s.g}
              href={gorunumBaglantisi(donem, s.g)}
              role="tab"
              aria-selected={donem.gorunum === s.g}
              className={cn("rounded-md px-3 py-1 text-sm", donem.gorunum === s.g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {s.e}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/panel/kasa/tahsilatlar?gorunum=${donem.gorunum}&tarih=${donem.oncekiParam}`} aria-label="Önceki dönem" className="rounded-md border border-border p-1.5 hover:bg-muted">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <span className="min-w-44 text-center text-sm font-medium capitalize">{donem.etiket}</span>
          <Link href={`/panel/kasa/tahsilatlar?gorunum=${donem.gorunum}&tarih=${donem.sonrakiParam}`} aria-label="Sonraki dönem" className="rounded-md border border-border p-1.5 hover:bg-muted">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          <Link href={`/panel/kasa/tahsilatlar?gorunum=${donem.gorunum}&tarih=${donem.gorunum === "gun" ? bugun : donem.gorunum === "ay" ? bugun.slice(0, 7) : bugun.slice(0, 4)}`} className="text-sm text-primary hover:underline">
            Bugün
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard vurgu label="Net tahsilat" value={kurusTLyazi(toplam("net_kurus"))} icon={Wallet} />
        <KpiCard label="Tahsilat" value={kurusTLyazi(toplam("tahsilat_kurus"))} icon={Banknote} />
        <KpiCard label="İade" value={kurusTLyazi(toplam("iade_kurus"))} />
      </div>

      <section aria-label="Yönteme göre" className="flex flex-col gap-3">
        <h2 className="text-etiket text-muted-foreground">Yönteme göre</h2>
        {kasa.length === 0 ? (
          <EmptyState compact title="Bu dönemde tahsilat/iade yok." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {kasa.map((k) => {
              const Ikon: LucideIcon = k.odeme_yontemi === "nakit" ? Banknote : k.odeme_yontemi === "kredi_karti" ? CreditCard : Landmark;
              return (
                <Card key={k.odeme_yontemi} className="gap-3">
                  <div className="flex items-center gap-2 px-(--card-spacing) text-etiket text-muted-foreground">
                    <Ikon className="size-4 text-primary" strokeWidth={1.5} aria-hidden />
                    {YONTEM_ETIKETLERI[k.odeme_yontemi]} · {k.adet} işlem
                  </div>
                  <p className="px-(--card-spacing) text-metric">{kurusTLyazi(k.net_kurus)}</p>
                  <p className="px-(--card-spacing) text-xs text-muted-foreground tabular-nums">
                    Tahsilat {kurusTLyazi(k.tahsilat_kurus)} · İade {kurusTLyazi(k.iade_kurus)}
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Hareketler</CardTitle>
          <CardDescription>{hareketler.length === 200 ? "Son 200 hareket gösteriliyor." : `${hareketler.length} hareket`}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {hareketler.length === 0 ? (
            <div className="px-6">
              <EmptyState compact title="Hareket yok." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zaman</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hareketler.map((h) => {
                  const t = HAREKET_TURLERI[h.tur];
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="tabular-nums">{formatDateTime(h.islem_zamani)}</TableCell>
                      <TableCell>
                        {musteriLinki ? (
                          <Link href={`/panel/musteriler/${h.musteri_id}`} className="hover:underline">
                            {adHaritasi.get(h.musteri_id) ?? "Müşteri"}
                          </Link>
                        ) : (
                          (adHaritasi.get(h.musteri_id) ?? "Müşteri")
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={t.ton}>{t.etiket}</StatusBadge>
                        {h.odeme_yontemi && <span className="ml-2 text-xs text-muted-foreground">{YONTEM_ETIKETLERI[h.odeme_yontemi]}</span>}
                      </TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${h.tur === "odeme" ? "text-success" : "text-destructive"}`}>
                        {h.tur === "odeme" ? "+" : "−"}
                        {kurusTLyazi(h.tutar_kurus)}
                      </TableCell>
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
          <CardTitle>Açık alacaklar</CardTitle>
          <CardDescription>Bakiyesi negatif (borçlu) müşteriler · toplam {kurusTLyazi(toplamAlacak)}{alacaklar.length === 50 ? " (ilk 50 müşteri)" : ""}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {alacaklar.length === 0 ? (
            <div className="px-6">
              <EmptyState compact title="Açık alacak yok." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Üye no</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead className="text-right">Borç</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alacaklar.map((a) => (
                  <TableRow key={a.musteri_id}>
                    <TableCell className="tabular-nums">{a.uye_no}</TableCell>
                    <TableCell>
                      {musteriLinki ? (
                        <Link href={`/panel/musteriler/${a.musteri_id}`} className="hover:underline">
                          {a.ad_soyad}
                        </Link>
                      ) : (
                        a.ad_soyad
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-destructive">{kurusTLyazi(a.borc_kurus)}</TableCell>
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

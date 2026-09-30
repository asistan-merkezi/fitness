import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard, History, ShieldAlert, UserRound, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, formatDate, formatDateTime, gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { HAREKET_TURLERI, KATEGORI_ETIKETLERI, RED_NEDENLERI, UYELIK_DURUMU, YONTEM_ETIKETLERI } from "@/lib/panel/etiketler";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { telefonGoster } from "@/lib/utils";
import type { GirisKaydiSatiri, HareketSatiri, MusteriHassasSatiri, MusteriSatiri, MusteriVeliSatiri, PaketSatiri, UyelikGorunumSatiri } from "@/types/veritabani";
import { HassasBilgiFormu, IadeFormu, MusteriBilgiFormu, OdemeFormu, SatisFormu, UyelikIslemleri } from "./islem-formlari";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MusteriDetaySayfasi({ params }: { params: Promise<{ id: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(MUSTERI_ROLLERI);
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: musteri } = await supabase.from("musteri").select("*").eq("id", id).maybeSingle<MusteriSatiri>();
  if (!musteri) notFound();

  const [hassasSonuc, veliSonuc, uyelikSonuc, hareketSonuc, girisSonuc, paketSonuc, onamSonuc] = await Promise.all([
    supabase.from("musteri_hassas").select("*").eq("musteri_id", id).maybeSingle<MusteriHassasSatiri>(),
    supabase.from("musteri_veli").select("ad_soyad, telefon, yakinlik").eq("musteri_id", id).maybeSingle<MusteriVeliSatiri>(),
    supabase.from("uyelik_gorunum").select("*").eq("musteri_id", id).order("baslangic_tarihi", { ascending: false }),
    supabase.from("musteri_bakiye_hareket").select("*").eq("musteri_id", id).order("islem_zamani", { ascending: false }).limit(50),
    supabase.from("giris_kaydi").select("id, sonuc, red_nedeni, zaman, kaynak, iptal, hak_dusuldu, musteri_id, uyelik_id").eq("musteri_id", id).order("zaman", { ascending: false }).limit(10),
    supabase.from("uyelik_paketi").select("*").eq("aktif", true).order("ad"),
    supabase.from("musteri_onam").select("tur, verildi, metin_versiyonu, created_at").eq("musteri_id", id).order("created_at", { ascending: false }),
  ]);

  const hassas = hassasSonuc.data;
  const veli = veliSonuc.data;
  const uyelikler = (uyelikSonuc.data ?? []) as UyelikGorunumSatiri[];
  const hareketler = (hareketSonuc.data ?? []) as HareketSatiri[];
  const girisler = (girisSonuc.data ?? []) as GirisKaydiSatiri[];
  const bugun = bugunIstanbulTarihi();
  const paketler = ((paketSonuc.data ?? []) as PaketSatiri[]).filter((p) => !p.satis_bitis_tarihi || p.satis_bitis_tarihi >= bugun);
  const onamlar = (onamSonuc.data ?? []) as { tur: string; verildi: boolean; metin_versiyonu: string; created_at: string }[];
  const yonetici = kullanici.rol === "isletme_admin";

  const bakiyeKurus = hareketler.length
    ? Number(
        (
          await supabase.from("musteri_bakiye").select("bakiye_kurus").eq("musteri_id", id).maybeSingle<{ bakiye_kurus: number }>()
        ).data?.bakiye_kurus ?? 0
      )
    : 0;

  // Her ödeme için kalan iade edilebilir tutar (iadeler kendi tutarlarıyla düşülür).
  const odemeler = hareketler.filter((h) => h.tur === "odeme");
  const iadeToplami = new Map<string, number>();
  for (const h of hareketler) {
    if (h.tur === "iade" && h.iade_edilen_hareket_id) iadeToplami.set(h.iade_edilen_hareket_id, (iadeToplami.get(h.iade_edilen_hareket_id) ?? 0) + Number(h.tutar_kurus));
  }
  const iadeEdilebilirOdemeler = odemeler
    .map((o) => ({ o, kalan: Number(o.tutar_kurus) - (iadeToplami.get(o.id) ?? 0) }))
    .filter((x) => x.kalan > 0)
    .map(({ o, kalan }) => ({
      id: o.id,
      etiket: `${formatDate(o.islem_zamani)} · ${o.odeme_yontemi ? YONTEM_ETIKETLERI[o.odeme_yontemi] : ""} · ${kurusTLyazi(o.tutar_kurus)} (iade edilebilir: ${kurusTLyazi(kalan)})`,
    }));

  const sonOnam = new Map<string, (typeof onamlar)[number]>();
  for (const o of onamlar) if (!sonOnam.has(o.tur)) sonOnam.set(o.tur, o);

  return (
    <>
      <Link href="/panel/musteriler" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Müşteriler
      </Link>

      <PageHeader
        title={musteri.ad_soyad}
        description={`Üye no ${musteri.uye_no} · ${telefonGoster(musteri.telefon)}${musteri.eposta ? ` · ${musteri.eposta}` : ""}`}
        icon={UserRound}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="primary">{KATEGORI_ETIKETLERI[musteri.kategori]}</StatusBadge>
            {!musteri.aktif && <StatusBadge tone="slate">Pasif</StatusBadge>}
            {musteri.risk_bayraklari.length > 0 && <StatusBadge tone="amber">Sağlık/sakatlık riski</StatusBadge>}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-4" aria-hidden /> Cari bakiye
            </CardTitle>
            <CardDescription>Negatif bakiye müşterinin borcudur.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <p className={`text-3xl font-semibold tabular-nums ${bakiyeKurus < 0 ? "text-destructive" : ""}`}>{kurusTLyazi(bakiyeKurus)}</p>
            <div>
              <h3 className="mb-3 text-sm font-medium">Ödeme al</h3>
              <OdemeFormu musteriId={id} />
            </div>
            {yonetici && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground select-none">İade yap (yönetici)</summary>
                <div className="mt-3">
                  <IadeFormu musteriId={id} odemeler={iadeEdilebilirOdemeler} />
                </div>
              </details>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-4" aria-hidden /> Üyelik sat
            </CardTitle>
            <CardDescription>Satış; üyelik, borç ve (varsa) ilk tahsilatı tek işlemde kaydeder.</CardDescription>
          </CardHeader>
          <CardContent>
            {!musteri.aktif ? (
              <p className="text-sm text-muted-foreground">Pasif müşteriye üyelik satılamaz.</p>
            ) : paketler.length === 0 ? (
              <EmptyState compact title="Satışa açık paket yok. Önce “Üyelik Paketleri”nden paket oluşturun." />
            ) : (
              <SatisFormu musteriId={id} paketler={paketler} bugun={bugun} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Üyelikler</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {uyelikler.length === 0 ? (
            <div className="px-6">
              <EmptyState compact title="Henüz üyelik yok." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paket</TableHead>
                  <TableHead>Dönem</TableHead>
                  <TableHead>Kalan hak</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uyelikler.map((u) => {
                  const d = UYELIK_DURUMU[u.gecerli_durum];
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.paket_adi}</TableCell>
                      <TableCell className="tabular-nums">
                        {gunYazi(u.baslangic_tarihi)} → {u.bitis_tarihi ? gunYazi(u.bitis_tarihi) : "süresiz"}
                      </TableCell>
                      <TableCell className="tabular-nums">{u.kalan_hak === null ? "—" : `${u.kalan_hak} / ${u.toplam_hak}`}</TableCell>
                      <TableCell>
                        <StatusBadge tone={d.ton}>{d.etiket}</StatusBadge>
                      </TableCell>
                      <TableCell>
                        <UyelikIslemleri uyelik={u} musteriId={id} yonetici={yonetici} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bilgiler</CardTitle>
          </CardHeader>
          <CardContent>
            <MusteriBilgiFormu musteri={musteri} />
            {veli && (
              <p className="mt-4 text-sm text-muted-foreground">
                Veli/vasi: {veli.ad_soyad} ({veli.yakinlik}) · {telefonGoster(veli.telefon)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4" aria-hidden /> Hassas bilgiler ve onaylar
            </CardTitle>
            <CardDescription>Kimlik, adres, acil durum, sağlık (özel nitelikli veri).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <HassasBilgiFormu musteriId={id} hassas={hassas ?? null} />
            <div>
              <h3 className="mb-2 text-sm font-medium">Onam kayıtları (son durum)</h3>
              {sonOnam.size === 0 ? (
                <p className="text-sm text-muted-foreground">Kayıt yok.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {[...sonOnam.values()].map((o) => (
                    <li key={o.tur} className="flex items-center justify-between gap-2">
                      <span>{o.tur.replaceAll("_", " ")}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {formatDate(o.created_at)} · {o.metin_versiyonu}
                        <StatusBadge tone={o.verildi ? "emerald" : "slate"}>{o.verildi ? "Verildi" : "Verilmedi"}</StatusBadge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cari hareketler</CardTitle>
          <CardDescription>Kayıtlar değiştirilemez; düzeltme yeni kayıtla yapılır. Son 50 hareket.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {hareketler.length === 0 ? (
            <div className="px-6">
              <EmptyState compact title="Henüz hareket yok." />
            </div>
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
                  const t = HAREKET_TURLERI[h.tur];
                  const net = h.tur === "borc" ? Number(h.tutar_kurus) - Number(h.iskonto_kurus) : Number(h.tutar_kurus);
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="tabular-nums">{formatDateTime(h.islem_zamani)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={t.ton}>{t.etiket}</StatusBadge>
                        {h.odeme_yontemi && <span className="ml-2 text-xs text-muted-foreground">{YONTEM_ETIKETLERI[h.odeme_yontemi]}</span>}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {h.aciklama ?? ""}
                        {Number(h.iskonto_kurus) > 0 && ` (iskonto ${kurusTLyazi(h.iskonto_kurus)})`}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${h.tur === "odeme" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                        {h.tur === "odeme" ? "+" : "−"}
                        {kurusTLyazi(net)}
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
          <CardTitle className="flex items-center gap-2">
            <History className="size-4" aria-hidden /> Son girişler
          </CardTitle>
        </CardHeader>
        <CardContent>
          {girisler.length === 0 ? (
            <EmptyState compact title="Henüz giriş kaydı yok." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {girisler.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2">
                  <span className="tabular-nums">{formatDateTime(g.zaman)}</span>
                  <span className="flex items-center gap-2">
                    {g.sonuc === "kabul" ? (
                      <StatusBadge tone={g.iptal ? "slate" : "emerald"}>{g.iptal ? "Kabul (iptal edildi)" : "Kabul"}</StatusBadge>
                    ) : (
                      <StatusBadge tone="rose">Red: {RED_NEDENLERI[g.red_nedeni ?? ""] ?? "—"}</StatusBadge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

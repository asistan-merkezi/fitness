import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, CreditCard, Dumbbell, HeartPulse, Phone, ShieldCheck, Ticket } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { ProgressBar, SeansBloklari } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, formatDate, formatDateTime, gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { HAREKET_TURLERI, KATEGORI_ETIKETLERI, RED_NEDENLERI, UYELIK_DURUMU, YONTEM_ETIKETLERI } from "@/lib/panel/etiketler";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { bitiyorUyarisi, gecenSureYuzdesi, kalanGun } from "@/lib/panel/uyelik-ozeti";
import { createClient } from "@/lib/supabase/server";
import { cn, telefonGoster } from "@/lib/utils";
import type { GirisKaydiSatiri, HareketSatiri, MusteriHassasSatiri, MusteriSatiri, MusteriVeliSatiri, PaketSatiri, UyelikGorunumSatiri } from "@/types/veritabani";
import { HassasBilgiFormu, IadeFormu, MusteriBilgiFormu, OdemeFormu, SatisFormu, UyelikIslemleri } from "./islem-formlari";

export const metadata: Metadata = { title: "Müşteri" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEKMELER = [
  { kod: "uyelikler", etiket: "Üyelikler" },
  { kod: "cari", etiket: "Cari Hareketler" },
  { kod: "giris", etiket: "Giriş Geçmişi" },
  { kod: "bilgiler", etiket: "Bilgiler" },
] as const;
type Sekme = (typeof SEKMELER)[number]["kod"];

export default async function MusteriDetaySayfasi({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sekme?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(MUSTERI_ROLLERI);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { sekme: sekmeParam } = await searchParams;
  const sekme: Sekme = SEKMELER.some((s) => s.kod === sekmeParam) ? (sekmeParam as Sekme) : "uyelikler";

  const supabase = await createClient();
  const { data: musteri } = await supabase.from("musteri").select("*").eq("id", id).maybeSingle<MusteriSatiri>();
  if (!musteri) notFound();

  const [hassasSonuc, veliSonuc, uyelikSonuc, hareketSonuc, girisSonuc, paketSonuc, onamSonuc, bakiyeSonuc] = await Promise.all([
    supabase.from("musteri_hassas").select("*").eq("musteri_id", id).maybeSingle<MusteriHassasSatiri>(),
    supabase.from("musteri_veli").select("ad_soyad, telefon, yakinlik").eq("musteri_id", id).maybeSingle<MusteriVeliSatiri>(),
    supabase.from("uyelik_gorunum").select("*").eq("musteri_id", id).order("baslangic_tarihi", { ascending: false }),
    supabase.from("musteri_bakiye_hareket").select("*").eq("musteri_id", id).order("islem_zamani", { ascending: false }).limit(50),
    supabase.from("giris_kaydi").select("id, sonuc, red_nedeni, zaman, kaynak, iptal, hak_dusuldu, musteri_id, uyelik_id").eq("musteri_id", id).order("zaman", { ascending: false }).limit(20),
    supabase.from("uyelik_paketi").select("*").eq("aktif", true).order("ad"),
    supabase.from("musteri_onam").select("tur, verildi, metin_versiyonu, created_at").eq("musteri_id", id).order("created_at", { ascending: false }),
    supabase.from("musteri_bakiye").select("bakiye_kurus").eq("musteri_id", id).maybeSingle<{ bakiye_kurus: number }>(),
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
  const bakiyeKurus = Number(bakiyeSonuc.data?.bakiye_kurus ?? 0);

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
  const kvkkOnayli = sonOnam.get("kvkk_aydinlatma")?.verildi === true;

  const bakiyeDurumu = bakiyeKurus < 0 ? { etiket: "Borçlu", ton: "rose" as const } : bakiyeKurus > 0 ? { etiket: "Alacaklı", ton: "emerald" as const } : { etiket: "Dengede", ton: "slate" as const };

  return (
    <>
      <Link href="/panel/musteriler" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Müşteriler
      </Link>

      <Card className="gap-5">
        <div className="flex flex-wrap items-start gap-4 px-(--card-spacing)">
          <Avatar name={musteri.ad_soyad} className="size-16 text-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[1.625rem] leading-8 font-bold tracking-[-0.015em]">{musteri.ad_soyad}</h1>
              <StatusBadge tone="primary">{KATEGORI_ETIKETLERI[musteri.kategori]}</StatusBadge>
              {!musteri.aktif && <StatusBadge tone="slate">Pasif</StatusBadge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">
              #{musteri.uye_no} · {telefonGoster(musteri.telefon)}
              {musteri.eposta && ` · ${musteri.eposta}`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {musteri.risk_bayraklari.length > 0 && (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-warning-border bg-warning-soft px-2.5 text-xs font-semibold text-warning">
                  <HeartPulse className="size-3.5" strokeWidth={1.5} aria-hidden /> Sağlık / sakatlık riski
                </span>
              )}
              {kvkkOnayli && (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-success-border bg-success-soft px-2.5 text-xs font-semibold text-success">
                  <ShieldCheck className="size-3.5" strokeWidth={1.5} aria-hidden /> KVKK onaylı
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mx-(--card-spacing) flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface p-4">
          <div>
            <p className="text-etiket text-muted-foreground">Cari bakiye durumu</p>
            <p className={cn("text-metric mt-1 text-[2rem] leading-10", bakiyeKurus < 0 && "text-destructive")}>{kurusTLyazi(bakiyeKurus)}</p>
          </div>
          <StatusBadge tone={bakiyeDurumu.ton}>{bakiyeDurumu.etiket}</StatusBadge>
        </div>

        <div className="flex flex-wrap gap-2 px-(--card-spacing)">
          <Link href={`/panel/musteriler/${id}?sekme=cari#odeme`} className={buttonVariants({ size: "lg" })}>
            <Banknote aria-hidden /> Ödeme Al
          </Link>
          <Link href={`/panel/musteriler/${id}?sekme=uyelikler#uyelik-sat`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            <CreditCard aria-hidden /> Üyelik Sat
          </Link>
          <a href={`tel:${musteri.telefon}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Phone aria-hidden /> Ara
          </a>
        </div>
      </Card>

      <nav aria-label="Müşteri bölümleri" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {SEKMELER.map((s) => (
          <Link
            key={s.kod}
            href={`/panel/musteriler/${id}?sekme=${s.kod}`}
            aria-current={sekme === s.kod ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-lg px-4 text-sm font-semibold transition-colors",
              sekme === s.kod ? "bg-primary text-primary-foreground" : "border border-border bg-surface-2 text-muted-foreground hover:text-foreground"
            )}
          >
            {s.etiket}
            {s.kod === "uyelikler" && ` (${uyelikler.length})`}
          </Link>
        ))}
      </nav>

      {sekme === "uyelikler" && (
        <>
          <section className="flex flex-col gap-4" aria-label="Üyelikler">
            <h2 className="text-lg font-semibold tracking-tight">Paket ve seanslar</h2>
            {uyelikler.length === 0 ? (
              <EmptyState compact title="Henüz üyelik yok." />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {uyelikler.map((u) => {
                  const d = UYELIK_DURUMU[u.gecerli_durum];
                  const gun = kalanGun(u, bugun);
                  const uyari = bitiyorUyarisi(u, bugun);
                  const seans = u.tur === "seans" && u.toplam_hak !== null && u.kalan_hak !== null;
                  const yuzde = gecenSureYuzdesi(u, bugun);
                  return (
                    <Card key={u.id} className="gap-4">
                      <div className="flex items-start gap-3 px-(--card-spacing)">
                        <IconTile icon={seans ? Ticket : Dumbbell} tone="blue" className="size-11" />
                        <div className="min-w-0 flex-1">
                          <p className="font-bold tracking-tight">{u.paket_adi}</p>
                          <p className="text-sm text-muted-foreground">{seans ? `${u.toplam_hak} seans` : "Süre bazlı üyelik"}</p>
                        </div>
                        <StatusBadge tone={d.ton}>{d.etiket}</StatusBadge>
                      </div>

                      <div className="mx-(--card-spacing) flex flex-col gap-3 rounded-lg bg-surface p-3">
                        {seans ? (
                          <>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground tabular-nums">
                                Tamamlanan: <span className="font-semibold text-foreground">{(u.toplam_hak ?? 0) - (u.kalan_hak ?? 0)} / {u.toplam_hak} Seans</span>
                              </span>
                              <span className="font-semibold text-primary tabular-nums">{u.kalan_hak} kaldı</span>
                            </div>
                            <SeansBloklari toplam={u.toplam_hak ?? 0} kalan={u.kalan_hak ?? 0} />
                            {u.bitis_tarihi && <p className="text-xs text-muted-foreground">Geçerlilik bitişi: <span className="font-semibold text-foreground tabular-nums">{gunYazi(u.bitis_tarihi)}</span></p>}
                          </>
                        ) : (
                          <>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Geçerlilik bitişi</span>
                              <span className="font-semibold tabular-nums">{u.bitis_tarihi ? gunYazi(u.bitis_tarihi) : "Süresiz"}</span>
                            </div>
                            {yuzde !== null && <ProgressBar value={yuzde} ton={uyari ? "uyari" : "marka"} />}
                            <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                              <span>Başlangıç: {gunYazi(u.baslangic_tarihi)}</span>
                              {gun !== null && <span className={cn("font-semibold", gun >= 0 ? "text-primary" : "text-muted-foreground")}>{gun >= 0 ? `${gun} gün kaldı` : "Süresi doldu"}</span>}
                            </div>
                          </>
                        )}
                      </div>

                      {uyari && <p className="mx-(--card-spacing) rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-sm font-medium text-warning">{uyari}</p>}

                      <div className="px-(--card-spacing)">
                        <UyelikIslemleri uyelik={u} musteriId={id} yonetici={yonetici} />
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          <Card id="uyelik-sat" className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="size-4" strokeWidth={1.5} aria-hidden /> Üyelik sat
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
        </>
      )}

      {sekme === "cari" && (
        <>
          <Card id="odeme" className="scroll-mt-20">
            <CardHeader>
              <CardTitle>Ödeme al</CardTitle>
              <CardDescription>Kayıtlar değiştirilemez; yanlış kayıt yeni (ters) kayıtla düzeltilir.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <OdemeFormu musteriId={id} />
              {yonetici && (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-muted-foreground select-none">İade yap (yönetici)</summary>
                  <div className="mt-3">
                    <IadeFormu musteriId={id} odemeler={iadeEdilebilirOdemeler} />
                  </div>
                </details>
              )}
            </CardContent>
          </Card>

          <section className="flex flex-col gap-3" aria-label="Cari hareketler">
            <h2 className="text-lg font-semibold tracking-tight">Son cari hareketler</h2>
            {hareketler.length === 0 ? (
              <EmptyState compact title="Henüz hareket yok." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>İşlem detayı</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hareketler.map((h) => {
                    const t = HAREKET_TURLERI[h.tur];
                    const net = h.tur === "borc" ? Number(h.tutar_kurus) - Number(h.iskonto_kurus) : Number(h.tutar_kurus);
                    return (
                      <TableRow key={h.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <StatusBadge tone={t.ton}>{t.etiket}</StatusBadge>
                            <span className="text-sm">{h.aciklama ?? (h.odeme_yontemi ? YONTEM_ETIKETLERI[h.odeme_yontemi] : "")}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                            {formatDateTime(h.islem_zamani)}
                            {h.odeme_yontemi && h.aciklama ? ` · ${YONTEM_ETIKETLERI[h.odeme_yontemi]}` : ""}
                            {Number(h.iskonto_kurus) > 0 ? ` · iskonto ${kurusTLyazi(h.iskonto_kurus)}` : ""}
                          </p>
                        </TableCell>
                        <TableCell className={cn("text-right font-semibold tabular-nums", h.tur === "odeme" ? "text-success" : "text-destructive")}>
                          {h.tur === "odeme" ? "+" : "−"}
                          {kurusTLyazi(net)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>
        </>
      )}

      {sekme === "giris" && (
        <section className="flex flex-col gap-3" aria-label="Giriş geçmişi">
          <h2 className="text-lg font-semibold tracking-tight">Son girişler</h2>
          {girisler.length === 0 ? (
            <EmptyState compact title="Henüz giriş kaydı yok." />
          ) : (
            <Card className="gap-0 py-0">
              <CardContent className="flex flex-col divide-y divide-border p-0">
                {girisler.map((g) => (
                  <div key={g.id} className="flex min-h-[52px] items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span className="tabular-nums">{formatDateTime(g.zaman)}</span>
                    {g.sonuc === "kabul" ? (
                      <StatusBadge tone={g.iptal ? "slate" : "emerald"}>{g.iptal ? "Kabul (iptal edildi)" : "Kabul"}</StatusBadge>
                    ) : (
                      <StatusBadge tone="rose">Red: {RED_NEDENLERI[g.red_nedeni ?? ""] ?? "—"}</StatusBadge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {sekme === "bilgiler" && (
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
              <CardTitle>Hassas bilgiler ve onaylar</CardTitle>
              <CardDescription>Kimlik, adres, acil durum, sağlık (özel nitelikli veri).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <HassasBilgiFormu musteriId={id} hassas={hassas ?? null} />
              <div>
                <h3 className="mb-2 text-sm font-semibold">Onam kayıtları (son durum)</h3>
                {sonOnam.size === 0 ? (
                  <p className="text-sm text-muted-foreground">Kayıt yok.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {[...sonOnam.values()].map((o) => (
                      <li key={o.tur} className="flex items-center justify-between gap-2">
                        <span>{o.tur.replaceAll("_", " ")}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
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
      )}
    </>
  );
}

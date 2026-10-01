import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, CalendarDays, CalendarPlus, CreditCard, Dumbbell, HeartPulse, Phone, ShieldCheck, Ticket, User, Wallet } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { ProgressBar, SeansBloklari } from "@/components/ui/progress-bar";
import { OzetModulKarti } from "@/components/panel/ozet-modul-karti";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, formatDate, formatDateTime, gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { DERS_DURUMU, HAREKET_TURLERI, KATEGORI_ETIKETLERI, RED_NEDENLERI, UYELIK_DURUMU, YONTEM_ETIKETLERI } from "@/lib/panel/etiketler";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { bitiyorUyarisi, gecenSureYuzdesi, kalanGun } from "@/lib/panel/uyelik-ozeti";
import { createClient } from "@/lib/supabase/server";
import { cn, telefonGoster, yasHesapla } from "@/lib/utils";
import type { GirisKaydiSatiri, HareketSatiri, MusteriHassasSatiri, MusteriSatiri, MusteriVeliSatiri, PaketSatiri, UyelikGorunumSatiri } from "@/types/veritabani";
import { HassasBilgiFormu, IadeFormu, MusteriBilgiFormu, OdemeFormu, SatisFormu, UyelikIslemleri } from "./islem-formlari";

export const metadata: Metadata = { title: "Müşteri" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEKMELER = [
  { kod: "bilgiler", etiket: "Kişisel Bilgiler" },
  { kod: "uyelikler", etiket: "Üyelikler" },
  { kod: "giris", etiket: "Ders & Giriş" },
  { kod: "cari", etiket: "Cari & Ödeme" },
] as const;
type Sekme = (typeof SEKMELER)[number]["kod"];

type DersSatiri = { id: string; baslangic: string; durum: keyof typeof DERS_DURUMU; antrenor_id: string; alan_id: string; gecikme_dakika: number | null };

function DersListesi({ dersler, antrenorAdi, alanAdi }: { dersler: DersSatiri[]; antrenorAdi: Map<string, string>; alanAdi: Map<string, string> }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col divide-y divide-border p-0">
        {dersler.map((d) => {
          const durum = DERS_DURUMU[d.durum];
          const etiket = d.durum === "gecikmeli_geldi" && d.gecikme_dakika ? `${durum.etiket} (${d.gecikme_dakika} dk)` : (durum?.etiket ?? d.durum);
          return (
            <div key={d.id} className="flex min-h-[52px] items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium tabular-nums">{formatDateTime(d.baslangic)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {antrenorAdi.get(d.antrenor_id) ?? "Antrenör atanmamış"}
                  {alanAdi.get(d.alan_id) ? ` · ${alanAdi.get(d.alan_id)}` : ""}
                </p>
              </div>
              <StatusBadge tone={durum?.ton ?? "slate"}>{etiket}</StatusBadge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default async function MusteriDetaySayfasi({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sekme?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(MUSTERI_ROLLERI);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { sekme: sekmeParam } = await searchParams;
  // Sekme yoksa müşteri kartı (bölüm kartları) gösterilir; klinikteki hasta dosyası gibi.
  const sekme: Sekme | null = SEKMELER.some((s) => s.kod === sekmeParam) ? (sekmeParam as Sekme) : null;

  const supabase = await createClient();
  const { data: musteri } = await supabase.from("musteri").select("*").eq("id", id).maybeSingle<MusteriSatiri>();
  if (!musteri) notFound();

  const [hassasSonuc, veliSonuc, uyelikSonuc, hareketSonuc, girisSonuc, paketSonuc, onamSonuc, bakiyeSonuc, hesapSonuc, iskontoSonuc, dersSonuc] = await Promise.all([
    supabase.from("musteri_hassas").select("*").eq("musteri_id", id).maybeSingle<MusteriHassasSatiri>(),
    supabase.from("musteri_veli").select("ad_soyad, telefon, yakinlik").eq("musteri_id", id).maybeSingle<MusteriVeliSatiri>(),
    supabase.from("uyelik_gorunum").select("*").eq("musteri_id", id).order("baslangic_tarihi", { ascending: false }),
    supabase.from("musteri_bakiye_hareket").select("*").eq("musteri_id", id).order("islem_zamani", { ascending: false }).limit(50),
    supabase.from("giris_kaydi").select("id, sonuc, red_nedeni, zaman, kaynak, iptal, hak_dusuldu, musteri_id, uyelik_id").eq("musteri_id", id).order("zaman", { ascending: false }).limit(20),
    supabase.from("uyelik_paketi").select("*").eq("aktif", true).order("ad"),
    supabase.from("musteri_onam").select("tur, verildi, metin_versiyonu, created_at").eq("musteri_id", id).order("created_at", { ascending: false }),
    supabase.from("musteri_bakiye").select("bakiye_kurus").eq("musteri_id", id).maybeSingle<{ bakiye_kurus: number }>(),
    supabase.rpc("banka_hesap_secenekleri"),
    supabase.from("kategori_iskonto_orani").select("yuzde").eq("kategori", musteri.kategori).maybeSingle<{ yuzde: number }>(),
    supabase.from("ders_seansi").select("id, baslangic, durum, antrenor_id, alan_id, gecikme_dakika").eq("musteri_id", id).order("baslangic", { ascending: false }).limit(30),
  ]);
  const dersler = (dersSonuc.data ?? []) as DersSatiri[];
  const [antrenorSonuc, alanSonuc] = dersler.length
    ? await Promise.all([
        supabase.from("kullanici").select("id, ad_soyad").in("id", [...new Set(dersler.map((d) => d.antrenor_id))]),
        supabase.from("alan_studyo").select("id, ad").in("id", [...new Set(dersler.map((d) => d.alan_id))]),
      ])
    : [{ data: [] }, { data: [] }];
  const antrenorAdi = new Map(((antrenorSonuc.data ?? []) as { id: string; ad_soyad: string }[]).map((a) => [a.id, a.ad_soyad]));
  const alanAdi = new Map(((alanSonuc.data ?? []) as { id: string; ad: string }[]).map((a) => [a.id, a.ad]));
  const simdi = new Date().toISOString();
  const yaklasanDersler = dersler.filter((d) => d.baslangic >= simdi && (d.durum === "planlandi" || d.durum === "ertelendi")).reverse();
  const gecmisDersler = dersler.filter((d) => !yaklasanDersler.includes(d));
  const hesaplar = (hesapSonuc.data ?? []) as { id: string; ad: string }[];
  const kategoriYuzdesi = Number(iskontoSonuc.data?.yuzde ?? 0);

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

  const aktifUyelik = uyelikler.find((u) => u.gecerli_durum === "aktif" || u.gecerli_durum === "dondurulmus");
  const sonGiris = girisler.find((g) => g.sonuc === "kabul" && !g.iptal);
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
              {yasHesapla(musteri.dogum_tarihi) !== null && ` · ${yasHesapla(musteri.dogum_tarihi)} yaşında`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {musteri.risk_bayraklari.length > 0 && (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-warning-border bg-warning-soft px-2.5 text-xs font-semibold text-warning">
                  <HeartPulse className="size-3.5" strokeWidth={1.5} aria-hidden /> Sağlık / sakatlık riski
                </span>
              )}
              {aktifUyelik && (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold text-primary">
                  <Ticket className="size-3.5" strokeWidth={1.5} aria-hidden /> {aktifUyelik.paket_adi}
                  {aktifUyelik.tur === "seans" ? ` · ${aktifUyelik.kalan_hak} hak` : ""}
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
          {musteri.aktif && (
            <Link href={`/panel/dersler/yeni?uye=${id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              <CalendarPlus aria-hidden /> Ders Ekle
            </Link>
          )}
          <a href={`tel:${musteri.telefon}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Phone aria-hidden /> Ara
          </a>
        </div>
      </Card>

      {sekme === null ? (
        <section aria-label="Müşteri bölümleri" className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-4">
          <OzetModulKarti href={`/panel/musteriler/${id}?sekme=bilgiler`} etiket="Kişisel Bilgiler" ozet="Kişisel bilgiler & iletişim" ikon={User} ton="blue" uyari={!kvkkOnayli} />
          <OzetModulKarti href={`/panel/musteriler/${id}?sekme=uyelikler`} etiket="Üyelikler" ozet={aktifUyelik ? `${aktifUyelik.paket_adi}${aktifUyelik.tur === "seans" ? ` · ${aktifUyelik.kalan_hak} hak` : ""}` : `${uyelikler.length} kayıt · aktif yok`} ikon={Ticket} ton="emerald" uyari={!aktifUyelik} />
          <OzetModulKarti href={`/panel/musteriler/${id}?sekme=giris`} etiket="Ders & Giriş" ozet={yaklasanDersler[0] ? `Sonraki: ${formatDateTime(yaklasanDersler[0].baslangic)}` : sonGiris ? `Son giriş: ${formatDate(sonGiris.zaman)}` : dersler.length > 0 ? `${dersler.length} ders kaydı` : "Ders yok"} ikon={CalendarDays} ton="cyan" />
          <OzetModulKarti href={`/panel/musteriler/${id}?sekme=cari`} etiket="Cari & Ödeme" ozet={bakiyeKurus < 0 ? `Borç · ${kurusTLyazi(-bakiyeKurus)}` : `Alacak · ${kurusTLyazi(bakiyeKurus)}`} ozetTonu={bakiyeKurus < 0 ? "rose" : "emerald"} ikon={Wallet} ton="amber" />
          <OzetModulKarti href="#" etiket="Antrenman & Ölçüm" ikon={Dumbbell} ton="violet" yakinda className="col-span-2 mx-auto w-1/2 sm:col-span-1 sm:w-auto" />
        </section>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <Link href={`/panel/musteriler/${id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <ArrowLeft className="size-4" aria-hidden /> Müşteri kartı
          </Link>
          <h2 className="text-base font-semibold">{SEKMELER.find((x) => x.kod === sekme)?.etiket}</h2>
        </div>
      )}

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
                <SatisFormu musteriId={id} paketler={paketler} bugun={bugun} kategoriYuzdesi={kategoriYuzdesi} />
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
              <OdemeFormu musteriId={id} hesaplar={hesaplar} />
              {yonetici && (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-muted-foreground select-none">İade yap (yönetici)</summary>
                  <div className="mt-3">
                    <IadeFormu musteriId={id} odemeler={iadeEdilebilirOdemeler} hesaplar={hesaplar} />
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
        <>
        <section className="flex flex-col gap-3" aria-label="Ders listesi">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Dersler</h2>
            {musteri.aktif && (
              <Link href={`/panel/dersler/yeni?uye=${id}`} className={buttonVariants({ size: "sm" })}>
                <CalendarPlus aria-hidden /> Ders Ekle
              </Link>
            )}
          </div>
          {dersler.length === 0 ? (
            <EmptyState compact title="Henüz ders kaydı yok." />
          ) : (
            <>
              {yaklasanDersler.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-etiket text-muted-foreground">Yaklaşan</h3>
                  <DersListesi dersler={yaklasanDersler} antrenorAdi={antrenorAdi} alanAdi={alanAdi} />
                </div>
              )}
              {gecmisDersler.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-etiket text-muted-foreground">Geçmiş</h3>
                  <DersListesi dersler={gecmisDersler} antrenorAdi={antrenorAdi} alanAdi={alanAdi} />
                </div>
              )}
            </>
          )}
        </section>
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
        </>
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

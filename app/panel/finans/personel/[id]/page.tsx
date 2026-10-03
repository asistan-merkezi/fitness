import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { IZIN_DURUMU, IZIN_TIPLERI, PERSONEL_BELGE_TURU, PERSONEL_HAREKET_TURLERI, PUANTAJ_DURUMU } from "@/lib/panel/etiketler";
import { IZIN_TAKIBI_YOLU } from "@/lib/panel/izin-yollari";
import { hakedisArtirirMi } from "@/lib/panel/personel-odeme";
import { FINANS_YONETIM_ROLLERI, ROL_ETIKETLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { KullaniciRolu } from "@/lib/auth/gecerli-kullanici";
import { IzinIptalButonu } from "../puantaj/izin-talebi/izin-formlari";
import { DegerlendirmeFormu } from "../puantaj/izin-takibi/formlar";
import { ProfilFormu } from "../formlar";
import { OdemeEkleDiyalog } from "../odeme-diyalog";
import { BelgeEkleFormu, BelgeKaldirButonu, KisiselFormu, type KisiselBilgi } from "./kisisel-formlari";

export const metadata: Metadata = { title: "Personel Kartı" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BELGE_UYARI_GUN = 60;

type Profil = { maas_kurus: number; ders_prim_kurus: number; ise_giris_tarihi: string | null; isten_cikis_tarihi: string | null };
type Hareket = { id: string; tur: keyof typeof PERSONEL_HAREKET_TURLERI; tutar_kurus: number; donem: string | null; odeme_yontemi: string | null; aciklama: string | null; islem_tarihi: string };
type Belge = { id: string; tur: string; ad: string; veren_kurum: string | null; belge_no: string | null; verilis_tarihi: string | null; gecerlilik_bitis: string | null; not_metni: string | null };
type Izin = { id: string; tip: keyof typeof IZIN_TIPLERI; baslangic_tarihi: string; bitis_tarihi: string; gun_sayisi: number; gerekce: string | null; durum: keyof typeof IZIN_DURUMU; red_gerekce: string | null };
type PuantajSatiri = { tarih: string; durum: string; giris_saati: string | null; cikis_saati: string | null; fazla_mesai_dk: number; not_metni: string | null };

const SEKMELER = [
  { kod: "genel", etiket: "Genel", yalnizYonetici: false },
  { kod: "kisisel", etiket: "Kişisel Bilgiler ve Belgeler", yalnizYonetici: true },
  { kod: "odeme", etiket: "Maaş ve Ödemeler", yalnizYonetici: false },
  { kod: "puantaj", etiket: "Puantaj", yalnizYonetici: false },
] as const;

/** Salt takvim aritmetiği (şimdiki zaman okumaz): "YYYY-MM-DD" + gün. */
function gunEkle(tarih: string, gun: number): string {
  const d = new Date(`${tarih}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + gun);
  return d.toISOString().slice(0, 10);
}

function belgeDurumu(bitis: string | null, bugun: string): "suresiz" | "gecerli" | "yaklasiyor" | "doldu" {
  if (!bitis) return "suresiz";
  if (bitis < bugun) return "doldu";
  if (bitis <= gunEkle(bugun, BELGE_UYARI_GUN)) return "yaklasiyor";
  return "gecerli";
}

export default async function PersonelKartiSayfasi({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sekme?: string; odemeEkle?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";
  const { id } = await params;
  const { sekme: sekmeParam, odemeEkle } = await searchParams;
  if (!UUID.test(id)) notFound();

  const gorunenSekmeler = SEKMELER.filter((s) => yonetici || !s.yalnizYonetici);
  // Eski "izin" sekmesi Puantaj sekmesine taşındı (izin bakiyesi ve talepleri orada).
  const sekme = gorunenSekmeler.find((s) => s.kod === (sekmeParam === "izin" ? "puantaj" : sekmeParam))?.kod ?? "genel";

  const supabase = await createClient();
  const { data: personel } = await supabase.from("kullanici").select("id, ad_soyad, rol, aktif").eq("id", id).maybeSingle<{ id: string; ad_soyad: string; rol: KullaniciRolu; aktif: boolean }>();
  if (!personel || personel.rol === "super_admin") notFound();

  const bugun = bugunIstanbulTarihi();
  const ayBasi = `${bugun.slice(0, 7)}-01`;

  const [{ data: profilVeri }, { data: bakiyeVeri }, belgeSonucu] = await Promise.all([
    supabase.from("personel_profil").select("maas_kurus, ders_prim_kurus, ise_giris_tarihi, isten_cikis_tarihi").eq("kullanici_id", id).maybeSingle<Profil>(),
    supabase.from("personel_bakiye").select("hak_edilen_kurus, odenen_kurus, bakiye_kurus").eq("kullanici_id", id).maybeSingle<{ hak_edilen_kurus: number; odenen_kurus: number; bakiye_kurus: number }>(),
    // Belgeler özel veri: yalnız yönetici okur (RLS de aynısını uygular).
    yonetici
      ? supabase.from("personel_belge").select("id, tur, ad, veren_kurum, belge_no, verilis_tarihi, gecerlilik_bitis, not_metni").eq("kullanici_id", id).eq("aktif", true).order("gecerlilik_bitis", { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] as Belge[] }),
  ]);
  const profil = profilVeri ?? null;
  const belgeler = (belgeSonucu.data ?? []) as Belge[];
  const bakiye = bakiyeVeri ? { hak: Number(bakiyeVeri.hak_edilen_kurus), odenen: Number(bakiyeVeri.odenen_kurus), kalan: Number(bakiyeVeri.bakiye_kurus) } : { hak: 0, odenen: 0, kalan: 0 };
  const uyariBelgeleri = belgeler.filter((b) => ["doldu", "yaklasiyor"].includes(belgeDurumu(b.gecerlilik_bitis, bugun)));

  const sekmeHref = (kod: string) => `/panel/finans/personel/${id}${kod === "genel" ? "" : `?sekme=${kod}`}`;

  return (
    <>
      <Link href="/panel/finans/personel" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Personel
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

      <nav aria-label="Personel kartı bölümleri" className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-border bg-surface-2 p-1">
        {gorunenSekmeler.map((s) => (
          <Link
            key={s.kod}
            href={sekmeHref(s.kod)}
            aria-current={s.kod === sekme ? "page" : undefined}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors", s.kod === sekme ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-3 hover:text-foreground")}
          >
            {s.etiket}
          </Link>
        ))}
      </nav>

      {sekme === "genel" && (
        <>
          <section aria-label="Bakiye" className="grid gap-4 sm:grid-cols-3">
            <KpiCard vurgu label="Bakiye (işletmenin borcu)" value={kurusTLyazi(bakiye.kalan)} />
            <KpiCard label="Toplam hakediş + prim" value={kurusTLyazi(bakiye.hak)} />
            <KpiCard label="Ödenen + avans" value={kurusTLyazi(bakiye.odenen)} />
          </section>

          {uyariBelgeleri.length > 0 && (
            <div role="status" className="flex items-start gap-2.5 rounded-lg border border-warning-border bg-warning-soft px-3 py-2.5 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Süresi dolan veya {BELGE_UYARI_GUN} gün içinde dolacak belge var:{" "}
                <Link href={sekmeHref("kisisel")} className="font-semibold underline">
                  {uyariBelgeleri.map((b) => b.ad).join(", ")}
                </Link>
              </span>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Çalışma bilgisi</CardTitle>
              <CardDescription>
                {profil
                  ? `Çalışma: ${profil.ise_giris_tarihi ? gunYazi(profil.ise_giris_tarihi) : "—"} → ${profil.isten_cikis_tarihi ? gunYazi(profil.isten_cikis_tarihi) : "devam ediyor"}`
                  : "Henüz maaş tanımlanmamış."}
              </CardDescription>
            </CardHeader>
            {profil && (
              <CardContent>
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
              </CardContent>
            )}
          </Card>
        </>
      )}

      {sekme === "kisisel" && yonetici && <KisiselSekmesi id={id} belgeler={belgeler} bugun={bugun} />}

      {sekme === "odeme" && <OdemeSekmesi id={id} adSoyad={personel.ad_soyad} yonetici={yonetici} profil={profil} bakiyeKurus={bakiye.kalan} otomatikAc={odemeEkle === "1"} />}


      {sekme === "puantaj" && <PuantajSekmesi id={id} ayBasi={ayBasi} bugun={bugun} yonetici={yonetici} />}
    </>
  );
}

async function KisiselSekmesi({ id, belgeler, bugun }: { id: string; belgeler: Belge[]; bugun: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("personel_kisisel")
    .select("telefon, dogum_tarihi, tc_kimlik_no, il, ilce, mahalle, adres_detay, acil_durum_ad_soyad, acil_durum_telefon")
    .eq("kullanici_id", id)
    .maybeSingle<KisiselBilgi>();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Kişisel bilgiler</CardTitle>
          <CardDescription>T.C. kimlik no, adres ve acil durum kişisi özel nitelikli kişisel veridir; yalnız işletme yöneticisi görür.</CardDescription>
        </CardHeader>
        <CardContent>
          <KisiselFormu kullaniciId={id} bilgi={data ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Belgeler</CardTitle>
          <CardDescription>Sertifika, ilk yardım, sağlık raporu ve sözleşme kayıtları. Süresi {BELGE_UYARI_GUN} gün içinde dolan belgeler uyarı alır.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {belgeler.length === 0 ? (
            <EmptyState compact title="Henüz belge kaydı yok." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Belge</TableHead>
                  <TableHead>Veren kurum</TableHead>
                  <TableHead>Geçerlilik</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {belgeler.map((b) => {
                  const durum = belgeDurumu(b.gecerlilik_bitis, bugun);
                  return (
                    <TableRow key={b.id}>
                      <TableCell>
                        <p className="font-medium">{b.ad}</p>
                        <p className="text-xs text-muted-foreground">
                          {PERSONEL_BELGE_TURU[b.tur] ?? b.tur}
                          {b.belge_no ? ` · No: ${b.belge_no}` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{b.veren_kurum ?? "—"}</TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="tabular-nums">{b.gecerlilik_bitis ? gunYazi(b.gecerlilik_bitis) : "Süresiz"}</span>
                          {durum === "doldu" && <StatusBadge tone="rose">Süresi doldu</StatusBadge>}
                          {durum === "yaklasiyor" && <StatusBadge tone="amber">Yakında dolacak</StatusBadge>}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <BelgeKaldirButonu kullaniciId={id} belgeId={b.id} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <BelgeEkleFormu kullaniciId={id} />
        </CardContent>
      </Card>
    </>
  );
}

async function OdemeSekmesi({ id, adSoyad, yonetici, profil, bakiyeKurus, otomatikAc }: { id: string; adSoyad: string; yonetici: boolean; profil: Profil | null; bakiyeKurus: number; otomatikAc: boolean }) {
  const supabase = await createClient();
  const bugun = bugunIstanbulTarihi();
  const ayBasi = `${bugun.slice(0, 7)}-01`;
  const [{ data: hareketVeri }, { data: hesapVeri }, { data: avansVeri }] = await Promise.all([
    supabase.from("personel_hesap_hareket").select("id, tur, tutar_kurus, donem, odeme_yontemi, aciklama, islem_tarihi").eq("kullanici_id", id).order("islem_tarihi", { ascending: false }).order("created_at", { ascending: false }).limit(100),
    supabase.rpc("banka_hesap_secenekleri"),
    supabase.from("personel_hesap_hareket").select("tutar_kurus").eq("kullanici_id", id).eq("tur", "avans").gte("islem_tarihi", ayBasi),
  ]);
  const buAykiAvans = ((avansVeri ?? []) as { tutar_kurus: number | string }[]).reduce((t, a) => t + Number(a.tutar_kurus), 0);
  const hareketler = (hareketVeri ?? []) as Hareket[];

  return (
    <>
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
            <ProfilFormu kullaniciId={id} profil={profil} />
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
          <CardTitle>Ödeme Ekle</CardTitle>
          <CardDescription>Maaş, avans, prim, yol, yemek, fazla mesai, kesinti ve diğer ödemeler. Kayıtlar değiştirilemez; hatalı kayıt için ters yönde yeni kayıt girin.</CardDescription>
        </CardHeader>
        <CardContent>
          <OdemeEkleDiyalog
            sabitPersonelId={id}
            satirlar={[{ id, adSoyad, gorev: "", bakiyeKurus, maasKurus: profil ? Number(profil.maas_kurus) : null, buAykiAvansKurus: buAykiAvans }]}
            hesaplar={(hesapVeri ?? []) as { id: string; ad: string }[]}
            bugun={bugun}
            otomatikAc={otomatikAc}
          />
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
                  const gelir = hakedisArtirirMi(h.tur);
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{gunYazi(h.islem_tarihi)}</TableCell>
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

/** Personelin izin bakiyesi ve talepleri; Puantaj sekmesinin içinde (izin artık puantajın parçası). Yalnız yönetici. */
async function IzinBolumu({ id }: { id: string }) {
  const supabase = await createClient();
  const [{ data: bakiyeVeri }, { data: talepVeri }] = await Promise.all([
    supabase.rpc("izin_bakiye", { p_kullanici_id: id }),
    supabase.from("izin_talebi").select("id, tip, baslangic_tarihi, bitis_tarihi, gun_sayisi, gerekce, durum, red_gerekce").eq("kullanici_id", id).order("baslangic_tarihi", { ascending: false }).limit(30),
  ]);
  const bakiye = ((bakiyeVeri ?? []) as { hak_gun: number; kullanilan_gun: number; bekleyen_gun: number; kalan_gun: number }[])[0];
  const talepler = (talepVeri ?? []) as Izin[];

  return (
    <>
      {bakiye && (
        <section aria-label="Yıllık izin bakiyesi" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard vurgu label="Kalan yıllık izin" value={<>{bakiye.kalan_gun} <span className="text-base font-medium">gün</span></>} />
          <KpiCard label="Toplam hak" value={<>{bakiye.hak_gun} <span className="text-base font-medium text-muted-foreground">gün</span></>} />
          <KpiCard label="Kullanılan" value={<>{bakiye.kullanilan_gun} <span className="text-base font-medium text-muted-foreground">gün</span></>} />
          <KpiCard label="Onay bekleyen" value={<>{bakiye.bekleyen_gun} <span className="text-base font-medium text-muted-foreground">gün</span></>} />
        </section>
      )}
      <Card>
        <CardHeader>
          <CardTitle>İzin talepleri</CardTitle>
          <CardDescription>
            Hak, işe giriş tarihinden ve (biliniyorsa) yaştan hesaplanır. Yeni izin kaydı için{" "}
            <Link href={IZIN_TAKIBI_YOLU} className="font-semibold underline">
              İzin / Rapor Takibi
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {talepler.length === 0 ? (
            <EmptyState compact title="Bu personelin izin talebi yok." />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {talepler.map((t) => {
                const d = IZIN_DURUMU[t.durum];
                return (
                  <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{IZIN_TIPLERI[t.tip]}</span>
                        <StatusBadge tone={d.ton}>{d.etiket}</StatusBadge>
                      </span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {gunYazi(t.baslangic_tarihi)} – {gunYazi(t.bitis_tarihi)} · {t.gun_sayisi} iş günü
                      </span>
                      {t.gerekce && <span className="text-xs text-muted-foreground">{t.gerekce}</span>}
                      {t.red_gerekce && <span className="text-xs text-destructive">Ret gerekçesi: {t.red_gerekce}</span>}
                    </div>
                    {t.durum === "beklemede" && <DegerlendirmeFormu izinId={t.id} />}
                    {t.durum === "onaylandi" && <IzinIptalButonu izinId={t.id} />}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

async function PuantajSekmesi({ id, ayBasi, bugun, yonetici }: { id: string; ayBasi: string; bugun: string; yonetici: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("personel_puantaj")
    .select("tarih, durum, giris_saati, cikis_saati, fazla_mesai_dk, not_metni")
    .eq("kullanici_id", id)
    .gte("tarih", ayBasi)
    .lte("tarih", bugun)
    .order("tarih", { ascending: false });
  const satirlar = (data ?? []) as PuantajSatiri[];
  const say = (d: string) => satirlar.filter((s) => s.durum === d).length;
  const fazlaDk = satirlar.reduce((t, s) => t + s.fazla_mesai_dk, 0);

  return (
    <>
      <section aria-label="Bu ay puantaj özeti" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard vurgu label="Geldi" value={say("geldi")} />
        <KpiCard label="Yarım gün" value={say("yarim_gun")} />
        <KpiCard label="Gelmedi / raporlu" value={`${say("gelmedi")} / ${say("raporlu")}`} />
        <KpiCard label="Fazla mesai" value={`${Math.floor(fazlaDk / 60)} sa ${fazlaDk % 60} dk`} />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Bu ayın kayıtları</CardTitle>
          <CardDescription>
            Tüm personelin aylık cetveli ve kayıt girişi için{" "}
            <Link href={`/panel/finans/personel/puantaj?ay=${bugun.slice(0, 7)}`} className="font-semibold underline">
              Puantaj Cetveli
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {satirlar.length === 0 ? (
            <EmptyState compact title="Bu ay için puantaj kaydı yok." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Saat</TableHead>
                  <TableHead>Not</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {satirlar.map((s) => (
                  <TableRow key={s.tarih}>
                    <TableCell className="whitespace-nowrap tabular-nums">{gunYazi(s.tarih)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={PUANTAJ_DURUMU[s.durum]?.ton ?? "slate"}>{PUANTAJ_DURUMU[s.durum]?.etiket ?? s.durum}</StatusBadge>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {s.giris_saati ? s.giris_saati.slice(0, 5) : "—"} – {s.cikis_saati ? s.cikis_saati.slice(0, 5) : "—"}
                      {s.fazla_mesai_dk > 0 ? ` · +${s.fazla_mesai_dk} dk` : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.not_metni ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {yonetici && <IzinBolumu id={id} />}
    </>
  );
}

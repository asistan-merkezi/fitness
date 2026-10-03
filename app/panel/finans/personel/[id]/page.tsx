import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, gunYazi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { IZIN_DURUMU, IZIN_TIPLERI, PUANTAJ_DURUMU } from "@/lib/panel/etiketler";
import { IZIN_TAKIBI_YOLU } from "@/lib/panel/izin-yollari";
import { FINANS_YONETIM_ROLLERI, ROL_ETIKETLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import type { KullaniciRolu } from "@/lib/auth/gecerli-kullanici";
import { IzinIptalButonu } from "../puantaj/izin-talebi/izin-formlari";
import { DegerlendirmeFormu } from "../puantaj/izin-takibi/formlar";
import { PersonelKartBasligi } from "./kart-baslik";
import { BELGE_UYARI_GUN, belgeDurumu } from "./belge-yardimcilari";
import { KisiselSekmesi, type Belge } from "./kisisel-sekmesi";
import { OdemeSekmesi } from "./odeme-sekmesi";

export const metadata: Metadata = { title: "Personel Kartı" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Profil = { maas_kurus: number; ders_prim_kurus: number; ise_giris_tarihi: string | null; isten_cikis_tarihi: string | null };
type Izin = { id: string; tip: keyof typeof IZIN_TIPLERI; baslangic_tarihi: string; bitis_tarihi: string; gun_sayisi: number; gerekce: string | null; durum: keyof typeof IZIN_DURUMU; red_gerekce: string | null };
type PuantajSatiri = { tarih: string; durum: string; giris_saati: string | null; cikis_saati: string | null; fazla_mesai_dk: number; not_metni: string | null };

const SEKMELER = [
  { kod: "genel", etiket: "Genel", yalnizYonetici: false },
  { kod: "kisisel", etiket: "Kişisel Bilgiler ve Belgeler", yalnizYonetici: true },
  { kod: "odeme", etiket: "Maaş ve Ödemeler", yalnizYonetici: false },
  { kod: "puantaj", etiket: "Puantaj", yalnizYonetici: false },
] as const;

export default async function PersonelKartiSayfasi({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sekme?: string; odemeEkle?: string; ay?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";
  const { id } = await params;
  const { sekme: sekmeParam, odemeEkle, ay: ayParam } = await searchParams;
  if (!UUID.test(id)) notFound();

  const gorunenSekmeler = SEKMELER.filter((s) => yonetici || !s.yalnizYonetici);
  // Eski "izin" sekmesi Puantaj sekmesine taşındı (izin bakiyesi ve talepleri orada).
  const sekme = gorunenSekmeler.find((s) => s.kod === (sekmeParam === "izin" ? "puantaj" : sekmeParam))?.kod ?? "genel";

  const supabase = await createClient();
  const { data: personel } = await supabase.from("kullanici").select("id, ad_soyad, rol, aktif, telefon, pozisyon_id").eq("id", id).maybeSingle<{ id: string; ad_soyad: string; rol: KullaniciRolu; aktif: boolean; telefon: string | null; pozisyon_id: string | null }>();
  if (!personel || personel.rol === "super_admin") notFound();

  const bugun = bugunIstanbulTarihi();
  const ayBasi = `${bugun.slice(0, 7)}-01`;

  const [{ data: profilVeri }, { data: bakiyeVeri }, belgeSonucu, { data: pozisyonVeri }, { data: ayPuantajVeri }, { data: bugunIzinVeri }] = await Promise.all([
    supabase.from("personel_profil").select("maas_kurus, ders_prim_kurus, ise_giris_tarihi, isten_cikis_tarihi").eq("kullanici_id", id).maybeSingle<Profil>(),
    supabase.from("personel_bakiye").select("hak_edilen_kurus, odenen_kurus, bakiye_kurus").eq("kullanici_id", id).maybeSingle<{ hak_edilen_kurus: number; odenen_kurus: number; bakiye_kurus: number }>(),
    // Belgeler özel veri: yalnız yönetici okur (RLS de aynısını uygular).
    yonetici
      ? supabase.from("personel_belge").select("id, tur, ad, veren_kurum, belge_no, verilis_tarihi, gecerlilik_bitis, not_metni").eq("kullanici_id", id).eq("aktif", true).order("gecerlilik_bitis", { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] as Belge[] }),
    personel.pozisyon_id ? supabase.from("pozisyonlar").select("ad").eq("id", personel.pozisyon_id).maybeSingle<{ ad: string }>() : Promise.resolve({ data: null as { ad: string } | null }),
    // Çalışma Çizelgesi kartının canlı özeti: içinde bulunulan ay + bugünün durumu (izin yalnız yönetici okur; muhasebede boş döner).
    supabase.from("personel_puantaj").select("tarih, durum, giris_saati, fazla_mesai_dk").eq("kullanici_id", id).gte("tarih", ayBasi).lte("tarih", bugun),
    supabase.from("izin_talebi").select("id").eq("kullanici_id", id).eq("durum", "onaylandi").lte("baslangic_tarihi", bugun).gte("bitis_tarihi", bugun),
  ]);
  const profil = profilVeri ?? null;
  const belgeler = (belgeSonucu.data ?? []) as Belge[];
  const bakiye = bakiyeVeri ? { hak: Number(bakiyeVeri.hak_edilen_kurus), odenen: Number(bakiyeVeri.odenen_kurus), kalan: Number(bakiyeVeri.bakiye_kurus) } : { hak: 0, odenen: 0, kalan: 0 };
  const uyariBelgeleri = belgeler.filter((b) => ["doldu", "yaklasiyor"].includes(belgeDurumu(b.gecerlilik_bitis, bugun)));

  const ayKayitlari = (ayPuantajVeri ?? []) as { tarih: string; durum: string; giris_saati: string | null; fazla_mesai_dk: number }[];
  const gelinenGun = ayKayitlari.reduce((t, k) => t + (k.durum === "geldi" ? 1 : k.durum === "yarim_gun" ? 0.5 : 0), 0);
  const ayFmDk = ayKayitlari.reduce((t, k) => t + k.fazla_mesai_dk, 0);
  const bugunKaydi = ayKayitlari.find((k) => k.tarih === bugun);
  const cizelgeNoktasi: "emerald" | "sky" | "muted" = bugunKaydi?.giris_saati ? "emerald" : bugunKaydi?.durum === "raporlu" || (bugunIzinVeri ?? []).length > 0 ? "sky" : "muted";
  const cizelgeAltBasligi = `${donemCoz({ gorunum: "ay", tarih: bugun.slice(0, 7) }).etiket} · ${String(gelinenGun).replace(".", ",")} gün · ${(ayFmDk / 60).toFixed(1).replace(".", ",")} sa FM`;
  const gorev = pozisyonVeri?.ad ? `${pozisyonVeri.ad} · ${ROL_ETIKETLERI[personel.rol]}` : ROL_ETIKETLERI[personel.rol];

  const sekmeHref = (kod: string) => `/panel/finans/personel/${id}${kod === "genel" ? "" : `?sekme=${kod}`}`;

  return (
    <>
      <PersonelKartBasligi
        id={id}
        adSoyad={personel.ad_soyad}
        telefon={personel.telefon}
        gorev={gorev}
        aktif={personel.aktif}
        sekme={sekme}
        kisiselGorunur={yonetici}
        bakiyeEtiketi={`${kurusTLyazi(bakiye.kalan)} bakiye`}
        cizelgeAltBasligi={cizelgeAltBasligi}
        cizelgeNoktasi={cizelgeNoktasi}
      />

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

      {sekme === "kisisel" && yonetici && <KisiselSekmesi id={id} belgeler={belgeler} bugun={bugun} pozisyonAdi={pozisyonVeri?.ad ?? null} rolEtiketi={ROL_ETIKETLERI[personel.rol]} aktif={personel.aktif} />}

      {sekme === "odeme" && <OdemeSekmesi id={id} adSoyad={personel.ad_soyad} rol={personel.rol} yonetici={yonetici} profil={profil} bakiye={bakiye} otomatikAc={odemeEkle === "1"} ayParam={ayParam} />}


      {sekme === "puantaj" && <PuantajSekmesi id={id} ayBasi={ayBasi} bugun={bugun} yonetici={yonetici} />}
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

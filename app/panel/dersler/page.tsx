import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, LayoutGrid, List } from "lucide-react";
import { CanliSaat } from "@/components/panel/canli-saat";
import { GunCizelgesi } from "@/components/panel/gun-cizelgesi";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, formatDateForInput, formatTime, gunYazi } from "@/lib/datetime";
import { gunDonemi } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { dersEylemleri } from "@/lib/panel/ders";
import { DERS_DURUMU, RISK_TIPI_ETIKETLERI } from "@/lib/panel/etiketler";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { DersSeansiSatiri } from "@/types/veritabani";
import { BekleyenTalepler, type BekleyenDersTalebi } from "./bekleyen-talepler";
import { DersDetayDialog, type DersDetayi } from "./ders-detay-dialog";
import { DersEylemleri } from "./ders-eylemleri";
import type { MusteriSecenegi } from "./ders-sorgulari";
import { YeniDersDialog } from "./yeni-ders-dialog";

export const metadata: Metadata = { title: "Dersler" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GUN = /^\d{4}-\d{2}-\d{2}$/;
const BEKLEYEN = ["planlandi", "ertelendi"];
const KAPANAN = ["iptal", "gelmedi"];

const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;

export default async function DerslerSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ gun?: string; antrenor?: string; ok?: string; gorunum?: string; yeni?: string; uye?: string; saat?: string; ders?: string }>;
}) {
  const { kullanici, authUser } = await sayfaYetkisiIste([...MUSTERI_ROLLERI, "antrenor"]);
  const { gun, antrenor, ok, gorunum, yeni, uye, saat, ders: dersParam } = await searchParams;
  // Varsayılan görünüm çizelge (alan sütunlu saat ızgarası); "liste" eylem düğmeli ders kartlarını gösterir.
  const liste = gorunum === "liste";
  const yonetim = (MUSTERI_ROLLERI as readonly string[]).includes(kullanici.rol);

  const bugun = bugunIstanbulTarihi();
  const gunParam = gun && GUN.test(gun) && !Number.isNaN(Date.parse(gun)) ? gun : bugun;
  const donem = gunDonemi(gunParam);
  const antrenorFiltre = yonetim && antrenor && UUID.test(antrenor) ? antrenor : null;

  const supabase = await createClient();
  let sorgu = supabase
    .from("ders_seansi")
    .select("id, musteri_id, antrenor_id, alan_id, baslangic, bitis, durum, gecikme_dakika, ucret_kurus, uyelik_id, hak_dusuldu, borc_hareket_id, not_metni")
    .gte("baslangic", donem.baslangic)
    .lt("baslangic", donem.bitis)
    .order("baslangic");
  if (antrenorFiltre) sorgu = sorgu.eq("antrenor_id", antrenorFiltre);

  const [{ data: dersVeri }, { data: antrenorVeri }, { data: alanVeri }] = await Promise.all([
    sorgu,
    supabase.from("kullanici").select("id, ad_soyad").eq("rol", "antrenor").eq("aktif", true).order("ad_soyad"),
    supabase.from("alan_studyo").select("id, ad, aktif").order("ad"),
  ]);
  const dersler = (dersVeri ?? []) as DersSeansiSatiri[];
  const antrenorler = (antrenorVeri ?? []) as { id: string; ad_soyad: string }[];

  const musteriAdi = new Map<string, string>();
  const idler = [...new Set(dersler.map((d) => d.musteri_id))];
  if (idler.length) {
    const { data } = await supabase.from("musteri_ozet").select("id, ad_soyad").in("id", idler);
    for (const m of (data ?? []) as { id: string; ad_soyad: string }[]) musteriAdi.set(m.id, m.ad_soyad);
  }
  // Pasif antrenör de geçmiş derste görünebilsin diye ders satırlarındaki antrenörler ayrıca çözülür.
  const antrenorAdi = new Map(antrenorler.map((a) => [a.id, a.ad_soyad]));
  const eksikAntrenor = [...new Set(dersler.map((d) => d.antrenor_id))].filter((id) => !antrenorAdi.has(id));
  if (eksikAntrenor.length) {
    const { data } = await supabase.from("kullanici").select("id, ad_soyad").in("id", eksikAntrenor);
    for (const a of (data ?? []) as { id: string; ad_soyad: string }[]) antrenorAdi.set(a.id, a.ad_soyad);
  }
  // Bekleyen ders talepleri (yalnız yönetim/resepsiyon; gün filtresinden bağımsız, en eski önce).
  let bekleyenTalepler: BekleyenDersTalebi[] = [];
  if (yonetim) {
    const { data: talepVeri } = await supabase.from("musteri_ders_talebi").select("id, musteri_id, tercih_tarih, tercih_saat, antrenor_id, not_metni").eq("durum", "bekliyor").order("created_at").limit(50);
    const talepSatirlari = (talepVeri ?? []) as { id: string; musteri_id: string; tercih_tarih: string; tercih_saat: string | null; antrenor_id: string | null; not_metni: string | null }[];
    const talepMusteriIdleri = [...new Set(talepSatirlari.map((t) => t.musteri_id))];
    const talepMusteriAdi = new Map<string, string>();
    if (talepMusteriIdleri.length) {
      const { data } = await supabase.from("musteri_ozet").select("id, ad_soyad").in("id", talepMusteriIdleri);
      for (const m of (data ?? []) as { id: string; ad_soyad: string }[]) talepMusteriAdi.set(m.id, m.ad_soyad);
    }
    bekleyenTalepler = talepSatirlari.map((t) => ({ id: t.id, musteri_id: t.musteri_id, musteri_adi: talepMusteriAdi.get(t.musteri_id) ?? "Müşteri", tercih_tarih: t.tercih_tarih, tercih_saat: t.tercih_saat, antrenor_adi: t.antrenor_id ? (antrenorAdi.get(t.antrenor_id) ?? null) : null, not_metni: t.not_metni }));
  }

  const tumAlanlar = (alanVeri ?? []) as { id: string; ad: string; aktif: boolean }[];
  const alanAdi = new Map(tumAlanlar.map((a) => [a.id, a.ad]));
  const kullanilanAlanlar = new Set(dersler.map((d) => d.alan_id));
  const cizelgeAlanlari = tumAlanlar.filter((a) => a.aktif || kullanilanAlanlar.has(a.id));

  // Yeni Ders penceresi (`?yeni=1`): müşteri kartından gelinirse (`uye`) müşteri sabit gelir.
  const yeniAcik = yonetim && yeni === "1";
  let sabitMusteri: MusteriSecenegi | undefined;
  if (yeniAcik && uye && UUID.test(uye)) {
    const { data } = await supabase.from("musteri").select("id, uye_no, ad_soyad, telefon").eq("id", uye).eq("aktif", true).maybeSingle<MusteriSecenegi>();
    sabitMusteri = data ?? undefined;
  }

  const bekleyen = dersler.filter((d) => BEKLEYEN.includes(d.durum)).length;
  const kapanan = dersler.filter((d) => KAPANAN.includes(d.durum)).length;
  const tamamlanan = dersler.filter((d) => d.durum === "tamamlandi").length;

  const baglanti = (g: string, gorunumu: "cizelge" | "liste" = liste ? "liste" : "cizelge") => `/panel/dersler?gun=${g}${antrenorFiltre ? `&antrenor=${antrenorFiltre}` : ""}${gorunumu === "liste" ? "&gorunum=liste" : ""}`;
  const bugunMu = gunParam === bugun;

  // Ders detayı penceresi (`?ders=`): çizelgede bir derse tıklayınca açılır; yalnız görüntülenen günün dersleri aranır.
  let detay: DersDetayi | null = null;
  const seciliDers = dersParam && UUID.test(dersParam) ? dersler.find((d) => d.id === dersParam) : undefined;
  if (seciliDers) {
    const durum = DERS_DURUMU[seciliDers.durum];
    // Risk bayrakları sağlık verisidir: yalnız yönetim/resepsiyon okuyabilir (RLS); antrenörde sorgu zaten boş döner.
    const { data: riskVeri } = yonetim ? await supabase.from("musteri_risk_bayragi").select("tip, seviye").eq("musteri_id", seciliDers.musteri_id).eq("aktif", true) : { data: [] };
    detay = {
      id: seciliDers.id,
      musteriId: seciliDers.musteri_id,
      musteriAdi: musteriAdi.get(seciliDers.musteri_id) ?? "Müşteri",
      antrenorAdi: antrenorAdi.get(seciliDers.antrenor_id) ?? "Antrenör",
      alanAdi: alanAdi.get(seciliDers.alan_id) ?? "Alan",
      zaman: `${gunYazi(formatDateForInput(seciliDers.baslangic))} · ${formatTime(seciliDers.baslangic)}–${formatTime(seciliDers.bitis)}`,
      durumEtiketi: durum.etiket,
      durumTonu: durum.ton,
      ucret: seciliDers.ucret_kurus > 0 ? kurusTLyazi(seciliDers.ucret_kurus) : null,
      haktenDustu: seciliDers.hak_dusuldu,
      cariyeYazildi: seciliDers.borc_hareket_id !== null,
      gecikmeDk: seciliDers.gecikme_dakika,
      notMetni: seciliDers.not_metni,
      riskler: ((riskVeri ?? []) as { tip: string; seviye: "yuksek" | "orta" | "dusuk" }[]).map((r) => ({ etiket: RISK_TIPI_ETIKETLERI[r.tip] ?? r.tip, seviye: r.seviye })),
      eylemler: dersEylemleri(seciliDers.durum, kullanici.rol, seciliDers.antrenor_id === authUser.id),
      tasimaBaslangici: `${formatDateForInput(seciliDers.baslangic)}T${formatTime(seciliDers.baslangic)}`,
      yonetim,
    };
  }

  return (
    <>
      <PageHeader
        title="Dersler"
        description={donem.etiket}
        icon={CalendarDays}
        actions={
          yonetim ? (
            antrenorler.length === 0 || tumAlanlar.every((a) => !a.aktif) ? (
              <Button type="button" disabled title="Önce antrenör ve alan (stüdyo) tanımı gerekli.">
                <CalendarPlus aria-hidden /> Yeni Ders
              </Button>
            ) : (
              <Link href={`${baglanti(gunParam)}&yeni=1`} scroll={false} className={buttonVariants({ className: "bg-emerald-500 text-white hover:bg-emerald-600" })}>
                <CalendarPlus aria-hidden /> Yeni Ders
              </Link>
            )
          ) : undefined
        }
      />

      {yeniAcik && (
        <YeniDersDialog
          kapatHref={baglanti(gunParam)}
          antrenorler={antrenorler}
          alanlar={tumAlanlar.filter((a) => a.aktif)}
          varsayilanTarih={gunParam}
          varsayilanSaat={saat && SAAT.test(saat) ? saat : undefined}
          sabitMusteri={sabitMusteri}
        />
      )}

      {detay && <DersDetayDialog ders={detay} kapatHref={baglanti(gunParam)} />}

      {ok === "olustu" && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-success-border bg-success-soft px-4 py-3 text-sm font-semibold text-success">
          <CheckCircle2 className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
          Ders planlandı.
        </p>
      )}

      <BekleyenTalepler talepler={bekleyenTalepler} />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={baglanti(donem.oncekiParam)} aria-label="Önceki gün" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeft aria-hidden />
        </Link>
        <Link href={baglanti(bugun)} aria-current={bugunMu ? "date" : undefined} className={cn(buttonVariants({ variant: bugunMu ? "default" : "outline" }))}>
          Bugün
        </Link>
        <Link href={baglanti(donem.sonrakiParam)} aria-label="Sonraki gün" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronRight aria-hidden />
        </Link>
        <form action="/panel/dersler" method="get" className="flex items-center gap-2">
          <Input name="gun" type="date" defaultValue={gunParam} aria-label="Tarihe git" className="w-auto" />
          {antrenorFiltre && <input type="hidden" name="antrenor" value={antrenorFiltre} />}
          {liste && <input type="hidden" name="gorunum" value="liste" />}
          <Button type="submit" variant="outline">
            Git
          </Button>
        </form>
        {yonetim && antrenorler.length > 0 && (
          <form action="/panel/dersler" method="get" className="flex items-center gap-2 sm:ml-auto">
            <input type="hidden" name="gun" value={gunParam} />
            {liste && <input type="hidden" name="gorunum" value="liste" />}
            <select name="antrenor" defaultValue={antrenorFiltre ?? ""} aria-label="Antrenör süz" className="h-10 rounded-lg border border-input bg-input-bg px-3 text-sm">
              <option value="">Tüm antrenörler</option>
              {antrenorler.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.ad_soyad}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              Süz
            </Button>
          </form>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Görünüm">
          <Link href={baglanti(gunParam, "cizelge")} aria-current={!liste ? "true" : undefined} className={cn(buttonVariants({ variant: !liste ? "default" : "outline", size: "sm" }), liste && "text-muted-foreground")}>
            <LayoutGrid aria-hidden /> Çizelge
          </Link>
          <Link href={baglanti(gunParam, "liste")} aria-current={liste ? "true" : undefined} className={cn(buttonVariants({ variant: liste ? "default" : "outline", size: "sm" }), !liste && "text-muted-foreground")}>
            <List aria-hidden /> Liste
          </Link>
        </div>
        {bugunMu && <CanliSaat />}
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <StatusBadge tone="sky">{bekleyen} bekleyen</StatusBadge>
        <StatusBadge tone="primary">{tamamlanan} tamamlanan</StatusBadge>
        <StatusBadge tone="slate">{kapanan} iptal/gelmedi</StatusBadge>
      </div>

      {dersler.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Bu gün için ders yok"
          description={yonetim ? "Yeni Ders ile bu güne ders planlayabilirsiniz." : "Size atanmış ders bulunmuyor."}
        />
      ) : !liste ? (
        <GunCizelgesi
          dersler={dersler.map((d) => ({
            id: d.id,
            musteri_adi: musteriAdi.get(d.musteri_id) ?? "Müşteri",
            antrenor_adi: antrenorAdi.get(d.antrenor_id) ?? "Antrenör",
            alan_id: d.alan_id,
            baslangic: d.baslangic,
            bitis: d.bitis,
            durum: d.durum,
          }))}
          alanlar={cizelgeAlanlari}
          bugunMu={bugunMu}
          ayrintiHref={(id) => `${baglanti(gunParam)}&ders=${id}`}
          maxYukseklik={720}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {dersler.map((d) => {
            const ad = musteriAdi.get(d.musteri_id) ?? "Müşteri";
            const durum = DERS_DURUMU[d.durum];
            const eylemler = dersEylemleri(d.durum, kullanici.rol, d.antrenor_id === authUser.id);
            const islendi = d.hak_dusuldu || d.borc_hareket_id !== null;
            return (
              <li key={d.id} id={`ders-${d.id}`} className="scroll-mt-24">
                <Card className={cn("gap-3 p-4", KAPANAN.includes(d.durum) && "opacity-70")}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="w-24 shrink-0 text-sm font-semibold tabular-nums">
                        {formatTime(d.baslangic)}–{formatTime(d.bitis)}
                      </div>
                      <Avatar name={ad} size="sm" />
                      <div className="min-w-0">
                        {yonetim ? (
                          <Link href={`/panel/musteriler/${d.musteri_id}`} className="truncate font-semibold hover:underline">
                            {ad}
                          </Link>
                        ) : (
                          <p className="truncate font-semibold">{ad}</p>
                        )}
                        <p className="truncate text-xs text-muted-foreground">
                          {antrenorAdi.get(d.antrenor_id) ?? "Antrenör"} · {alanAdi.get(d.alan_id) ?? "Alan"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {d.hak_dusuldu && <StatusBadge tone="emerald">Paketten düştü</StatusBadge>}
                      {d.borc_hareket_id && <StatusBadge tone="amber">Cariye yazıldı</StatusBadge>}
                      {!islendi && d.ucret_kurus > 0 && <span className="text-xs text-muted-foreground tabular-nums">{kurusTLyazi(d.ucret_kurus)}</span>}
                      <StatusBadge tone={durum.ton}>{durum.etiket}</StatusBadge>
                    </div>
                  </div>
                  {(d.gecikme_dakika || d.not_metni) && (
                    <p className="text-xs text-muted-foreground">
                      {d.gecikme_dakika ? `${d.gecikme_dakika} dk geç geldi. ` : ""}
                      {d.not_metni}
                    </p>
                  )}
                  <DersEylemleri dersId={d.id} eylemler={eylemler} tasimaBaslangici={`${formatDateForInput(d.baslangic)}T${formatTime(d.baslangic)}`} />
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

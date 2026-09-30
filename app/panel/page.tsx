import Link from "next/link";
import { Activity, Banknote, BellRing, CalendarClock, CalendarDays, CalendarOff, CalendarPlus, Inbox, LayoutDashboard, Link2Off, List, Phone, RefreshCw, ScanLine, TriangleAlert, UserPlus, Users, Wallet } from "lucide-react";
import { CanliSaat } from "@/components/panel/canli-saat";
import { type CizelgeDersi, GunCizelgesi } from "@/components/panel/gun-cizelgesi";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { bugunIstanbulTarihi, gunYazi } from "@/lib/datetime";
import { gunDonemi, gunEkle } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { ANTRENOR_DURUMU, antrenorDurumu } from "@/lib/panel/antrenor-durumu";
import { FINANS_ROLLERI, MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { kalanGun } from "@/lib/panel/uyelik-ozeti";
import { createClient } from "@/lib/supabase/server";
import { telefonGoster } from "@/lib/utils";
import type { DersDurumu, UyelikGorunumSatiri } from "@/types/veritabani";

type YaklasanSatiri = Pick<UyelikGorunumSatiri, "id" | "musteri_id" | "paket_adi" | "tur" | "bitis_tarihi" | "kalan_hak" | "baslangic_tarihi" | "toplam_hak" | "gecerli_durum">;
type DersSatiri = { id: string; musteri_id: string; antrenor_id: string; alan_id: string; baslangic: string; bitis: string; durum: DersDurumu };

export default async function PanelAnaSayfa() {
  const oturum = await gecerliKullanici();
  const kullanici = oturum?.kullanici ?? null;

  if (!oturum || !kullanici?.isletme_id || !kullanici.rol) {
    return (
      <>
        <PageHeader title="Panel" description="Fitness Asistanı yönetim paneli" icon={LayoutDashboard} />
        <EmptyState
          icon={Link2Off}
          title="Hesabınız henüz bir işletmeye bağlı değil"
          description="Bir yönetici hesabınızı bir işletmeye bağladığında panel modülleri burada görünür."
        />
      </>
    );
  }

  const rol = kullanici.rol;
  const gorunenAd = kullanici.ad_soyad ?? oturum.authUser.email ?? "Kullanıcı";
  const musteriYetkisi = (MUSTERI_ROLLERI as readonly string[]).includes(rol);
  const finansYetkisi = (FINANS_ROLLERI as readonly string[]).includes(rol);
  const yonetici = rol === "isletme_admin";
  const dersYetkisi = musteriYetkisi || rol === "antrenor";

  if (!dersYetkisi && !finansYetkisi) {
    return (
      <>
        <PageHeader title="Panel" description="Fitness Asistanı yönetim paneli" icon={LayoutDashboard} />
        <EmptyState icon={LayoutDashboard} title="Henüz görüntülenecek bir ekran yok" description="Rolünüze tanımlı modüller eklendikçe burada görünür." />
      </>
    );
  }

  const supabase = await createClient();
  const bugun = bugunIstanbulTarihi();
  const hafta = gunEkle(bugun, 7);
  const donem = gunDonemi(bugun);
  const simdiIso = new Date().toISOString();

  const [girisSonuc, aktifSonuc, yaklasanSonuc, kasaSonuc, alacakSonuc, dersSonuc, alanSonuc, antrenorSonuc, izinliSonuc, bekleyenIzinSonuc, isletmeSonuc, onKayitSonuc] = await Promise.all([
    musteriYetkisi
      ? supabase.from("giris_kaydi").select("id", { count: "exact", head: true }).eq("giris_tarihi", bugun).eq("sonuc", "kabul").eq("iptal", false)
      : Promise.resolve(null),
    finansYetkisi ? supabase.from("uyelik_gorunum").select("id", { count: "exact", head: true }).eq("gecerli_durum", "aktif") : Promise.resolve(null),
    finansYetkisi
      ? supabase
          .from("uyelik_gorunum")
          .select("id, musteri_id, paket_adi, tur, baslangic_tarihi, bitis_tarihi, kalan_hak, toplam_hak, gecerli_durum")
          .eq("gecerli_durum", "aktif")
          .or(`kalan_hak.lte.2,bitis_tarihi.lte.${hafta}`)
          .order("bitis_tarihi", { ascending: true, nullsFirst: false })
          .limit(10)
      : Promise.resolve(null),
    finansYetkisi ? supabase.rpc("kasa_ozet", { p_baslangic: donem.baslangicTarih, p_bitis: donem.bitisTarih }) : Promise.resolve(null),
    finansYetkisi ? supabase.from("cari_alacak").select("borc_kurus") : Promise.resolve(null),
    // Dersler RLS ile süzülür: yönetici/resepsiyon hepsini, antrenör yalnız kendi derslerini görür.
    dersYetkisi
      ? supabase.from("ders_seansi").select("id, musteri_id, antrenor_id, alan_id, baslangic, bitis, durum").gte("baslangic", donem.baslangic).lt("baslangic", donem.bitis).order("baslangic")
      : Promise.resolve(null),
    dersYetkisi ? supabase.from("alan_studyo").select("id, ad, aktif").order("ad") : Promise.resolve(null),
    musteriYetkisi ? supabase.from("kullanici").select("id, ad_soyad").eq("rol", "antrenor").eq("aktif", true).order("ad_soyad") : Promise.resolve(null),
    yonetici ? supabase.from("izin_talebi").select("kullanici_id").eq("durum", "onaylandi").lte("baslangic_tarihi", bugun).gte("bitis_tarihi", bugun) : Promise.resolve(null),
    yonetici ? supabase.from("izin_talebi").select("id", { count: "exact", head: true }).eq("durum", "beklemede") : Promise.resolve(null),
    supabase.from("isletme").select("ad").eq("id", kullanici.isletme_id).maybeSingle<{ ad: string }>(),
    musteriYetkisi ? supabase.from("musteri_on_kayit").select("id, ad_soyad, telefon, created_at", { count: "exact" }).eq("durum", "beklemede").order("created_at").limit(5) : Promise.resolve(null),
  ]);
  const onKayitlar = (onKayitSonuc?.data ?? []) as { id: string; ad_soyad: string; telefon: string; created_at: string }[];
  const onKayitSayisi = onKayitSonuc?.count ?? 0;

  const yaklasan = (yaklasanSonuc?.data ?? []) as YaklasanSatiri[];
  const dersler = (dersSonuc?.data ?? []) as DersSatiri[];
  const musteriIdleri = [...new Set([...yaklasan.map((u) => u.musteri_id), ...dersler.map((d) => d.musteri_id)])];

  const adHaritasi = new Map<string, string>();
  const telefonHaritasi = new Map<string, string>();
  const bakiyeHaritasi = new Map<string, number>();
  if (musteriIdleri.length) {
    const yaklasanIdleri = yaklasan.map((u) => u.musteri_id);
    const [{ data: adlar }, { data: telefonlar }, { data: bakiyeler }] = await Promise.all([
      supabase.from("musteri_ozet").select("id, ad_soyad").in("id", musteriIdleri),
      musteriYetkisi && yaklasanIdleri.length ? supabase.from("musteri").select("id, telefon").in("id", yaklasanIdleri) : Promise.resolve({ data: [] }),
      finansYetkisi && yaklasanIdleri.length ? supabase.from("musteri_bakiye").select("musteri_id, bakiye_kurus").in("musteri_id", yaklasanIdleri) : Promise.resolve({ data: [] }),
    ]);
    for (const m of (adlar ?? []) as { id: string; ad_soyad: string }[]) adHaritasi.set(m.id, m.ad_soyad);
    for (const m of (telefonlar ?? []) as { id: string; telefon: string }[]) telefonHaritasi.set(m.id, m.telefon);
    for (const b of (bakiyeler ?? []) as { musteri_id: string; bakiye_kurus: number }[]) bakiyeHaritasi.set(b.musteri_id, Number(b.bakiye_kurus));
  }

  const antrenorler = (antrenorSonuc?.data ?? []) as { id: string; ad_soyad: string }[];
  const antrenorAdi = new Map(antrenorler.map((a) => [a.id, a.ad_soyad]));
  if (rol === "antrenor") antrenorAdi.set(oturum.authUser.id, gorunenAd);
  const izinliler = new Set(((izinliSonuc?.data ?? []) as { kullanici_id: string }[]).map((i) => i.kullanici_id));

  const tumAlanlar = (alanSonuc?.data ?? []) as { id: string; ad: string; aktif: boolean }[];
  const kullanilanAlanlar = new Set(dersler.map((d) => d.alan_id));
  const alanlar = tumAlanlar.filter((a) => a.aktif || kullanilanAlanlar.has(a.id));

  const cizelgeDersleri: CizelgeDersi[] = dersler.map((d) => ({
    id: d.id,
    musteri_adi: adHaritasi.get(d.musteri_id) ?? "Müşteri",
    antrenor_adi: antrenorAdi.get(d.antrenor_id) ?? "Antrenör",
    alan_id: d.alan_id,
    baslangic: d.baslangic,
    bitis: d.bitis,
    durum: d.durum,
  }));

  const planliToplam = dersler.filter((d) => d.durum !== "iptal").length;
  const tamamlanan = dersler.filter((d) => d.durum === "tamamlandi").length;
  const netTahsilat = ((kasaSonuc?.data ?? []) as { net_kurus: number }[]).reduce((t, k) => t + Number(k.net_kurus), 0);
  const toplamAlacak = ((alacakSonuc?.data ?? []) as { borc_kurus: number }[]).reduce((t, a) => t + Number(a.borc_kurus), 0);
  const girisSayisi = girisSonuc?.count ?? 0;
  const bekleyenIzin = bekleyenIzinSonuc?.count ?? 0;
  const isletmeAdi = isletmeSonuc?.data?.ad ?? null;

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-baslik-lg">İyi çalışmalar, {gorunenAd}</h1>
        <p className="text-muted-foreground">
          {donem.etiket}
          {isletmeAdi && <> · {isletmeAdi}</>}
          {dersYetkisi && <> · Bugün {planliToplam} ders planlandı.</>}
        </p>
      </header>

      <section aria-label="Operasyonel metrikler" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {dersYetkisi && (
          <KpiCard
            vurgu
            label="Bugünkü dersler"
            value={
              <>
                {tamamlanan} <span className="text-base font-medium">/ {planliToplam}</span>
              </>
            }
            icon={CalendarDays}
          />
        )}
        {musteriYetkisi && (
          <KpiCard
            label="Bugünkü giriş"
            value={
              <>
                {girisSayisi} <span className="text-base font-medium text-muted-foreground">kişi</span>
              </>
            }
            icon={Users}
          />
        )}
        {finansYetkisi && (
          <KpiCard
            label="Aktif üyelik"
            value={
              <>
                {aktifSonuc?.count ?? 0} <span className="text-base font-medium text-muted-foreground">üye</span>
              </>
            }
            icon={Users}
          />
        )}
        {musteriYetkisi && <KpiCard label="Bekleyen ön kayıtlar" value={onKayitSayisi} icon={Inbox} iconTone={onKayitSayisi > 0 ? "amber" : "neutral"} />}
        {yonetici && <KpiCard label="Bekleyen izin talepleri" value={bekleyenIzin} icon={CalendarOff} iconTone={bekleyenIzin > 0 ? "amber" : "neutral"} />}
        {finansYetkisi && <KpiCard label="Bugün net tahsilat" value={kurusTLyazi(netTahsilat)} icon={Wallet} />}
        {finansYetkisi && <KpiCard label="Açık alacak" value={kurusTLyazi(toplamAlacak)} icon={TriangleAlert} iconTone="amber" />}
      </section>

      {dersYetkisi && (
        <section aria-label="Günün çizelgesi ve antrenör durumları" className={musteriYetkisi ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]" : "grid gap-6"}>
          <Card className="gap-0 overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
              <div className="flex items-center gap-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                  <Activity className="size-5 text-primary" strokeWidth={1.5} aria-hidden />
                  Günün Çizelgesi
                </h2>
                <Link href={`/panel/dersler?gun=${bugun}&gorunum=liste`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-sm font-medium transition-colors hover:bg-surface-3">
                  <List className="size-4" strokeWidth={1.5} aria-hidden /> Liste
                </Link>
              </div>
              <CanliSaat />
            </div>
            <div className="p-4">
              <GunCizelgesi dersler={cizelgeDersleri} alanlar={alanlar} bugunMu ayrintiHref={(id) => `/panel/dersler?gun=${bugun}&gorunum=liste#ders-${id}`} />
            </div>
          </Card>

          {musteriYetkisi && (
            <div className="flex flex-col gap-6">
            <Card className="content-start gap-3 p-5">
              <h2 className="text-lg font-semibold tracking-tight">Antrenör Durumları</h2>
              {antrenorler.length === 0 ? (
                <EmptyState compact icon={Users} title="Henüz antrenör yok." />
              ) : (
                <ul className="flex flex-col gap-2">
                  {antrenorler.map((a) => {
                    const d = ANTRENOR_DURUMU[antrenorDurumu(a.id, dersler, izinliler, simdiIso)];
                    return (
                      <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2">
                        <span className="flex min-w-0 items-center gap-3">
                          <Avatar name={a.ad_soyad} size="sm" />
                          <span className="truncate text-sm font-medium">{a.ad_soyad}</span>
                        </span>
                        <StatusBadge tone={d.ton}>{d.etiket}</StatusBadge>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!yonetici && <p className="text-xs text-muted-foreground">İzin bilgisi yalnız işletme yöneticisine görünür.</p>}
            </Card>

            {onKayitlar.length > 0 && (
              <Card className="content-start gap-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">Bekleyen Ön Kayıtlar</h2>
                  <StatusBadge tone="amber">{onKayitSayisi}</StatusBadge>
                </div>
                <ul className="flex flex-col gap-2">
                  {onKayitlar.map((k) => (
                    <li key={k.id} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2">
                      <Avatar name={k.ad_soyad} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{k.ad_soyad}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">{telefonGoster(k.telefon)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href="/panel/musteriler/on-kayitlar" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Ön kayıtları incele
                </Link>
              </Card>
            )}
            </div>
          )}
        </section>
      )}

      {musteriYetkisi && (
        <section aria-label="Hızlı işlemler" className="flex flex-col gap-3">
          <h2 className="text-etiket text-muted-foreground">Hızlı resepsiyon işlemleri</h2>
          <div className="grid grid-cols-2 gap-3 sm:max-w-2xl sm:grid-cols-4">
            {[
              { href: "/panel/dersler/yeni", etiket: "Yeni Ders", ikon: CalendarPlus },
              { href: "/panel/kasa/hizli-tahsilat", etiket: "Hızlı Tahsilat", ikon: Banknote },
              { href: "/panel/musteriler/yeni", etiket: "Yeni Kayıt", ikon: UserPlus },
              { href: "/panel/check-in", etiket: "Check-in", ikon: ScanLine },
            ].map(({ href, etiket, ikon: Ikon }) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-3 text-center text-sm font-semibold transition-colors hover:border-primary/60"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/14 text-primary">
                  <Ikon className="size-5" strokeWidth={1.5} aria-hidden />
                </span>
                {etiket}
              </Link>
            ))}
          </div>
        </section>
      )}

      {finansYetkisi && (
        <section aria-label="Yenileme bekleyenler" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <BellRing className="size-5 text-primary" strokeWidth={1.5} aria-hidden />
              Yenileme bekleyenler
            </h2>
            {yaklasan.length > 0 && <StatusBadge tone="amber">{yaklasan.length} üyelik</StatusBadge>}
          </div>
          <p className="text-sm text-muted-foreground">Kalan hakkı 2 veya daha az, ya da 7 gün içinde bitecek aktif üyelikler.</p>

          {yaklasan.length === 0 ? (
            <EmptyState compact icon={CalendarClock} title="Yenileme bekleyen üyelik yok." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {yaklasan.map((u) => {
                const musteriAdi = adHaritasi.get(u.musteri_id) ?? "Müşteri";
                const telefon = telefonHaritasi.get(u.musteri_id);
                const bakiye = bakiyeHaritasi.get(u.musteri_id) ?? 0;
                const gun = kalanGun(u, bugun);
                const hakUyari = u.kalan_hak !== null && u.kalan_hak <= 2;
                return (
                  <Card key={u.id} className="gap-4">
                    <div className="flex items-start justify-between gap-3 px-(--card-spacing)">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={musteriAdi} />
                        <div className="min-w-0">
                          <p className="truncate font-bold tracking-tight">{musteriAdi}</p>
                          <p className="truncate text-sm text-muted-foreground">{u.paket_adi}</p>
                        </div>
                      </div>
                      {hakUyari ? <StatusBadge tone="amber">{u.kalan_hak} hak kaldı</StatusBadge> : <StatusBadge tone="amber">{gun === 0 ? "Bugün bitiyor" : `${gun} gün kaldı`}</StatusBadge>}
                    </div>
                    <div className="mx-(--card-spacing) flex items-center justify-between gap-3 rounded-lg bg-surface p-3 text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <CalendarClock className="size-4" strokeWidth={1.5} aria-hidden />
                        Bitiş: <span className="font-semibold text-foreground tabular-nums">{u.bitis_tarihi ? gunYazi(u.bitis_tarihi) : "Süresiz"}</span>
                      </span>
                      {bakiye < 0 ? (
                        <span className="font-semibold text-destructive tabular-nums">{kurusTLyazi(-bakiye)} borç</span>
                      ) : (
                        <span className="text-muted-foreground tabular-nums">Bakiye {kurusTLyazi(bakiye)}</span>
                      )}
                    </div>
                    {musteriYetkisi && (
                      <div className="grid grid-cols-2 gap-2 px-(--card-spacing)">
                        {telefon ? (
                          <a href={`tel:${telefon}`} className={buttonVariants({ variant: "outline" })}>
                            <Phone aria-hidden /> Ara
                          </a>
                        ) : (
                          <span />
                        )}
                        <Link href={`/panel/musteriler/${u.musteri_id}?sekme=uyelikler#uyelik-sat`} className={buttonVariants()}>
                          <RefreshCw aria-hidden /> Yenile
                        </Link>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}
    </>
  );
}

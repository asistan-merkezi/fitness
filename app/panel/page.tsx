import Link from "next/link";
import { CalendarDays, CalendarPlus, LayoutDashboard, Link2Off, UserPlus, Users } from "lucide-react";
import { CanliCizelge } from "@/components/panel/canli-cizelge";
import type { CizelgeDersi } from "@/components/panel/gun-cizelgesi";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { bugunIstanbulTarihi, gunYazi } from "@/lib/datetime";
import { gunDonemi } from "@/lib/donem";
import { ANTRENOR_DURUMU, antrenorDurumu } from "@/lib/panel/antrenor-durumu";
import { FINANS_ROLLERI, MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { telefonGoster } from "@/lib/utils";
import type { DersDurumu } from "@/types/veritabani";

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
  const donem = gunDonemi(bugun);
  const simdiIso = new Date().toISOString();

  const [girisSonuc, dersSonuc, alanSonuc, antrenorSonuc, izinliSonuc, isletmeSonuc, onKayitSonuc, dersTalebiSonuc] = await Promise.all([
    musteriYetkisi
      ? supabase.from("giris_kaydi").select("id", { count: "exact", head: true }).eq("giris_tarihi", bugun).eq("sonuc", "kabul").eq("iptal", false)
      : Promise.resolve(null),
    // Dersler RLS ile süzülür: yönetici/resepsiyon hepsini, antrenör yalnız kendi derslerini görür.
    dersYetkisi
      ? supabase.from("ders_seansi").select("id, musteri_id, antrenor_id, alan_id, baslangic, bitis, durum").gte("baslangic", donem.baslangic).lt("baslangic", donem.bitis).order("baslangic")
      : Promise.resolve(null),
    dersYetkisi ? supabase.from("alan_studyo").select("id, ad, aktif").order("ad") : Promise.resolve(null),
    musteriYetkisi ? supabase.from("kullanici").select("id, ad_soyad").eq("rol", "antrenor").eq("aktif", true).order("ad_soyad") : Promise.resolve(null),
    yonetici ? supabase.from("izin_talebi").select("kullanici_id").eq("durum", "onaylandi").lte("baslangic_tarihi", bugun).gte("bitis_tarihi", bugun) : Promise.resolve(null),
    supabase.from("isletme").select("ad").eq("id", kullanici.isletme_id).maybeSingle<{ ad: string }>(),
    musteriYetkisi ? supabase.from("musteri_on_kayit").select("id, ad_soyad, telefon, created_at", { count: "exact" }).eq("durum", "beklemede").order("created_at").limit(5) : Promise.resolve(null),
    musteriYetkisi
      ? supabase.from("musteri_ders_talebi").select("id, musteri_id, tercih_tarih, tercih_saat, created_at", { count: "exact" }).eq("durum", "bekliyor").order("created_at").limit(5)
      : Promise.resolve(null),
  ]);
  const dersTalepleri = (dersTalebiSonuc?.data ?? []) as { id: string; musteri_id: string; tercih_tarih: string; tercih_saat: string | null; created_at: string }[];
  const dersTalebiSayisi = dersTalebiSonuc?.count ?? 0;
  const onKayitlar = (onKayitSonuc?.data ?? []) as { id: string; ad_soyad: string; telefon: string; created_at: string }[];
  const onKayitSayisi = onKayitSonuc?.count ?? 0;

  const dersler = (dersSonuc?.data ?? []) as DersSatiri[];
  const musteriIdleri = [...new Set([...dersler.map((d) => d.musteri_id), ...dersTalepleri.map((t) => t.musteri_id)])];

  const adHaritasi = new Map<string, string>();
  if (musteriIdleri.length) {
    const { data: adlar } = await supabase.from("musteri_ozet").select("id, ad_soyad").in("id", musteriIdleri);
    for (const m of (adlar ?? []) as { id: string; ad_soyad: string }[]) adHaritasi.set(m.id, m.ad_soyad);
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
  const girisSayisi = girisSonuc?.count ?? 0;
  const isletmeAdi = isletmeSonuc?.data?.ad ?? null;

  return (
    <>
      <PageHeader
        title={`İyi çalışmalar, ${gorunenAd}`}
        description={`${donem.etiket}${isletmeAdi ? ` · ${isletmeAdi}` : ""}${dersYetkisi ? ` · Bugün ${planliToplam} ders planlandı.` : ""}`}
      />

      <section aria-label="Operasyonel metrikler" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      </section>

      {dersYetkisi && (
        <section aria-label="Günün çizelgesi ve antrenör durumları" className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className={musteriYetkisi ? "lg:col-span-2" : "lg:col-span-3"}>
            <CanliCizelge dersler={cizelgeDersleri} alanlar={alanlar} bugun={bugun} yeniDersHref={musteriYetkisi ? "/panel/dersler?yeni=1" : undefined} />
          </div>

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

              {dersTalepleri.length > 0 && (
                <Card className="content-start gap-3 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold tracking-tight">Bekleyen Ders Talepleri</h2>
                    <StatusBadge tone="amber">{dersTalebiSayisi}</StatusBadge>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {dersTalepleri.map((t) => (
                      <li key={t.id}>
                        <Link href={`/panel/musteriler/${t.musteri_id}?sekme=talepler`} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2 transition-colors hover:bg-surface-2">
                          <Avatar name={adHaritasi.get(t.musteri_id) ?? "Müşteri"} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{adHaritasi.get(t.musteri_id) ?? "Müşteri"}</span>
                            <span className="block text-xs text-muted-foreground tabular-nums">
                              Tercih: {gunYazi(t.tercih_tarih)}
                              {t.tercih_saat ? ` · ${t.tercih_saat.slice(0, 5)}` : ""}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

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
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            {[
              { href: "/panel/dersler?yeni=1", etiket: "Yeni Ders", ikon: CalendarPlus },
              { href: "/panel/musteriler/yeni", etiket: "Yeni Kayıt", ikon: UserPlus },
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
    </>
  );
}

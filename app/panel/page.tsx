import Link from "next/link";
import { BellRing, CalendarClock, LayoutDashboard, Link2Off, Phone, RefreshCw, ScanLine, TriangleAlert, UserPlus, Users, Wallet, Banknote } from "lucide-react";
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
import { FINANS_ROLLERI, MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { kalanGun } from "@/lib/panel/uyelik-ozeti";
import { createClient } from "@/lib/supabase/server";
import type { UyelikGorunumSatiri } from "@/types/veritabani";

type YaklasanSatiri = Pick<UyelikGorunumSatiri, "id" | "musteri_id" | "paket_adi" | "tur" | "bitis_tarihi" | "kalan_hak" | "baslangic_tarihi" | "toplam_hak" | "gecerli_durum">;

export default async function PanelAnaSayfa() {
  const oturum = await gecerliKullanici();
  const kullanici = oturum?.kullanici ?? null;

  if (!kullanici?.isletme_id || !kullanici.rol) {
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
  const musteriYetkisi = (MUSTERI_ROLLERI as readonly string[]).includes(rol);
  const finansYetkisi = (FINANS_ROLLERI as readonly string[]).includes(rol);

  if (!musteriYetkisi && !finansYetkisi) {
    return (
      <>
        <PageHeader title="Panel" description="Fitness Asistanı yönetim paneli" icon={LayoutDashboard} />
        <EmptyState icon={LayoutDashboard} title="Antrenör ekranları yakında" description="Ders, müşteri ölçümü ve program modülleri sonraki aşamalarda eklenecek." />
      </>
    );
  }

  const supabase = await createClient();
  const bugun = bugunIstanbulTarihi();
  const hafta = gunEkle(bugun, 7);
  const donem = gunDonemi(bugun);

  const [girisSonuc, aktifSonuc, yaklasanSonuc, kasaSonuc, alacakSonuc] = await Promise.all([
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
  ]);

  const yaklasan = (yaklasanSonuc?.data ?? []) as YaklasanSatiri[];
  const musteriIdleri = [...new Set(yaklasan.map((u) => u.musteri_id))];

  const adHaritasi = new Map<string, string>();
  const telefonHaritasi = new Map<string, string>();
  const bakiyeHaritasi = new Map<string, number>();
  if (musteriIdleri.length) {
    const [{ data: adlar }, { data: telefonlar }, { data: bakiyeler }] = await Promise.all([
      supabase.from("musteri_ozet").select("id, ad_soyad").in("id", musteriIdleri),
      musteriYetkisi ? supabase.from("musteri").select("id, telefon").in("id", musteriIdleri) : Promise.resolve({ data: [] }),
      supabase.from("musteri_bakiye").select("musteri_id, bakiye_kurus").in("musteri_id", musteriIdleri),
    ]);
    for (const m of (adlar ?? []) as { id: string; ad_soyad: string }[]) adHaritasi.set(m.id, m.ad_soyad);
    for (const m of (telefonlar ?? []) as { id: string; telefon: string }[]) telefonHaritasi.set(m.id, m.telefon);
    for (const b of (bakiyeler ?? []) as { musteri_id: string; bakiye_kurus: number }[]) bakiyeHaritasi.set(b.musteri_id, Number(b.bakiye_kurus));
  }

  const netTahsilat = ((kasaSonuc?.data ?? []) as { net_kurus: number }[]).reduce((t, k) => t + Number(k.net_kurus), 0);
  const toplamAlacak = ((alacakSonuc?.data ?? []) as { borc_kurus: number }[]).reduce((t, a) => t + Number(a.borc_kurus), 0);
  const girisSayisi = girisSonuc?.count ?? 0;

  return (
    <>
      <PageHeader title="Panel" description={`Bugün · ${gunYazi(bugun)}`} icon={LayoutDashboard} />

      <section aria-label="Operasyonel metrikler" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {musteriYetkisi ? <KpiCard vurgu label="Bugünkü giriş" value={<>{girisSayisi} <span className="text-base font-medium">kişi</span></>} icon={Users} /> : null}
        {finansYetkisi && <KpiCard label="Aktif üyelik" value={<>{aktifSonuc?.count ?? 0} <span className="text-base font-medium text-muted-foreground">üye</span></>} icon={Users} />}
        {finansYetkisi && <KpiCard label="Bugün net tahsilat" value={kurusTLyazi(netTahsilat)} icon={Wallet} />}
        {finansYetkisi && <KpiCard label="Açık alacak" value={kurusTLyazi(toplamAlacak)} icon={TriangleAlert} iconTone="amber" />}
      </section>

      {musteriYetkisi && (
        <section aria-label="Hızlı işlemler" className="flex flex-col gap-3">
          <h2 className="text-etiket text-muted-foreground">Hızlı resepsiyon işlemleri</h2>
          <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
            {[
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
            <div className="grid gap-4 lg:grid-cols-2">
              {yaklasan.map((u) => {
                const ad = adHaritasi.get(u.musteri_id) ?? "Müşteri";
                const telefon = telefonHaritasi.get(u.musteri_id);
                const bakiye = bakiyeHaritasi.get(u.musteri_id) ?? 0;
                const gun = kalanGun(u, bugun);
                const hakUyari = u.kalan_hak !== null && u.kalan_hak <= 2;
                return (
                  <Card key={u.id} className="gap-4">
                    <div className="flex items-start justify-between gap-3 px-(--card-spacing)">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={ad} />
                        <div className="min-w-0">
                          <p className="truncate font-bold tracking-tight">{ad}</p>
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

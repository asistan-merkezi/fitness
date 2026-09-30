import type { Metadata } from "next";
import Link from "next/link";
import { ScanLine, Search, TriangleAlert, UserPlus, Ban, History } from "lucide-react";
import { EylemFormu } from "@/components/panel/eylem-formu";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, formatTime, gunYazi } from "@/lib/datetime";
import { GIRIS_KAYNAKLARI, RED_NEDENLERI, UYELIK_DURUMU } from "@/lib/panel/etiketler";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { birincilUyelik, bitiyorUyarisi, kalanGun } from "@/lib/panel/uyelik-ozeti";
import { createClient } from "@/lib/supabase/server";
import { cn, telefonGoster } from "@/lib/utils";
import type { GirisKaydiSatiri, MusteriSatiri, UyelikGorunumSatiri } from "@/types/veritabani";
import { checkInIptal, checkInYap } from "./actions";

export const metadata: Metadata = { title: "Check-in" };

const NOKTA_RENGI = { emerald: "bg-emerald-500", sky: "bg-sky-500", amber: "bg-amber-500", slate: "bg-slate-500", rose: "bg-rose-500", teal: "bg-emerald-500", indigo: "bg-sky-500", primary: "bg-primary" } as const;

export default async function CheckInSayfasi({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await sayfaYetkisiIste(MUSTERI_ROLLERI);
  const { q } = await searchParams;
  const sorgu = (q ?? "").trim().slice(0, 100);

  const supabase = await createClient();
  const bugun = bugunIstanbulTarihi();

  const { data: bulunanlar } = sorgu ? await supabase.rpc("musteri_ara", { p_sorgu: sorgu, p_limit: 10 }) : { data: [] };
  const adaylar = (bulunanlar ?? []) as MusteriSatiri[];

  // Adayların üyelik durumları (resepsiyon, girişten önce görsün).
  const uyelikler = adaylar.length
    ? (((await supabase.from("uyelik_gorunum").select("*").in("musteri_id", adaylar.map((m) => m.id))).data ?? []) as UyelikGorunumSatiri[])
    : [];

  const { data: bugunku } = await supabase
    .from("giris_kaydi")
    .select("id, musteri_id, uyelik_id, sonuc, red_nedeni, kaynak, zaman, iptal, hak_dusuldu")
    .eq("giris_tarihi", bugun)
    .order("zaman", { ascending: false })
    .limit(100);
  const girisler = (bugunku ?? []) as GirisKaydiSatiri[];

  const adHaritasi = new Map<string, { ad_soyad: string; uye_no: number }>();
  const idler = [...new Set(girisler.map((g) => g.musteri_id))];
  if (idler.length) {
    const { data: adlar } = await supabase.from("musteri_ozet").select("id, ad_soyad, uye_no").in("id", idler);
    for (const a of (adlar ?? []) as { id: string; ad_soyad: string; uye_no: number }[]) adHaritasi.set(a.id, a);
  }
  const kabulSayisi = girisler.filter((g) => g.sonuc === "kabul" && !g.iptal).length;

  return (
    <>
      <PageHeader
        title="Check-in"
        description="Üyeyi arayın, girişi kaydedin. Seans bazlı üyelikte günde bir hak düşer."
        icon={ScanLine}
        actions={
          <Link href="/panel/musteriler/yeni" className={buttonVariants({ variant: "outline" })}>
            <UserPlus aria-hidden />
            Hızlı Kayıt
          </Link>
        }
      />

      <form action="/panel/check-in" method="get" className="flex gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <Input name="q" defaultValue={sorgu} placeholder="Ad, telefon veya üye no..." aria-label="Müşteri ara" autoComplete="off" autoFocus className="h-12 pl-10 text-base" />
        </div>
        <Button type="submit" size="lg">
          Ara
        </Button>
      </form>

      {sorgu && (
        <section className="flex flex-col gap-3" aria-label="Arama sonuçları">
          <h2 className="text-etiket text-muted-foreground">Arama sonuçları ({adaylar.length})</h2>
          {adaylar.length === 0 ? (
            <EmptyState icon={Search} title="Eşleşen müşteri yok" description="Farklı bir ad, telefon veya üye numarası deneyin." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {adaylar.map((m) => {
                const buMusterinin = uyelikler.filter((u) => u.musteri_id === m.id);
                const birincil = birincilUyelik(buMusterinin);
                const durum = !m.aktif ? { etiket: "Pasif", ton: "slate" as const } : birincil ? UYELIK_DURUMU[birincil.gecerli_durum] : { etiket: "Üyelik yok", ton: "slate" as const };
                const uyari = birincil ? bitiyorUyarisi(birincil, bugun) : null;
                const gun = birincil ? kalanGun(birincil, bugun) : null;
                const girisEngeli = !m.aktif ? RED_NEDENLERI.musteri_pasif : !birincil ? RED_NEDENLERI.uyelik_yok : birincil.gecerli_durum === "aktif" ? null : birincil.gecerli_durum === "dondurulmus" ? RED_NEDENLERI.donduruldu : birincil.gecerli_durum === "beklemede" ? RED_NEDENLERI.baslamadi : birincil.tur === "seans" && (birincil.kalan_hak ?? 0) <= 0 ? RED_NEDENLERI.hak_bitti : RED_NEDENLERI.suresi_doldu;

                return (
                  <Card key={m.id} className="gap-4">
                    <div className="flex items-start gap-4 px-(--card-spacing)">
                      <div className="relative shrink-0">
                        <Avatar name={m.ad_soyad} className="size-14 text-base" />
                        <span className={cn("absolute -right-0.5 -bottom-0.5 size-4 rounded-full border-2 border-card", NOKTA_RENGI[durum.ton])} aria-hidden />
                      </div>
                      <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/panel/musteriler/${m.id}`} className="block truncate text-lg font-bold tracking-tight hover:underline">
                            {m.ad_soyad}
                          </Link>
                          <p className="text-sm text-muted-foreground tabular-nums">
                            #{m.uye_no} · {telefonGoster(m.telefon)}
                          </p>
                        </div>
                        <StatusBadge tone={durum.ton}>{durum.etiket}</StatusBadge>
                      </div>
                    </div>

                    {birincil && (
                      <div className="mx-(--card-spacing) grid grid-cols-2 gap-3 rounded-lg bg-surface p-3">
                        <div>
                          <p className="text-etiket text-muted-foreground">Paket tipi</p>
                          <p className="mt-0.5 text-sm font-semibold">{birincil.paket_adi}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-etiket text-muted-foreground">{birincil.tur === "seans" ? "Kalan hak" : "Kalan süre"}</p>
                          <p className="mt-0.5 text-sm font-bold text-primary tabular-nums">
                            {birincil.tur === "seans" ? `${birincil.kalan_hak ?? 0} Seans` : gun === null ? "Süresiz" : gun < 0 ? "Süresi doldu" : `${gun} Gün Kaldı`}
                          </p>
                        </div>
                        {birincil.bitis_tarihi && (
                          <p className="col-span-2 text-xs text-muted-foreground">
                            Bitiş tarihi: <span className="font-semibold text-foreground tabular-nums">{gunYazi(birincil.bitis_tarihi)}</span>
                          </p>
                        )}
                      </div>
                    )}

                    {girisEngeli ? (
                      <div className="mx-(--card-spacing) flex items-start gap-2 rounded-lg border border-destructive-border bg-destructive-soft p-3 text-sm text-destructive">
                        <Ban className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                        <span>
                          <span className="block font-semibold">Giriş reddedilecek</span>
                          {girisEngeli}
                        </span>
                      </div>
                    ) : (
                      uyari && (
                        <div className="mx-(--card-spacing) flex items-start gap-2 rounded-lg border border-warning-border bg-warning-soft p-3 text-sm text-warning">
                          <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                          <span className="font-medium">{uyari}</span>
                        </div>
                      )
                    )}

                    <div className="flex items-start gap-2 px-(--card-spacing)">
                      <EylemFormu eylem={checkInYap} gonder="Giriş Yap" yukleniyor="Kaydediliyor..." boyut="lg" className="flex-1" gonderSinifi="w-full text-base font-bold uppercase tracking-wide">
                        <input type="hidden" name="musteri_id" value={m.id} />
                      </EylemFormu>
                      <Link href={`/panel/musteriler/${m.id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                        Detay
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3" aria-label="Bugünkü girişler">
        <div className="flex items-center gap-2">
          <History className="size-5 text-primary" strokeWidth={1.5} aria-hidden />
          <h2 className="text-lg font-semibold tracking-tight">Bugünkü girişler</h2>
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold tabular-nums">{kabulSayisi}</span>
        </div>
        <p className="text-sm text-muted-foreground">Hatalı girişi aynı gün iptal edebilirsiniz; seans hakkı geri verilir.</p>

        {girisler.length === 0 ? (
          <EmptyState compact title="Bugün henüz giriş kaydı yok." />
        ) : (
          <Card className="gap-0 py-0">
            <CardContent className="flex flex-col divide-y divide-border p-0">
              {girisler.map((g) => {
                const m = adHaritasi.get(g.musteri_id);
                return (
                  <div key={g.id} className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="w-12 text-sm font-semibold tabular-nums text-muted-foreground">{formatTime(g.zaman)}</span>
                      <Avatar name={m?.ad_soyad ?? "?"} size="sm" />
                      <div className="min-w-0">
                        <Link href={`/panel/musteriler/${g.musteri_id}`} className="block truncate text-sm font-semibold hover:underline">
                          {m?.ad_soyad ?? "Müşteri"}
                        </Link>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {m ? `#${m.uye_no} · ` : ""}
                          {GIRIS_KAYNAKLARI[g.kaynak] ?? g.kaynak}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {g.sonuc === "kabul" ? (
                        <StatusBadge tone={g.iptal ? "slate" : "emerald"}>{g.iptal ? "İptal edildi" : "Kabul"}</StatusBadge>
                      ) : (
                        <StatusBadge tone="rose">{RED_NEDENLERI[g.red_nedeni ?? ""] ?? "Red"}</StatusBadge>
                      )}
                      {g.sonuc === "kabul" && !g.iptal && (
                        <EylemFormu eylem={checkInIptal} gonder="Geri Al" yukleniyor="..." varyant="destructive" boyut="sm" onay="Bu giriş iptal edilsin mi?" className="gap-0">
                          <input type="hidden" name="giris_id" value={g.id} />
                        </EylemFormu>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}

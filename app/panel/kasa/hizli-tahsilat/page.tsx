import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Banknote, CheckCircle2, Search, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, formatTime } from "@/lib/datetime";
import { gunDonemi } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { YONTEM_ETIKETLERI } from "@/lib/panel/etiketler";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn, telefonGoster } from "@/lib/utils";
import type { HareketSatiri, MusteriSatiri } from "@/types/veritabani";
import { TusTakimi } from "./tus-takimi";

export const metadata: Metadata = { title: "Hızlı Tahsilat" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function HizliTahsilatSayfasi({ searchParams }: { searchParams: Promise<{ q?: string; uye?: string; ok?: string; tutar?: string }> }) {
  await sayfaYetkisiIste(MUSTERI_ROLLERI);
  const { q, uye, ok, tutar } = await searchParams;
  const sorgu = (q ?? "").trim().slice(0, 100);
  const bugun = bugunIstanbulTarihi();
  const donem = gunDonemi(bugun);

  const supabase = await createClient();

  const [kasaSonuc, sonHareketSonuc] = await Promise.all([
    supabase.rpc("kasa_ozet", { p_baslangic: donem.baslangicTarih, p_bitis: donem.bitisTarih }),
    supabase
      .from("musteri_bakiye_hareket")
      .select("id, musteri_id, tur, tutar_kurus, odeme_yontemi, islem_zamani, aciklama")
      .eq("tur", "odeme")
      .gte("islem_tarihi", donem.baslangicTarih)
      .lt("islem_tarihi", donem.bitisTarih)
      .order("islem_zamani", { ascending: false })
      .limit(5),
  ]);
  const kasa = (kasaSonuc.data ?? []) as { odeme_yontemi: string; net_kurus: number }[];
  const sonHareketler = (sonHareketSonuc.data ?? []) as (HareketSatiri & { musteri_id: string })[];
  const net = (y?: string) => kasa.filter((k) => !y || k.odeme_yontemi === y).reduce((t, k) => t + Number(k.net_kurus), 0);

  // Seçili müşteri
  let secili: MusteriSatiri | null = null;
  let borcKurus = 0;
  if (uye && UUID.test(uye)) {
    const { data } = await supabase.from("musteri").select("id, uye_no, ad_soyad, telefon, aktif").eq("id", uye).maybeSingle<MusteriSatiri>();
    secili = data ?? null;
    if (secili) {
      const { data: b } = await supabase.from("musteri_bakiye").select("bakiye_kurus").eq("musteri_id", secili.id).maybeSingle<{ bakiye_kurus: number }>();
      borcKurus = Math.max(0, -Number(b?.bakiye_kurus ?? 0));
    }
  }

  // Arama sonuçları
  const adaylar = !secili && sorgu ? (((await supabase.rpc("musteri_ara", { p_sorgu: sorgu, p_limit: 8 })).data ?? []) as MusteriSatiri[]) : [];

  // Az önce kaydedilen tahsilat özeti
  let basariMetni: string | null = null;
  if (ok && UUID.test(ok) && tutar && /^\d{1,12}$/.test(tutar)) {
    const { data } = await supabase.from("musteri_ozet").select("ad_soyad").eq("id", ok).maybeSingle<{ ad_soyad: string }>();
    basariMetni = `${kurusTLyazi(tutar)} tahsilat kaydedildi${data ? ` — ${data.ad_soyad}` : ""}.`;
  }

  const adHaritasi = new Map<string, string>();
  const idler = [...new Set(sonHareketler.map((h) => h.musteri_id))];
  if (idler.length) {
    const { data } = await supabase.from("musteri_ozet").select("id, ad_soyad").in("id", idler);
    for (const m of (data ?? []) as { id: string; ad_soyad: string }[]) adHaritasi.set(m.id, m.ad_soyad);
  }

  return (
    <>
      <Link href="/panel/kasa" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Kasa ve Cari
      </Link>
      <PageHeader title="Hızlı Tahsilat" description="Müşteriyi seçin, tutarı girin, yöntemi belirleyip kaydedin." icon={Banknote} />

      {basariMetni && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-success-border bg-success-soft px-4 py-3 text-sm font-semibold text-success">
          <CheckCircle2 className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
          {basariMetni}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <Card className="gap-4">
            <div className="flex items-center justify-between gap-2 px-(--card-spacing)">
              <span className="text-etiket flex items-center gap-2 text-primary">
                <span className="size-2 rounded-full bg-primary" aria-hidden /> Bugün kasa özeti
              </span>
            </div>
            <div className="flex items-end justify-between gap-2 px-(--card-spacing)">
              <span className="text-sm text-muted-foreground">Net günlük tahsilat</span>
              <span className="text-metric text-primary">{kurusTLyazi(net())}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 px-(--card-spacing)">
              {(["nakit", "kredi_karti", "havale"] as const).map((y) => (
                <div key={y} className="rounded-lg bg-surface p-3">
                  <p className="text-etiket text-muted-foreground">{YONTEM_ETIKETLERI[y]}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{kurusTLyazi(net(y))}</p>
                </div>
              ))}
            </div>
            {sonHareketler.length > 0 && (
              <div className="flex flex-col gap-2 px-(--card-spacing)">
                <p className="text-etiket text-muted-foreground">Son tahsilatlar</p>
                {sonHareketler.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{adHaritasi.get(h.musteri_id) ?? "Müşteri"}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatTime(h.islem_zamani)} · {h.odeme_yontemi ? YONTEM_ETIKETLERI[h.odeme_yontemi] : ""}
                      </p>
                    </div>
                    <span className="font-semibold text-success tabular-nums">+{kurusTLyazi(h.tutar_kurus)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="gap-4">
          <div className="px-(--card-spacing)">
            <p className="text-etiket text-muted-foreground">Üye / müşteri</p>
          </div>

          {secili ? (
            <>
              <div className="mx-(--card-spacing) flex items-center justify-between gap-3 rounded-lg bg-surface p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={secili.ad_soyad} />
                  <div className="min-w-0">
                    <p className="truncate font-bold tracking-tight">{secili.ad_soyad}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      #{secili.uye_no} · {telefonGoster(secili.telefon)}
                      {borcKurus > 0 && <span className="ml-2 font-semibold text-destructive">{kurusTLyazi(borcKurus)} borç</span>}
                    </p>
                  </div>
                </div>
                <Link href="/panel/kasa/hizli-tahsilat" className="shrink-0 text-sm font-semibold text-primary hover:underline">
                  Değiştir
                </Link>
              </div>
              <CardContent>
                <TusTakimi musteriId={secili.id} borcKurus={borcKurus} />
              </CardContent>
            </>
          ) : (
            <CardContent className="flex flex-col gap-4">
              <form action="/panel/kasa/hizli-tahsilat" method="get" className="flex gap-2" role="search">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                  <Input name="q" defaultValue={sorgu} placeholder="Ad, telefon veya üye no..." aria-label="Müşteri ara" autoComplete="off" className="pl-10" />
                </div>
                <Button type="submit" variant="outline">
                  Ara
                </Button>
              </form>
              {sorgu && adaylar.length === 0 ? (
                <EmptyState compact icon={UserRound} title="Eşleşen müşteri yok." />
              ) : adaylar.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {adaylar.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/panel/kasa/hizli-tahsilat?uye=${m.id}`}
                        className={cn("flex items-center gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/60")}
                      >
                        <Avatar name={m.ad_soyad} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{m.ad_soyad}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            #{m.uye_no} · {telefonGoster(m.telefon)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact icon={Search} title="Tahsilat için önce müşteriyi arayın." />
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </>
  );
}

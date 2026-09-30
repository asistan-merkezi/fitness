import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, Search, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, gunYazi } from "@/lib/datetime";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { telefonGoster } from "@/lib/utils";
import type { MusteriSatiri } from "@/types/veritabani";
import { DersFormu } from "../ders-formu";

export const metadata: Metadata = { title: "Yeni Ders" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GUN = /^\d{4}-\d{2}-\d{2}$/;

type DersPaketi = { id: string; paket_adi: string; kalan_hak: number | null; bitis_tarihi: string | null };

export default async function YeniDersSayfasi({ searchParams }: { searchParams: Promise<{ q?: string; uye?: string; gun?: string }> }) {
  await sayfaYetkisiIste(MUSTERI_ROLLERI);
  const { q, uye, gun } = await searchParams;
  const sorgu = (q ?? "").trim().slice(0, 100);
  const gunParam = gun && GUN.test(gun) && !Number.isNaN(Date.parse(gun)) ? gun : bugunIstanbulTarihi();

  const supabase = await createClient();

  let secili: MusteriSatiri | null = null;
  let paketler: DersPaketi[] = [];
  if (uye && UUID.test(uye)) {
    const { data } = await supabase.from("musteri").select("id, uye_no, ad_soyad, telefon, aktif").eq("id", uye).maybeSingle<MusteriSatiri>();
    secili = data ?? null;
    if (secili) {
      const { data: p } = await supabase
        .from("uyelik")
        .select("id, paket_adi, kalan_hak, bitis_tarihi")
        .eq("musteri_id", secili.id)
        .eq("kapsam", "ders")
        .eq("durum", "aktif")
        .gt("kalan_hak", 0)
        .order("bitis_tarihi", { ascending: true, nullsFirst: false });
      paketler = (p ?? []) as DersPaketi[];
    }
  }

  const adaylar = !secili && sorgu ? (((await supabase.rpc("musteri_ara", { p_sorgu: sorgu, p_limit: 8 })).data ?? []) as MusteriSatiri[]) : [];

  const [{ data: antrenorVeri }, { data: alanVeri }] = secili
    ? await Promise.all([
        supabase.from("kullanici").select("id, ad_soyad").eq("rol", "antrenor").eq("aktif", true).order("ad_soyad"),
        supabase.from("alan_studyo").select("id, ad").eq("aktif", true).order("ad"),
      ])
    : [{ data: [] }, { data: [] }];
  const antrenorler = (antrenorVeri ?? []) as { id: string; ad_soyad: string }[];
  const alanlar = (alanVeri ?? []) as { id: string; ad: string }[];

  return (
    <>
      <Link href={`/panel/dersler?gun=${gunParam}`} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Dersler
      </Link>
      <PageHeader title="Yeni Ders" description="Müşteriyi seçin, antrenör, alan ve saati belirleyin." icon={CalendarPlus} />

      <Card>
        <CardContent className="flex flex-col gap-4">
          {secili ? (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-surface p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={secili.ad_soyad} />
                  <div className="min-w-0">
                    <p className="truncate font-bold tracking-tight">{secili.ad_soyad}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      #{secili.uye_no} · {telefonGoster(secili.telefon)}
                    </p>
                  </div>
                </div>
                <Link href={`/panel/dersler/yeni?gun=${gunParam}`} className="shrink-0 text-sm font-semibold text-primary hover:underline">
                  Değiştir
                </Link>
              </div>

              {paketler.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Ders paketi:</span>
                  {paketler.map((p) => (
                    <StatusBadge key={p.id} tone="emerald">
                      {p.paket_adi} · {p.kalan_hak} hak{p.bitis_tarihi ? ` · ${gunYazi(p.bitis_tarihi)}` : ""}
                    </StatusBadge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Bu müşterinin ders paketi yok. Ders ücreti girerseniz, derse gelindiğinde cariye borç yazılır.</p>
              )}

              {antrenorler.length === 0 || alanlar.length === 0 ? (
                <EmptyState
                  compact
                  icon={UserRound}
                  title={antrenorler.length === 0 ? "Önce Ayarlar > Personel Tanımlama'dan bir antrenör ekleyin." : "Önce Yönetim > Alanlar ve Stüdyolar'dan bir alan ekleyin."}
                />
              ) : (
                <DersFormu musteriId={secili.id} antrenorler={antrenorler} alanlar={alanlar} varsayilanBaslangic={`${gunParam}T10:00`} />
              )}
            </>
          ) : (
            <>
              <form action="/panel/dersler/yeni" method="get" className="flex gap-2" role="search">
                <input type="hidden" name="gun" value={gunParam} />
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
                      <Link href={`/panel/dersler/yeni?gun=${gunParam}&uye=${m.id}`} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/60">
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
                <EmptyState compact icon={Search} title="Ders için önce müşteriyi arayın." />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

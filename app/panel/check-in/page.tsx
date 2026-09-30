import Link from "next/link";
import { DoorOpen, Search } from "lucide-react";
import { EylemFormu } from "@/components/panel/eylem-formu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, formatTime } from "@/lib/datetime";
import { GIRIS_KAYNAKLARI, RED_NEDENLERI, UYELIK_DURUMU } from "@/lib/panel/etiketler";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { telefonGoster } from "@/lib/utils";
import type { GirisKaydiSatiri, MusteriSatiri, UyelikGorunumSatiri } from "@/types/veritabani";
import { checkInIptal, checkInYap } from "./actions";

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
      <PageHeader title="Check-in" description="Müşteriyi arayıp girişini kaydedin. Seans bazlı üyelikte günde bir hak düşer." icon={DoorOpen} />

      <form action="/panel/check-in" method="get" className="flex max-w-xl gap-2" role="search">
        <Input name="q" defaultValue={sorgu} placeholder="Ad, telefon veya üye no..." aria-label="Müşteri ara" autoComplete="off" autoFocus />
        <Button type="submit">
          <Search className="size-4" aria-hidden />
          Ara
        </Button>
      </form>

      {sorgu && (
        <Card>
          <CardHeader>
            <CardTitle>Arama sonuçları</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {adaylar.length === 0 ? (
              <EmptyState compact title="Eşleşen müşteri yok." />
            ) : (
              adaylar.map((m) => {
                const buMusterinin = uyelikler.filter((u) => u.musteri_id === m.id);
                return (
                  <div key={m.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col gap-1.5">
                      <Link href={`/panel/musteriler/${m.id}`} className="font-medium hover:underline">
                        {m.ad_soyad}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        Üye no {m.uye_no} · {telefonGoster(m.telefon)}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {buMusterinin.length === 0 ? (
                          <StatusBadge tone="slate">Üyelik yok</StatusBadge>
                        ) : (
                          buMusterinin.map((u) => (
                            <StatusBadge key={u.id} tone={UYELIK_DURUMU[u.gecerli_durum].ton}>
                              {u.paket_adi}: {UYELIK_DURUMU[u.gecerli_durum].etiket}
                              {u.kalan_hak !== null && ` (${u.kalan_hak} hak)`}
                            </StatusBadge>
                          ))
                        )}
                        {!m.aktif && <StatusBadge tone="rose">Pasif müşteri</StatusBadge>}
                      </div>
                    </div>
                    <EylemFormu eylem={checkInYap} gonder="Giriş Yap" yukleniyor="Kaydediliyor..." className="sm:min-w-56">
                      <input type="hidden" name="musteri_id" value={m.id} />
                    </EylemFormu>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Bugünkü girişler</CardTitle>
          <CardDescription>{kabulSayisi} kabul edilen giriş. Hatalı girişi aynı gün iptal edebilirsiniz (seans hakkı geri verilir).</CardDescription>
        </CardHeader>
        <CardContent>
          {girisler.length === 0 ? (
            <EmptyState compact title="Bugün henüz giriş kaydı yok." />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {girisler.map((g) => {
                const m = adHaritasi.get(g.musteri_id);
                return (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums text-muted-foreground">{formatTime(g.zaman)}</span>
                      <Link href={`/panel/musteriler/${g.musteri_id}`} className="font-medium hover:underline">
                        {m?.ad_soyad ?? "Müşteri"}
                      </Link>
                      <span className="text-xs text-muted-foreground">{GIRIS_KAYNAKLARI[g.kaynak] ?? g.kaynak}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {g.sonuc === "kabul" ? (
                        <StatusBadge tone={g.iptal ? "slate" : "emerald"}>{g.iptal ? "İptal edildi" : "Kabul"}</StatusBadge>
                      ) : (
                        <StatusBadge tone="rose">Red: {RED_NEDENLERI[g.red_nedeni ?? ""] ?? "—"}</StatusBadge>
                      )}
                      {g.sonuc === "kabul" && !g.iptal && (
                        <EylemFormu eylem={checkInIptal} gonder="İptal" yukleniyor="..." varyant="outline" onay="Bu giriş iptal edilsin mi?" className="flex-row items-center gap-0">
                          <input type="hidden" name="giris_id" value={g.id} />
                        </EylemFormu>
                      )}
                    </div>
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

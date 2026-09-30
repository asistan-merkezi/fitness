import type { Metadata } from "next";
import { CalendarOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, gunYazi } from "@/lib/datetime";
import { IZIN_DURUMU, IZIN_TIPLERI } from "@/lib/panel/etiketler";
import { createClient } from "@/lib/supabase/server";
import { IzinIptalButonu, IzinTalepFormu } from "./izin-formlari";

export const metadata: Metadata = { title: "İzinlerim" };

type Talep = { id: string; tip: keyof typeof IZIN_TIPLERI; baslangic_tarihi: string; bitis_tarihi: string; gun_sayisi: number; gerekce: string | null; durum: keyof typeof IZIN_DURUMU; red_gerekce: string | null };

export default async function IzinlerimSayfasi() {
  const { authUser } = await sayfaYetkisiIste(["isletme_admin", "resepsiyon", "muhasebe", "antrenor"]);
  const bugun = bugunIstanbulTarihi();

  const supabase = await createClient();
  const [{ data: bakiyeVeri }, { data: talepVeri }] = await Promise.all([
    supabase.rpc("izin_bakiye"),
    supabase
      .from("izin_talebi")
      .select("id, tip, baslangic_tarihi, bitis_tarihi, gun_sayisi, gerekce, durum, red_gerekce")
      .eq("kullanici_id", authUser.id)
      .order("baslangic_tarihi", { ascending: false })
      .limit(50),
  ]);
  const bakiye = ((bakiyeVeri ?? []) as { hak_gun: number; kullanilan_gun: number; bekleyen_gun: number; kalan_gun: number }[])[0];
  const talepler = (talepVeri ?? []) as Talep[];

  return (
    <>
      <PageHeader title="İzinlerim" description={`${bugun.slice(0, 4)} yılı yıllık izin durumu ve taleplerim`} icon={CalendarOff} />

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
          <CardTitle>Yeni izin talebi</CardTitle>
          <CardDescription>Talebiniz işletme yöneticisine gider. Onaylanan izinlerde size ders atanmaz.</CardDescription>
        </CardHeader>
        <CardContent>
          <IzinTalepFormu bugun={bugun} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Taleplerim</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {talepler.length === 0 ? (
            <div className="p-5">
              <EmptyState compact icon={CalendarOff} title="Henüz izin talebiniz yok." />
            </div>
          ) : (
            talepler.map((t) => {
              const d = IZIN_DURUMU[t.durum];
              const iptalEdilebilir = t.durum === "beklemede" || (t.durum === "onaylandi" && t.baslangic_tarihi > bugun);
              return (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {IZIN_TIPLERI[t.tip]} · {t.gun_sayisi} iş günü
                    </p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {gunYazi(t.baslangic_tarihi)} – {gunYazi(t.bitis_tarihi)}
                    </p>
                    {t.gerekce && <p className="text-xs text-muted-foreground">{t.gerekce}</p>}
                    {t.durum === "reddedildi" && t.red_gerekce && <p className="text-xs font-medium text-destructive">Ret gerekçesi: {t.red_gerekce}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={d.ton}>{d.etiket}</StatusBadge>
                    {iptalEdilebilir && <IzinIptalButonu izinId={t.id} />}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </>
  );
}

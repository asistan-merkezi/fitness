import type { Metadata } from "next";
import Link from "next/link";
import { CalendarOff, ClipboardList } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, gunYazi } from "@/lib/datetime";
import { IZIN_DURUMU, IZIN_TIPLERI } from "@/lib/panel/etiketler";
import { IZIN_TAKIBI_YOLU, IZIN_TALEBI_YOLU, PUANTAJ_YOLU } from "@/lib/panel/izin-yollari";
import { ROL_ETIKETLERI, YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { KullaniciRolu } from "@/lib/auth/gecerli-kullanici";
import { PersonelSekmeleri } from "../../personel-sekmeleri";
import { IzinIptalButonu } from "../izin-talebi/izin-formlari";
import { DegerlendirmeFormu, ManuelIzinFormu } from "./formlar";

export const metadata: Metadata = { title: "İzin / Rapor Takibi" };

type Talep = { id: string; kullanici_id: string; tip: keyof typeof IZIN_TIPLERI; baslangic_tarihi: string; bitis_tarihi: string; gun_sayisi: number; gerekce: string | null; durum: keyof typeof IZIN_DURUMU; red_gerekce: string | null };

const DURUMLAR = ["beklemede", "onaylandi", "reddedildi", "iptal"] as const;

export default async function IzinTalepleriSayfasi({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  await sayfaYetkisiIste(YONETICI_ROLLERI);
  const { durum } = await searchParams;
  const filtre = DURUMLAR.find((d) => d === durum) ?? "beklemede";
  const bugun = bugunIstanbulTarihi();

  const supabase = await createClient();
  const [{ data: talepVeri }, { data: kisiVeri }, { count: bekleyenSayisi }] = await Promise.all([
    supabase.from("izin_talebi").select("id, kullanici_id, tip, baslangic_tarihi, bitis_tarihi, gun_sayisi, gerekce, durum, red_gerekce").eq("durum", filtre).order("baslangic_tarihi", { ascending: filtre === "beklemede" }).limit(100),
    supabase.from("kullanici").select("id, ad_soyad, rol").neq("rol", "super_admin").order("ad_soyad"),
    supabase.from("izin_talebi").select("id", { count: "exact", head: true }).eq("durum", "beklemede"),
  ]);
  const talepler = (talepVeri ?? []) as Talep[];
  const kisiler = (kisiVeri ?? []) as { id: string; ad_soyad: string; rol: KullaniciRolu }[];
  const kisiAdi = new Map(kisiler.map((k) => [k.id, k]));

  return (
    <>
      <PageHeader
        title="Personel"
        description={`İzin / Rapor Takibi · ${bekleyenSayisi ?? 0} talep onay bekliyor`}
        icon={CalendarOff}
        actions={
          <>
            <Link href={PUANTAJ_YOLU} className={buttonVariants({ variant: "outline" })}>
              <ClipboardList aria-hidden /> Puantaj Cetveli
            </Link>
            <Link href={IZIN_TALEBI_YOLU} className={buttonVariants({ variant: "outline" })}>
              <CalendarOff aria-hidden /> İzin Talebi
            </Link>
          </>
        }
      />
      <PersonelSekmeleri aktif="puantaj" />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Durum">
        {DURUMLAR.map((d) => (
          <Link
            key={d}
            href={`${IZIN_TAKIBI_YOLU}?durum=${d}`}
            aria-current={filtre === d ? "true" : undefined}
            className={cn(buttonVariants({ variant: filtre === d ? "default" : "outline", size: "sm" }), filtre !== d && "text-muted-foreground")}
          >
            {IZIN_DURUMU[d].etiket}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {talepler.length === 0 ? (
            <div className="p-5">
              <EmptyState compact icon={CalendarOff} title="Bu durumda izin talebi yok." />
            </div>
          ) : (
            talepler.map((t) => {
              const kisi = kisiAdi.get(t.kullanici_id);
              const d = IZIN_DURUMU[t.durum];
              return (
                <div key={t.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {kisi?.ad_soyad ?? "Personel"}
                      {kisi && <span className="ml-2 text-xs font-normal text-muted-foreground">{ROL_ETIKETLERI[kisi.rol]}</span>}
                    </p>
                    <p className="text-sm">
                      {IZIN_TIPLERI[t.tip]} · {t.gun_sayisi} iş günü ·{" "}
                      <span className="text-muted-foreground tabular-nums">
                        {gunYazi(t.baslangic_tarihi)} – {gunYazi(t.bitis_tarihi)}
                      </span>
                    </p>
                    {t.gerekce && <p className="text-xs text-muted-foreground">{t.gerekce}</p>}
                    {t.durum === "reddedildi" && t.red_gerekce && <p className="text-xs font-medium text-destructive">Ret gerekçesi: {t.red_gerekce}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge tone={d.ton}>{d.etiket}</StatusBadge>
                    {t.durum === "beklemede" && <DegerlendirmeFormu izinId={t.id} />}
                    {t.durum === "onaylandi" && t.baslangic_tarihi > bugun && <IzinIptalButonu izinId={t.id} />}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Manuel İzin Ekle</CardTitle>
            <CardDescription>Personel adına doğrudan onaylı izin; geçmişe dönük kayıtlar için. Yıllık izinde bakiye kontrol edilir.</CardDescription>
          </CardHeader>
          <CardContent>
            <ManuelIzinFormu personeller={kisiler.map((k) => ({ id: k.id, ad_soyad: k.ad_soyad }))} bugun={bugun} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Manuel Rapor Ekle</CardTitle>
            <CardDescription>Personelin raporlu günlerini doğrudan onaylı kaydeder; puantajda &quot;Rapor&quot; görünür.</CardDescription>
          </CardHeader>
          <CardContent>
            <ManuelIzinFormu rapor personeller={kisiler.map((k) => ({ id: k.id, ad_soyad: k.ad_soyad }))} bugun={bugun} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

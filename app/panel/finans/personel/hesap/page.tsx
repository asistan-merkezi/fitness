import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { POZISYON_SELECT, type Pozisyon } from "@/lib/panel/pozisyon";
import { FINANS_YONETIM_ROLLERI, ROL_ETIKETLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import type { KullaniciRolu } from "@/lib/auth/gecerli-kullanici";
import { OdemeEkleDiyalog, type OdemeSatiri } from "../odeme-diyalog";
import { PersonelSekmeleri } from "../personel-sekmeleri";

export const metadata: Metadata = { title: "Personel Hesap" };

/**
 * Personel > Hesap (klinik düzeni): tüm personelin cari bakiyesi + "Ödeme Ekle" (Tekil / Toplu Maaş).
 * Pasif personel de listelenir: ayrılmış ama alacağı olan kişi bakiye özetinden kaybolmamalı.
 */
export default async function PersonelHesapSayfasi({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const { ay } = await searchParams;
  const donem = donemCoz({ gorunum: "ay", tarih: ay });
  const bugun = bugunIstanbulTarihi();
  const buAy = bugun.slice(0, 7);

  const supabase = await createClient();
  const [{ data: kisiVeri }, { data: pozisyonVeri }, { data: profilVeri }, { data: bakiyeVeri }, { data: avansVeri }, { data: hesapVeri }] = await Promise.all([
    supabase.from("kullanici").select("id, ad_soyad, rol, aktif, pozisyon_id").neq("rol", "super_admin").order("ad_soyad"),
    supabase.from("pozisyonlar").select(POZISYON_SELECT).returns<Pozisyon[]>(),
    supabase.from("personel_profil").select("kullanici_id, maas_kurus"),
    supabase.from("personel_bakiye").select("kullanici_id, bakiye_kurus"),
    supabase.from("personel_hesap_hareket").select("kullanici_id, tutar_kurus").eq("tur", "avans").gte("islem_tarihi", donem.baslangicTarih).lt("islem_tarihi", donem.bitisTarih),
    supabase.rpc("banka_hesap_secenekleri"),
  ]);

  const pozisyon = new Map(((pozisyonVeri ?? []) as Pozisyon[]).map((p) => [p.id, p]));
  const maas = new Map(((profilVeri ?? []) as { kullanici_id: string; maas_kurus: number | string }[]).map((p) => [p.kullanici_id, Number(p.maas_kurus)]));
  const bakiye = new Map(((bakiyeVeri ?? []) as { kullanici_id: string; bakiye_kurus: number | string }[]).map((b) => [b.kullanici_id, Number(b.bakiye_kurus)]));
  const avans = new Map<string, number>();
  for (const a of (avansVeri ?? []) as { kullanici_id: string; tutar_kurus: number | string }[]) avans.set(a.kullanici_id, (avans.get(a.kullanici_id) ?? 0) + Number(a.tutar_kurus));

  const kisiler = (kisiVeri ?? []) as { id: string; ad_soyad: string; rol: KullaniciRolu; aktif: boolean; pozisyon_id: string | null }[];
  const satirlar: (OdemeSatiri & { aktif: boolean })[] = kisiler.map((k) => ({
    id: k.id,
    adSoyad: k.ad_soyad,
    gorev: (k.pozisyon_id ? pozisyon.get(k.pozisyon_id)?.ad : null) ?? ROL_ETIKETLERI[k.rol],
    bakiyeKurus: bakiye.get(k.id) ?? 0,
    maasKurus: maas.get(k.id) ?? null,
    buAykiAvansKurus: avans.get(k.id) ?? 0,
    aktif: k.aktif,
  }));
  const odenebilir = satirlar.filter((s) => s.aktif);
  const baglanti = (p: string) => `/panel/finans/personel/hesap?ay=${p}`;

  return (
    <>
      <PageHeader title="Personel" description="Hesap · Tüm personelin cari bakiyesi. Bir satıra tıklayınca personelin hesap hareketleri açılır." icon={Wallet} actions={<OdemeEkleDiyalog satirlar={odenebilir} hesaplar={(hesapVeri ?? []) as { id: string; ad: string }[]} bugun={bugun} />} />
      <PersonelSekmeleri aktif="hesap" />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={baglanti(donem.oncekiParam)} aria-label="Önceki ay" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeft aria-hidden />
        </Link>
        <span className="min-w-28 px-1 text-center text-sm font-medium">{donem.etiket}</span>
        <Link href={baglanti(donem.sonrakiParam)} aria-label="Sonraki ay" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronRight aria-hidden />
        </Link>
        {donem.param !== buAy && (
          <Link href={baglanti(buAy)} className={buttonVariants({ variant: "outline" })}>
            Bu Ay
          </Link>
        )}
        <span className="text-xs text-muted-foreground">Ay, maaş önerisinden düşülen avansı belirler.</span>
      </div>

      {satirlar.length === 0 ? (
        <EmptyState compact icon={Wallet} title="Henüz personel yok" description="Ayarlar > Personel Tanımlama'dan personel hesabı oluşturun." />
      ) : (
        <ul className="flex flex-col gap-2">
          {satirlar.map((s) => (
            <li key={s.id}>
              <Card className="p-0">
                <Link href={`/panel/finans/personel/${s.id}?sekme=odeme`} className="flex items-center justify-between gap-3 rounded-[inherit] p-3 transition-colors hover:bg-surface-2">
                  <span className="flex flex-col">
                    <span className="flex items-center gap-2 font-medium">
                      {s.adSoyad}
                      {!s.aktif && <StatusBadge tone="slate">Pasif</StatusBadge>}
                    </span>
                    <span className="text-xs text-muted-foreground">{s.gorev}</span>
                  </span>
                  <span className={`font-semibold tabular-nums ${s.bakiyeKurus < 0 ? "text-destructive" : ""}`}>{kurusTLyazi(s.bakiyeKurus)}</span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

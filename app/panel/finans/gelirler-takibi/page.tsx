import type { Metadata } from "next";
import { FileText, HandCoins, Receipt, Wallet } from "lucide-react";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { OzetModulKarti } from "@/components/panel/ozet-modul-karti";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { kurusTLyazi } from "@/lib/para";
import { FINANS_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Gelirler Takibi ve Faturalandırma" };

/** Gelirler Takibi ana sayfası (klinikteki gibi): iki alt bölüm kartı — Kesilen Faturalar ve Cari Alacaklar Takibi — ve özet göstergeler. */
export default async function GelirlerTakibiSayfasi() {
  await sayfaYetkisiIste(FINANS_ROLLERI);
  const supabase = await createClient();

  const [{ data: alacakVeri }, { data: borcVeri }, { count: kuyrukSayisi }] = await Promise.all([
    supabase.from("cari_alacak").select("borc_kurus"),
    supabase.from("faturalanmamis_borc").select("net_kurus"),
    supabase.from("fatura").select("id", { count: "exact", head: true }).eq("durum", "bekliyor"),
  ]);
  const acikAlacak = ((alacakVeri ?? []) as { borc_kurus: number | string }[]).reduce((t, a) => t + Number(a.borc_kurus), 0);
  const faturasiz = (borcVeri ?? []) as { net_kurus: number | string }[];
  const faturasizToplam = faturasiz.reduce((t, b) => t + Number(b.net_kurus), 0);

  return (
    <>
      <PageHeader title="Gelirler Takibi ve Faturalandırma" description="Seans ve paket bedellerinin faturalandırılması ile açık cari alacakların takibi." icon={Receipt} />

      <section aria-label="Gelir özeti" className="grid gap-4 sm:grid-cols-3">
        <KpiCard vurgu label="Açık cari alacak" value={kurusTLyazi(acikAlacak)} icon={Wallet} />
        <KpiCard label="Faturalanmamış satış" value={kurusTLyazi(faturasizToplam)} icon={FileText} iconTone="amber" />
        <KpiCard label="Kuyruktaki fatura" value={String(kuyrukSayisi ?? 0)} icon={Receipt} />
      </section>

      <section aria-label="Bölümler" className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-4">
        <OzetModulKarti href="/panel/finans/gelirler-takibi/faturalar" etiket="Kesilen Faturalar" ozet={faturasiz.length > 0 ? `${faturasiz.length} faturasız satış` : "Tüm satışlar faturalı"} ikon={Receipt} ton="blue" uyari={faturasiz.length > 0} />
        <OzetModulKarti href="/panel/finans/gelirler-takibi/cari-alacaklar" etiket="Cari Alacaklar Takibi" ozet={acikAlacak > 0 ? `Açık · ${kurusTLyazi(acikAlacak)}` : "Açık alacak yok"} ozetTonu={acikAlacak > 0 ? "rose" : undefined} ikon={HandCoins} ton="amber" />
      </section>

      <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
        Muhasebe (Paraşüt) bağlantısı henüz kurulmadı: oluşturulan faturalar <strong>Kuyrukta</strong> bekler ve bağlantı kurulunca otomatik kesilir.
      </p>
    </>
  );
}

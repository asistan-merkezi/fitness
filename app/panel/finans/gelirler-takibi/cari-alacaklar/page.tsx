import type { Metadata } from "next";
import { HandCoins } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { FINANS_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { CariAlacaklarListesi, type CariOzetSatiri } from "./cari-alacaklar-listesi";

export const metadata: Metadata = { title: "Cari Alacaklar Takibi" };

/** Cari Alacaklar Takibi (klinik düzeni): borç kaydı olan müşterilerin toplam borç, tahsil edilen ve kalan bakiyesi; kalan büyükten küçüğe. */
export default async function CariAlacaklarSayfasi() {
  await sayfaYetkisiIste(FINANS_ROLLERI);
  const supabase = await createClient();

  const { data } = await supabase
    .from("cari_alacak_ozet")
    .select("musteri_id, uye_no, ad_soyad, toplam_borc_kurus, tahsil_kurus, kalan_kurus")
    .order("kalan_kurus", { ascending: false })
    .order("toplam_borc_kurus", { ascending: false })
    .limit(1000);
  const satirlar = ((data ?? []) as Record<keyof CariOzetSatiri, string | number>[]).map((s) => ({
    musteri_id: String(s.musteri_id),
    uye_no: Number(s.uye_no),
    ad_soyad: String(s.ad_soyad),
    toplam_borc_kurus: Number(s.toplam_borc_kurus),
    tahsil_kurus: Number(s.tahsil_kurus),
    kalan_kurus: Number(s.kalan_kurus),
  }));

  return (
    <>
      <PageHeader title="Cari Alacaklar Takibi" description="Borç kaydı olan müşterilerin toplam borç, tahsil edilen ve kalan bakiyesi. Bir satıra tıklayınca müşterinin Cari & Ödeme sekmesi açılır." icon={HandCoins} />
      {satirlar.length === 0 ? <EmptyState icon={HandCoins} title="Henüz cari borç kaydı yok." /> : <CariAlacaklarListesi satirlar={satirlar} />}
    </>
  );
}

import type { Metadata } from "next";
import { Archive, Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { paketArsivdeMi } from "@/lib/panel/paket";
import { MUSTERI_ROLLERI, PAKET_GORUNTULEME_ROLLERI } from "@/lib/panel/roller";
import { tumSayfalariOku } from "@/lib/supabase/sayfali-oku";
import { createClient } from "@/lib/supabase/server";
import type { PaketSatiri } from "@/types/veritabani";
import { PaketSatiri as PaketSatiriBileseni } from "./paket-satiri";
import { YeniPaketDialog } from "./yeni-paket-dialog";

export const metadata: Metadata = { title: "Üyelik Paketleri" };

/** Üyelik Paketleri (klinik düzeni): Güncel / Arşiv ayrımı, Yeni Paket penceresi, satır başına Paketi Sat · Üyeler · Düzenle · Satışa Kapat. */
export default async function PaketlerSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(PAKET_GORUNTULEME_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";
  const satisYapabilir = (MUSTERI_ROLLERI as readonly string[]).includes(kullanici.rol);
  const bugun = bugunIstanbulTarihi();

  const supabase = await createClient();
  // Aktif üye sayısı: PostgREST tek seferde en çok 1000 satır döndürür; sayfalı okunur. Bitişi geçmiş/iptal üyelikler (yıllar içinde
  // biriken çoğunluk) indeksle önceden elenir, geçerli durum hesabı yalnız adaylarda çalışır.
  const [{ data }, uyeVeri] = await Promise.all([
    supabase.from("uyelik_paketi").select("*").order("ad"),
    tumSayfalariOku<{ paket_id: string }>((bas, son) =>
      supabase
        .from("uyelik_gorunum")
        .select("paket_id")
        .eq("durum", "aktif")
        .or(`bitis_tarihi.is.null,bitis_tarihi.gte.${bugun}`)
        .in("gecerli_durum", ["aktif", "dondurulmus"])
        .order("id")
        .range(bas, son)
    ),
  ]);
  const paketler = (data ?? []) as PaketSatiri[];
  const uyeSayisi = new Map<string, number>();
  for (const u of uyeVeri) uyeSayisi.set(u.paket_id, (uyeSayisi.get(u.paket_id) ?? 0) + 1);

  const guncel = paketler.filter((p) => !paketArsivdeMi(p, bugun));
  const arsiv = paketler.filter((p) => paketArsivdeMi(p, bugun));
  const satir = (p: PaketSatiri) => <PaketSatiriBileseni key={p.id} paket={p} aktifUyeSayisi={uyeSayisi.get(p.id) ?? 0} yonetici={yonetici} satisYapabilir={satisYapabilir} bugun={bugun} />;

  return (
    <>
      <PageHeader title="Üyelik Paketleri" description={yonetici ? "Müşterilere satılabilecek paketleri yönetin; satış buradan da yapılabilir." : "Paketler yalnızca işletme yöneticisi tarafından düzenlenir."} icon={Package} actions={yonetici ? <YeniPaketDialog /> : undefined} />

      <Card>
        <CardHeader>
          <CardTitle>Güncel paketler</CardTitle>
          <CardDescription>Şu an satışta olan paketler.</CardDescription>
        </CardHeader>
        <CardContent>{guncel.length === 0 ? <EmptyState compact icon={Package} title="Güncel paket yok" description={yonetici ? "“Yeni Paket” ile ilk paketi oluşturun." : undefined} /> : <ul className="flex flex-col gap-3">{guncel.map(satir)}</ul>}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Arşiv paketler</CardTitle>
          <CardDescription>Satışa kapatılmış veya satış süresi dolmuş paketler. Mevcut üyelikler etkilenmez; “Satışa Aç” ile geri alınabilir.</CardDescription>
        </CardHeader>
        <CardContent>{arsiv.length === 0 ? <EmptyState compact icon={Archive} title="Arşivde paket yok" /> : <ul className="flex flex-col gap-3">{arsiv.map(satir)}</ul>}</CardContent>
      </Card>
    </>
  );
}

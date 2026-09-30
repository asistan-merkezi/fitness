import { Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { PAKET_GORUNTULEME_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import type { PaketSatiri } from "@/types/veritabani";
import { PaketFormu } from "./paket-formu";

export default async function PaketlerSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(PAKET_GORUNTULEME_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";

  const supabase = await createClient();
  const { data } = await supabase.from("uyelik_paketi").select("*").order("aktif", { ascending: false }).order("ad");
  const paketler = (data ?? []) as PaketSatiri[];

  return (
    <>
      <PageHeader title="Üyelik Paketleri" description={yonetici ? "Paketleri oluşturun ve düzenleyin." : "Paketler yalnızca işletme yöneticisi tarafından düzenlenir."} icon={Package} />

      {yonetici && (
        <Card>
          <CardHeader>
            <CardTitle>Yeni paket</CardTitle>
            <CardDescription>Fiyat değişikliği mevcut üyelikleri etkilemez; satış anındaki koşullar üyelikte saklanır.</CardDescription>
          </CardHeader>
          <CardContent>
            <PaketFormu />
          </CardContent>
        </Card>
      )}

      {paketler.length === 0 ? (
        <EmptyState icon={Package} title="Henüz paket yok" description={yonetici ? "Yukarıdan ilk paketi oluşturun." : "İşletme yöneticisi paket oluşturduğunda burada görünür."} />
      ) : (
        <div className="flex flex-col gap-4">
          {paketler.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {p.ad}
                  <StatusBadge tone={p.aktif ? "emerald" : "slate"}>{p.aktif ? "Satışta" : "Kapalı"}</StatusBadge>
                  {p.kapsam === "ders" && <StatusBadge tone="primary">PT dersi</StatusBadge>}
                  {p.dondurma_izni && <StatusBadge tone="sky">Dondurulabilir</StatusBadge>}
                </CardTitle>
                <CardDescription>
                  {p.tur === "sure" ? `${p.sure_gun} gün` : `${p.seans_sayisi} seans${p.gecerlilik_gun ? ` · ${p.gecerlilik_gun} gün geçerli` : " · süresiz"}`} · {kurusTLyazi(p.fiyat_kurus)} (KDV %{p.kdv_orani})
                  {p.satis_bitis_tarihi && ` · satış bitişi ${gunYazi(p.satis_bitis_tarihi)}`}
                  {p.dondurma_izni && ` · en fazla ${p.azami_dondurma_gun} gün dondurma${p.dondurma_ucret_kurus > 0 ? `, ücret ${kurusTLyazi(p.dondurma_ucret_kurus)}` : ""}`}
                </CardDescription>
              </CardHeader>
              {yonetici && (
                <CardContent>
                  <details>
                    <summary className="cursor-pointer text-sm text-primary select-none">Düzenle</summary>
                    <div className="mt-4">
                      <PaketFormu paket={p} />
                    </div>
                  </details>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

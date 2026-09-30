import type { Metadata } from "next";
import { DoorOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import type { AlanSatiri } from "@/types/veritabani";
import { AlanFormu } from "./alan-formu";

export const metadata: Metadata = { title: "Alanlar ve Stüdyolar" };

export default async function AlanlarSayfasi() {
  await sayfaYetkisiIste(YONETICI_ROLLERI);
  const supabase = await createClient();
  const { data } = await supabase.from("alan_studyo").select("id, ad, aktif").order("aktif", { ascending: false }).order("ad");
  const alanlar = (data ?? []) as AlanSatiri[];

  return (
    <>
      <PageHeader title="Alanlar ve Stüdyolar" description="Derslerin yapıldığı mekânlar. Aynı alan aynı saatte iki derse verilemez." icon={DoorOpen} />

      <Card>
        <CardHeader>
          <CardTitle>Yeni alan</CardTitle>
          <CardDescription>Ör. Stüdyo 1, Fonksiyonel Alan, PT Odası.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlanFormu />
        </CardContent>
      </Card>

      {alanlar.length === 0 ? (
        <EmptyState icon={DoorOpen} title="Henüz alan yok" description="Ders planlamak için en az bir alan ekleyin." />
      ) : (
        <div className="flex flex-col gap-3">
          {alanlar.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {a.ad}
                  <StatusBadge tone={a.aktif ? "emerald" : "slate"}>{a.aktif ? "Kullanımda" : "Pasif"}</StatusBadge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <details>
                  <summary className="cursor-pointer text-sm text-primary select-none">Düzenle</summary>
                  <div className="mt-4">
                    <AlanFormu alan={a} />
                  </div>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

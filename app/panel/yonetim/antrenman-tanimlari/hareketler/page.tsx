import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import type { EgzersizSatiri } from "@/types/veritabani";
import { EgzersizFormu } from "./egzersiz-formu";

export const metadata: Metadata = { title: "Hareket Tanımlama" };

export default async function HareketTanimlamaSayfasi() {
  await sayfaYetkisiIste(YONETICI_ROLLERI);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("egzersiz_kutuphanesi")
    .select("id, ad, ekipman, sure_dakika, aktif")
    .order("aktif", { ascending: false })
    .order("ad")
    .returns<EgzersizSatiri[]>();
  const egzersizler = data ?? [];

  return (
    <>
      <PageHeader
        title="Hareket Tanımlama"
        breadcrumb={
          <Link href="/panel/yonetim/antrenman-tanimlari" className="hover:underline">
            ‹ Antrenman Tanımları
          </Link>
        }
        description="Antrenman tanımlarında yeniden kullanılabilir hareket kataloğu: ad, ekipman ve varsayılan süre."
        icon={ListChecks}
      />

      <Card>
        <CardHeader>
          <CardTitle>Yeni hareket</CardTitle>
          <CardDescription>Ör. Bench Press, Squat, Plank.</CardDescription>
        </CardHeader>
        <CardContent>
          <EgzersizFormu />
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Bir hata oluştu, lütfen tekrar deneyin.
        </p>
      ) : egzersizler.length === 0 ? (
        <EmptyState icon={ListChecks} title="Henüz hareket yok" description="Antrenman tanımı oluşturmak için en az bir hareket ekleyin." />
      ) : (
        <div className="flex flex-col gap-3">
          {egzersizler.map((e) => (
            <Card key={e.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {e.ad}
                  <StatusBadge tone={e.aktif ? "emerald" : "slate"}>{e.aktif ? "Kullanımda" : "Pasif"}</StatusBadge>
                </CardTitle>
                <CardDescription>{[e.ekipman, e.sure_dakika !== null ? `${e.sure_dakika} dk` : null].filter(Boolean).join(" · ") || "Ekipman/süre girilmemiş"}</CardDescription>
              </CardHeader>
              <CardContent>
                <details>
                  <summary className="cursor-pointer text-sm text-primary select-none">Düzenle</summary>
                  <div className="mt-4">
                    <EgzersizFormu egzersiz={e} />
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

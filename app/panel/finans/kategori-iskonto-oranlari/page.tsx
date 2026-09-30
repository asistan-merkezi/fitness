import type { Metadata } from "next";
import { Percent } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { KATEGORI_ETIKETLERI_FINANS } from "@/lib/panel/finans";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { IskontoFormu } from "./iskonto-formu";

export const metadata: Metadata = { title: "Kategori / İskonto Oranları" };

export default async function KategoriIskontoSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";
  const supabase = await createClient();
  const { data } = await supabase.from("kategori_iskonto_orani").select("kategori, yuzde");
  const oranlar = Object.fromEntries(((data ?? []) as { kategori: string; yuzde: number | string }[]).map((o) => [o.kategori, Number(o.yuzde)]));

  return (
    <>
      <PageHeader title="Kategori / İskonto Oranları" description="Müşteri kategorisine göre üyelik satışında önerilen iskonto yüzdesi" icon={Percent} />
      <Card>
        <CardHeader>
          <CardTitle>İskonto oranları</CardTitle>
          <CardDescription>Oran satışta öneri olarak gelir; satış sırasında değiştirilebilir. Boş bırakılan kategori için iskonto uygulanmaz.</CardDescription>
        </CardHeader>
        <CardContent>
          {yonetici ? (
            <IskontoFormu oranlar={oranlar} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(KATEGORI_ETIKETLERI_FINANS).map(([kod, etiket]) => (
                <li key={kod} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <span className="font-medium">{etiket}</span>
                  <StatusBadge tone="slate">%{oranlar[kod] ?? 0}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { IsletmeAdiFormu } from "../personel/personel-formlari";

export const metadata: Metadata = { title: "İşletme Bilgileri" };

export default async function IsletmeBilgileriSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(YONETICI_ROLLERI);
  const supabase = await createClient();
  const { data: isletme } = await supabase.from("isletme").select("ad").eq("id", kullanici.isletme_id).maybeSingle<{ ad: string }>();

  return (
    <>
      <PageHeader title="İşletme Bilgileri" description="Panelde ve çıktılarda görünen işletme adı." icon={Building2} />
      <Card>
        <CardHeader>
          <CardTitle>İşletme adı</CardTitle>
          <CardDescription>Menüde ve üst çubukta bu ad gösterilir.</CardDescription>
        </CardHeader>
        <CardContent>
          <IsletmeAdiFormu ad={isletme?.ad ?? ""} />
        </CardContent>
      </Card>
    </>
  );
}

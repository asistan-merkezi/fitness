import type { Metadata } from "next";
import { RefreshCw } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { formatDateTime } from "@/lib/datetime";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import type { MuhasebeEntegrasyonDurum } from "@/types/veritabani";
import { MuhasebeSyncFormu } from "./muhasebe-sync-formu";

export const metadata: Metadata = { title: "Muhasebe Sync" };

export default async function MuhasebeSyncSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const duzenlenebilir = kullanici.rol === "isletme_admin";

  // Client secret BİLEREK seçilmiyor (kolon yetkisi de yok); ekrana hiçbir zaman taşınmaz.
  const supabase = await createClient();
  const { data: durum } = await supabase
    .from("isletme_muhasebe_entegrasyonu")
    .select("parasut_client_id, parasut_company_id, secret_tanimli, baglanti_durumu, updated_at")
    .maybeSingle<MuhasebeEntegrasyonDurum>();
  const baglandi = durum?.baglanti_durumu === "baglandi";

  return (
    <>
      <PageHeader title="Muhasebe Sync" description="Muhasebe bölümünü (fatura kesimi) senkronize edecek Paraşüt API bağlantısı." icon={RefreshCw} />

      <Card>
        <CardHeader>
          <CardTitle>Bağlantı Durumu</CardTitle>
          <CardAction>
            <StatusBadge tone={baglandi ? "emerald" : "slate"}>{baglandi ? "Bağlandı" : "Bekliyor"}</StatusBadge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {durum?.updated_at && <p className="text-xs text-muted-foreground">Son güncelleme: {formatDateTime(durum.updated_at)}</p>}
          {duzenlenebilir ? <MuhasebeSyncFormu durum={durum ?? null} /> : <p className="text-sm text-muted-foreground">Bu bilgileri yalnızca işletme yöneticisi düzenleyebilir.</p>}
        </CardContent>
      </Card>
    </>
  );
}

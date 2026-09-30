import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { MusteriFormu } from "./musteri-formu";

export default async function YeniMusteriSayfasi() {
  await sayfaYetkisiIste(MUSTERI_ROLLERI);

  return (
    <>
      <PageHeader title="Yeni Müşteri" description="Müşteri kaydı, KVKK onayları ile birlikte tek işlemde oluşturulur." icon={UserPlus} />
      <MusteriFormu />
    </>
  );
}

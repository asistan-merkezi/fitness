import { LayoutDashboard, Link2Off } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";

export default async function PanelAnaSayfa() {
  const oturum = await gecerliKullanici();
  const kullanici = oturum?.kullanici ?? null;

  return (
    <>
      <PageHeader title="Panel" description="Fitness Asistanı yönetim paneli" icon={LayoutDashboard} />
      {!kullanici?.isletme_id ? (
        <EmptyState
          icon={Link2Off}
          title="Hesabınız henüz bir işletmeye bağlı değil"
          description="Bir yönetici hesabınızı bir işletmeye bağladığında panel modülleri burada görünür."
        />
      ) : (
        <EmptyState
          icon={LayoutDashboard}
          title="Modüller yakında"
          description="Müşteri, üyelik, check-in ve cari modülleri sonraki aşamalarda eklenecek."
        />
      )}
    </>
  );
}

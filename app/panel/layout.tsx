import { redirect } from "next/navigation";
import { Dumbbell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PanelMenusu } from "@/components/panel/panel-menusu";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { menuIcinRol, ROL_ETIKETLERI } from "@/lib/panel/roller";
import { cikisYap } from "./actions";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const oturum = await gecerliKullanici();

  if (!oturum) {
    redirect("/giris");
  }

  const kullanici = oturum.kullanici;
  const gorunenAd = kullanici?.ad_soyad ?? oturum.authUser.email ?? "Kullanıcı";
  const rolEtiketi = kullanici?.rol ? ROL_ETIKETLERI[kullanici.rol] : null;
  const menu = menuIcinRol(kullanici?.rol).map((m) => ({ href: m.href, etiket: m.etiket }));

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Dumbbell className="size-5 text-primary" aria-hidden />
          Fitness Asistanı
        </div>
        <form action={cikisYap} className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {gorunenAd}
            {rolEtiketi && <span className="ml-1.5 text-xs">({rolEtiketi})</span>}
          </span>
          <Button type="submit" variant="outline" size="sm">
            <LogOut className="size-4" aria-hidden />
            Çıkış
          </Button>
        </form>
      </header>
      {menu.length > 0 && <PanelMenusu ogeler={menu} />}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 sm:p-6">{children}</main>
    </div>
  );
}

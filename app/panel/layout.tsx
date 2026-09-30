import { redirect } from "next/navigation";
import { Dumbbell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { cikisYap } from "./actions";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const oturum = await gecerliKullanici();

  if (!oturum) {
    redirect("/giris");
  }

  const gorunenAd = oturum.kullanici?.ad_soyad ?? oturum.authUser.email ?? "Kullanıcı";

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Dumbbell className="size-5 text-primary" aria-hidden />
          Fitness Asistanı
        </div>
        <form action={cikisYap} className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{gorunenAd}</span>
          <Button type="submit" variant="outline" size="sm">
            <LogOut className="size-4" aria-hidden />
            Çıkış
          </Button>
        </form>
      </header>
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">{children}</main>
    </div>
  );
}

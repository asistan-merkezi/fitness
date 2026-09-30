import Link from "next/link";
import { ChevronRight, LayoutDashboard, LogOut, Menu, Package, ScanLine, Users, UsersRound, Wallet, type LucideIcon } from "lucide-react";
import { TemaSecici } from "@/components/panel/tema-anahtari";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { type MenuIkonu, menuIcinRol, ROL_ETIKETLERI } from "@/lib/panel/roller";
import { cikisYap } from "../actions";

const IKONLAR: Record<MenuIkonu, LucideIcon> = {
  panel: LayoutDashboard,
  "check-in": ScanLine,
  musteriler: Users,
  paketler: Package,
  kasa: Wallet,
  personel: UsersRound,
};

/** Mobil "Daha Fazla": tüm menüler, görünüm (tema) seçimi ve çıkış. */
export default async function DahaFazlaSayfasi() {
  const oturum = await gecerliKullanici();
  const kullanici = oturum?.kullanici ?? null;
  const ad = kullanici?.ad_soyad ?? oturum?.authUser.email ?? "Kullanıcı";
  const menu = menuIcinRol(kullanici?.rol);

  return (
    <>
      <PageHeader title="Daha Fazla" description="Menüler, görünüm ve hesap" icon={Menu} />

      <Card>
        <CardContent className="flex items-center gap-3">
          <Avatar name={ad} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{ad}</p>
            {kullanici?.rol && <p className="text-sm text-muted-foreground">{ROL_ETIKETLERI[kullanici.rol]}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Görünüm</CardTitle>
          <CardDescription>Uygulama teması bu cihazda hatırlanır.</CardDescription>
        </CardHeader>
        <CardContent>
          <TemaSecici />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {menu.map((o) => {
            const Ikon = IKONLAR[o.ikon];
            return (
              <Link key={o.href} href={o.href} className="flex min-h-12 items-center gap-3 px-5 py-3 text-sm font-medium transition-colors hover:bg-surface-3">
                <Ikon className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                <span className="flex-1">{o.etiket}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <form action={cikisYap}>
        <button
          type="submit"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-destructive-border bg-destructive-soft text-sm font-semibold text-destructive"
        >
          <LogOut className="size-4" strokeWidth={1.5} aria-hidden />
          Çıkış yap
        </button>
      </form>
    </>
  );
}

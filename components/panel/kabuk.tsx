"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogOut, Menu, Package, ScanLine, UsersRound, Users, Wallet, type LucideIcon } from "lucide-react";
import { Logo, MarkaIsareti } from "@/components/marka/logo";
import { TemaDugmesi } from "@/components/panel/tema-anahtari";
import { Avatar } from "@/components/ui/avatar";
import type { MenuIkonu } from "@/lib/panel/roller";
import { cn } from "@/lib/utils";

const IKONLAR: Record<MenuIkonu, LucideIcon> = {
  panel: LayoutDashboard,
  "check-in": ScanLine,
  musteriler: Users,
  paketler: Package,
  kasa: Wallet,
  personel: UsersRound,
};

type Oge = { href: string; etiket: string; ikon: MenuIkonu };

function aktifMi(yol: string, href: string): boolean {
  return href === "/panel" ? yol === "/panel" : yol === href || yol.startsWith(`${href}/`);
}

/**
 * Uygulama kabuğu (DESIGN.md "Layout"):
 *  - ≥1280px: sabit 260px sol menü
 *  - 768-1279px: 64px dikey ikon rayı
 *  - <768px: üst çubuk + alt dock (ortada büyük Check-in düğmesi)
 */
export function PanelKabugu({
  menu,
  kullaniciAdi,
  rolEtiketi,
  isletmeAdi,
  cikisEylemi,
  children,
}: {
  menu: Oge[];
  kullaniciAdi: string;
  rolEtiketi: string | null;
  isletmeAdi: string | null;
  cikisEylemi: () => Promise<void>;
  children: React.ReactNode;
}) {
  const yol = usePathname();

  // Mobil alt dock: Panel · Müşteriler · [Check-in] · Kasa · Daha Fazla (yetkiye göre olanlar)
  const bul = (h: string) => menu.find((m) => m.href === h);
  const solda = [bul("/panel"), bul("/panel/musteriler")].filter(Boolean) as Oge[];
  const sagda = [bul("/panel/kasa")].filter(Boolean) as Oge[];
  const checkIn = bul("/panel/check-in");

  return (
    <div className="min-h-svh">
      {/* Masaüstü menü / tablet ray */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-sidebar-border bg-sidebar md:flex xl:w-[260px]">
        <div className="flex h-16 items-center justify-center border-b border-sidebar-border px-3 xl:justify-start xl:px-5">
          <span className="xl:hidden">
            <MarkaIsareti boyut={32} />
          </span>
          <span className="hidden xl:inline-flex">
            <Logo />
          </span>
        </div>

        {isletmeAdi && (
          <p className="text-etiket hidden truncate px-5 pt-4 text-muted-foreground xl:block" title={isletmeAdi}>
            {isletmeAdi}
          </p>
        )}

        <nav aria-label="Ana menü" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {menu.map((o) => {
            const Ikon = IKONLAR[o.ikon];
            const aktif = aktifMi(yol, o.href);
            return (
              <Link
                key={o.href}
                href={o.href}
                title={o.etiket}
                aria-current={aktif ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center justify-center gap-3 rounded-lg text-sm font-medium transition-colors xl:justify-start xl:px-3",
                  aktif ? "bg-primary/14 text-primary" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                )}
              >
                <Ikon className="size-[18px] shrink-0" strokeWidth={1.5} aria-hidden />
                <span className="hidden xl:inline">{o.etiket}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-3 border-t border-sidebar-border p-3">
          <div className="flex items-center justify-center gap-3 xl:justify-start">
            <Avatar name={kullaniciAdi} size="sm" />
            <div className="hidden min-w-0 xl:block">
              <p className="truncate text-sm font-semibold">{kullaniciAdi}</p>
              {rolEtiketi && <p className="truncate text-xs text-muted-foreground">{rolEtiketi}</p>}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 xl:justify-between">
            <TemaDugmesi etiketGoster={false} className="xl:hidden" />
            <TemaDugmesi className="hidden xl:inline-flex" />
            <form action={cikisEylemi}>
              <button
                type="submit"
                aria-label="Çıkış yap"
                title="Çıkış yap"
                className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground xl:w-auto xl:gap-2 xl:px-3"
              >
                <LogOut className="size-4" strokeWidth={1.5} aria-hidden />
                <span className="hidden text-xs font-medium xl:inline">Çıkış</span>
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobil üst çubuk */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
        <span className="flex min-w-0 items-center gap-2.5">
          <MarkaIsareti boyut={28} />
          <span className="flex min-w-0 flex-col leading-none">
            {isletmeAdi && <span className="text-etiket truncate text-muted-foreground">{isletmeAdi}</span>}
            <span className="mt-1 text-sm font-bold tracking-tight">Fitness Asistanı</span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <TemaDugmesi etiketGoster={false} />
          <Link href="/panel/daha-fazla" aria-label="Hesap ve diğer menüler">
            <Avatar name={kullaniciAdi} size="sm" />
          </Link>
        </span>
      </header>

      <div className="md:pl-16 xl:pl-[260px]">
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 pb-28 md:p-6 md:pb-8 xl:p-8">{children}</main>
      </div>

      {/* Mobil alt dock */}
      <nav aria-label="Hızlı menü" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
          {[...solda].map((o) => (
            <DockOgesi key={o.href} oge={o} aktif={aktifMi(yol, o.href)} />
          ))}
          <div className="flex justify-center">
            {checkIn ? (
              <Link
                href={checkIn.href}
                aria-label="Check-in"
                aria-current={aktifMi(yol, checkIn.href) ? "page" : undefined}
                className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-z2 transition-colors hover:bg-primary-hover"
              >
                <ScanLine className="size-7" strokeWidth={1.75} aria-hidden />
              </Link>
            ) : (
              <span />
            )}
          </div>
          {sagda.map((o) => (
            <DockOgesi key={o.href} oge={o} aktif={aktifMi(yol, o.href)} />
          ))}
          <Link
            href="/panel/daha-fazla"
            aria-current={yol === "/panel/daha-fazla" ? "page" : undefined}
            className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium", yol === "/panel/daha-fazla" ? "text-primary" : "text-muted-foreground")}
          >
            <Menu className="size-5" strokeWidth={1.5} aria-hidden />
            Daha Fazla
          </Link>
        </div>
      </nav>
    </div>
  );
}

function DockOgesi({ oge, aktif }: { oge: Oge; aktif: boolean }) {
  const Ikon = IKONLAR[oge.ikon];
  return (
    <Link
      href={oge.href}
      aria-current={aktif ? "page" : undefined}
      className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium", aktif ? "text-primary" : "text-muted-foreground")}
    >
      <Ikon className="size-5" strokeWidth={1.5} aria-hidden />
      {oge.etiket.length > 10 ? oge.etiket.split(" ")[0] : oge.etiket}
    </Link>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, ScanLine } from "lucide-react";
import { IsletmeLogosu } from "@/components/marka/isletme-logosu";
import { Logo } from "@/components/marka/logo";
import { MENU_IKONLARI, type MenuIkonu } from "@/components/panel/menu-ikonlari";
import { TemaDugmesi } from "@/components/panel/tema-anahtari";
import { UstCubuk } from "@/components/panel/ust-cubuk";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Oge = { href: string; etiket: string; ikon: MenuIkonu; altYollar: string[] };

function yolEslesir(yol: string, href: string): boolean {
  return href === "/panel" ? yol === "/panel" : yol === href || yol.startsWith(`${href}/`);
}

/** Ana başlık, kendi sayfasında veya altındaki herhangi bir sayfada aktif görünür. */
function aktifMi(yol: string, oge: Pick<Oge, "href" | "altYollar">): boolean {
  return yolEslesir(yol, oge.href) || oge.altYollar.some((h) => yolEslesir(yol, h));
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
  logoUrl,
  logoUrlKoyu,
  cikisEylemi,
  ust,
  children,
}: {
  menu: Oge[];
  kullaniciAdi: string;
  rolEtiketi: string | null;
  isletmeAdi: string | null;
  /** Şirket Bilgileri'nde yüklenen logolar (açık/koyu tema); yoksa Fitness Asistanı işareti. */
  logoUrl: string | null;
  logoUrlKoyu: string | null;
  cikisEylemi: () => Promise<void>;
  /** Masaüstü üst çubuğu ayarları: Yeni Ders düğmesi, bildirim zili sayısı, müşteri arama. */
  ust: { yeniDers: boolean; bildirimSayisi: number | null; aramaVar: boolean };
  children: React.ReactNode;
}) {
  const yol = usePathname();

  // Mobil alt dock: Ana Ekran · Müşteriler · [Check-in] · Dersler · Daha Fazla (yetkiye göre olanlar)
  const bul = (h: string) => menu.find((m) => m.href === h);
  const solda = [bul("/panel"), bul("/panel/musteriler")].filter(Boolean) as Oge[];
  const sagda = [bul("/panel/dersler")].filter(Boolean) as Oge[];
  const checkIn = bul("/panel/check-in");

  return (
    <div className="min-h-svh">
      {/* Masaüstü menü / tablet ray */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-sidebar-border bg-sidebar md:flex xl:w-[260px]">
        {/* Marka bloğu (klinikteki gibi): logo + şirket adı + "Yönetim Asistanı"; şirket adı yoksa ürün logosu. */}
        <Link href="/panel" className="flex h-16 items-center justify-center gap-3 border-b border-sidebar-border px-3 xl:justify-start xl:px-5" aria-label="Ana ekran">
          {isletmeAdi ? (
            <>
              <IsletmeLogosu logoUrl={logoUrl} logoUrlKoyu={logoUrlKoyu} boyut={36} />
              <span className="hidden min-w-0 flex-col leading-tight xl:flex">
                <span className="truncate text-sm font-bold tracking-tight" title={isletmeAdi}>
                  {isletmeAdi}
                </span>
                <span className="truncate text-xs text-muted-foreground">Yönetim Asistanı</span>
              </span>
            </>
          ) : (
            <>
              <span className="xl:hidden">
                <IsletmeLogosu logoUrl={null} logoUrlKoyu={null} boyut={32} />
              </span>
              <span className="hidden xl:inline-flex">
                <Logo />
              </span>
            </>
          )}
        </Link>

        <nav aria-label="Ana menü" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {menu.map((o) => {
            const Ikon = MENU_IKONLARI[o.ikon];
            const aktif = aktifMi(yol, o);
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

        {/* Kullanıcı satırı + çıkış (klinikteki gibi tek satır; tema anahtarı üst çubukta). Dar rayda dikey: avatar + çıkış ikonu. */}
        <div className="flex flex-col items-center gap-2 border-t border-sidebar-border p-3 xl:flex-row">
          <Avatar name={kullaniciAdi} size="sm" />
          <div className="hidden min-w-0 flex-1 xl:block">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{kullaniciAdi}</p>
            {rolEtiketi && <p className="truncate text-xs text-muted-foreground">{rolEtiketi}</p>}
          </div>
          <form action={cikisEylemi}>
            <button
              type="submit"
              aria-label="Çıkış yap"
              title="Çıkış yap"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            </button>
          </form>
        </div>
      </aside>

      {/* Mobil üst çubuk */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
        <span className="flex min-w-0 items-center gap-2.5">
          <IsletmeLogosu logoUrl={logoUrl} logoUrlKoyu={logoUrlKoyu} boyut={28} />
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
        <UstCubuk kullaniciAdi={kullaniciAdi} rolEtiketi={rolEtiketi} yeniDers={ust.yeniDers} bildirimSayisi={ust.bildirimSayisi} aramaVar={ust.aramaVar} />
        <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 pb-28 md:p-6 md:pb-8 xl:p-8">{children}</main>
      </div>

      {/* Mobil alt dock */}
      <nav aria-label="Hızlı menü" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
          {[...solda].map((o) => (
            <DockOgesi key={o.href} oge={o} aktif={aktifMi(yol, o)} />
          ))}
          <div className="flex justify-center">
            {checkIn ? (
              <Link
                href={checkIn.href}
                aria-label="Check-in"
                aria-current={aktifMi(yol, checkIn) ? "page" : undefined}
                className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-z2 transition-colors hover:bg-primary-hover"
              >
                <ScanLine className="size-7" strokeWidth={1.75} aria-hidden />
              </Link>
            ) : (
              <span />
            )}
          </div>
          {sagda.map((o) => (
            <DockOgesi key={o.href} oge={o} aktif={aktifMi(yol, o)} />
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
  const Ikon = MENU_IKONLARI[oge.ikon];
  return (
    <Link
      href={oge.href}
      aria-current={aktif ? "page" : undefined}
      className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium", aktif ? "text-primary" : "text-muted-foreground")}
    >
      <Ikon className="size-5" strokeWidth={1.5} aria-hidden />
      {oge.etiket}
    </Link>
  );
}

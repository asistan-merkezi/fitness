"use client";

import Link from "next/link";
import { Bell, CalendarDays, Plus, Search } from "lucide-react";
import { TemaDugmesi } from "@/components/panel/tema-anahtari";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";

/**
 * Masaüstü/tablet üst çubuğu (klinikteki yerleşim): müşteri arama, Yeni Ders, bildirim, takvim, tema, kullanıcı.
 * Mobilde gösterilmez (mobilde kendi üst çubuğu ve alt menüsü vardır).
 */
export function UstCubuk({
  kullaniciAdi,
  rolEtiketi,
  yeniDers,
  bekleyenIzin,
  aramaVar,
}: {
  kullaniciAdi: string;
  rolEtiketi: string | null;
  yeniDers: boolean;
  /** Yalnız işletme yöneticisi için onay bekleyen izin sayısı; diğerlerinde null. */
  bekleyenIzin: number | null;
  aramaVar: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 hidden h-16 items-center gap-3 border-b border-border bg-surface/95 px-6 backdrop-blur md:flex xl:px-8">
      {aramaVar ? (
        <form action="/panel/musteriler" method="get" role="search" className="relative max-w-xl flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <input
            name="q"
            type="search"
            placeholder="Müşteri adı, telefon veya üye no ara..."
            aria-label="Müşteri ara"
            autoComplete="off"
            className="h-10 w-full rounded-lg border border-input bg-input-bg pr-3 pl-10 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
          />
        </form>
      ) : (
        <div className="flex-1" />
      )}

      {yeniDers && (
        <Link href="/panel/dersler?yeni=1" className={buttonVariants()}>
          <Plus aria-hidden /> Yeni Ders
        </Link>
      )}

      {bekleyenIzin !== null && (
        <Link
          href="/panel/yonetim/izinler"
          aria-label={bekleyenIzin > 0 ? `${bekleyenIzin} izin talebi onay bekliyor` : "İzin talepleri"}
          title={bekleyenIzin > 0 ? `${bekleyenIzin} izin talebi onay bekliyor` : "İzin talepleri"}
          className="relative inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-foreground transition-colors hover:bg-surface-3"
        >
          <Bell className="size-4" strokeWidth={1.5} aria-hidden />
          {bekleyenIzin > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-bold text-white tabular-nums">{bekleyenIzin > 9 ? "9+" : bekleyenIzin}</span>
          )}
        </Link>
      )}

      <Link href="/panel/dersler" aria-label="Ders takvimi" title="Ders takvimi" className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-foreground transition-colors hover:bg-surface-3">
        <CalendarDays className="size-4" strokeWidth={1.5} aria-hidden />
      </Link>

      <TemaDugmesi etiketGoster={false} />

      <div className="flex items-center gap-2.5 pl-1">
        <Avatar name={kullaniciAdi} size="sm" />
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-sm font-semibold leading-tight">{kullaniciAdi}</p>
          {rolEtiketi && <p className="truncate text-xs leading-tight text-muted-foreground">{rolEtiketi}</p>}
        </div>
      </div>
    </header>
  );
}

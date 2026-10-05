"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, CalendarPlus, LayoutGrid, List } from "lucide-react";
import { CanliSaat } from "@/components/panel/canli-saat";
import { type CizelgeDersi, GunCizelgesi } from "@/components/panel/gun-cizelgesi";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatTime } from "@/lib/datetime";
import { DERS_DURUMU } from "@/lib/panel/etiketler";
import { createClient } from "@/lib/supabase/client";
import type { DersDurumu } from "@/types/veritabani";

type Gorunum = "cizelge" | "liste";

/**
 * Ana ekrandaki canlı günün çizelgesi (klinikteki "Günün Çizelgesi" karşılığı).
 * - Veritabanında ders_seansi değişince (Supabase Realtime) sayfa verisi anında tazelenir; RLS abonelikte de geçerlidir.
 *   Realtime yayını yoksa/kopmuşsa CanliSaat'in 30 sn'lik yenilemesi devreye girer.
 * - "Şu an" çizgisi istemcide hesaplanır (sunucu çıktısıyla saniye farkı olmasın diye mount sonrası çizilir).
 * Yalnız düz veri alır (fonksiyon/ikon sunucudan geçirilmez).
 */
export function CanliCizelge({
  dersler,
  alanlar,
  bugun,
  yeniDersHref,
}: {
  dersler: CizelgeDersi[];
  alanlar: { id: string; ad: string }[];
  bugun: string;
  yeniDersHref?: string;
}) {
  const router = useRouter();
  const [gorunum, setGorunum] = useState<Gorunum>("cizelge");
  const [simdiIso, setSimdiIso] = useState<string | null>(null);

  useEffect(() => {
    const guncelle = () => setSimdiIso(new Date().toISOString());
    guncelle();
    const id = setInterval(guncelle, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let kanal: ReturnType<typeof supabase.channel> | null = null;
    let zamanlayici: ReturnType<typeof setTimeout> | null = null;
    let iptal = false;

    // Art arda gelen değişiklikler tek yenilemeye indirilir.
    const yenile = () => {
      if (zamanlayici) clearTimeout(zamanlayici);
      zamanlayici = setTimeout(() => router.refresh(), 400);
    };

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      if (iptal) return;
      kanal = supabase.channel("ders-seansi-canli").on("postgres_changes", { event: "*", schema: "public", table: "ders_seansi" }, yenile).subscribe();
    })();

    return () => {
      iptal = true;
      if (zamanlayici) clearTimeout(zamanlayici);
      if (kanal) supabase.removeChannel(kanal);
    };
  }, [router]);

  const alanAdi = new Map(alanlar.map((a) => [a.id, a.ad]));
  const siraliDersler = [...dersler].sort((a, b) => a.baslangic.localeCompare(b.baslangic));
  const ozet = (Object.keys(DERS_DURUMU) as DersDurumu[])
    .map((d) => ({ durum: d, adet: dersler.filter((x) => x.durum === d).length }))
    .filter((x) => x.adet > 0);
  const ayrintiHref = (id: string) => `/panel/dersler?gun=${bugun}&ders=${id}`;

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Activity className="size-5 text-primary" strokeWidth={1.5} aria-hidden />
            Günün Çizelgesi
          </h2>
          {/* Tek düğme: çizelge görünümündeyken yalnız "Liste", liste görünümündeyken yalnız "Çizelge" yazar (geçilecek görünüm). */}
          <button
            type="button"
            onClick={() => setGorunum(gorunum === "cizelge" ? "liste" : "cizelge")}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {gorunum === "cizelge" ? <List aria-hidden /> : <LayoutGrid aria-hidden />}
            {gorunum === "cizelge" ? "Liste" : "Çizelge"}
          </button>
          {yeniDersHref && (
            <Link href={yeniDersHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <CalendarPlus aria-hidden /> Yeni Ders
            </Link>
          )}
        </div>
        <CanliSaat />
      </div>

      {ozet.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-5 py-2.5">
          {ozet.map(({ durum, adet }) => (
            <StatusBadge key={durum} tone={DERS_DURUMU[durum].ton}>
              {DERS_DURUMU[durum].etiket} · {adet}
            </StatusBadge>
          ))}
        </div>
      )}

      <div className="p-4">
        {gorunum === "cizelge" ? (
          <GunCizelgesi dersler={dersler} alanlar={alanlar} bugunMu={simdiIso !== null} simdiIso={simdiIso ?? undefined} ayrintiHref={ayrintiHref} />
        ) : siraliDersler.length === 0 ? (
          <EmptyState compact icon={Activity} title="Bugün için ders yok." />
        ) : (
          <ul className="flex max-h-[560px] flex-col divide-y divide-border overflow-auto rounded-xl border border-border bg-card">
            {siraliDersler.map((d) => {
              const durum = DERS_DURUMU[d.durum];
              return (
                <li key={d.id}>
                  <Link href={ayrintiHref(d.id)} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-surface">
                    <span className="min-w-0">
                      <span className="block font-semibold tabular-nums">
                        {formatTime(d.baslangic)}–{formatTime(d.bitis)} · <span className="font-medium">{d.musteri_adi}</span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {d.antrenor_adi}
                        {alanAdi.get(d.alan_id) ? ` · ${alanAdi.get(d.alan_id)}` : ""}
                      </span>
                    </span>
                    <StatusBadge tone={durum.ton}>{durum.etiket}</StatusBadge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

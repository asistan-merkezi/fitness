import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import type { Donem } from "@/lib/donem";
import { cn } from "@/lib/utils";

const ETIKETLER: Record<Donem["gorunum"], string> = { gun: "Günlük", ay: "Aylık", yil: "Yıllık" };

/** Görünüm değişince aynı dönemde kalır: gün→ay→yıl geçişlerinde param kısaltılır/uzatılır. */
function tarihParami(d: Donem, yeni: Donem["gorunum"]): string {
  const p = d.param;
  if (yeni === "gun") return d.gorunum === "gun" ? p : d.gorunum === "ay" ? `${p}-01` : `${p}-01-01`;
  if (yeni === "ay") return d.gorunum === "yil" ? `${p}-01` : p.slice(0, 7);
  return p.slice(0, 4);
}

/**
 * Kasa / Banka / Kredi Kartı ekranlarının ortak dönem çubuğu: Günlük-Aylık-Yıllık anahtarı, önceki/sonraki, "Bugüne dön".
 * URL: `?gorunum=gun|ay|yil&tarih=...` (+ `ek`: sayfaya özgü ek parametreler, ör. `hesap=...`).
 */
export function DonemCubugu({ yol, donem, gorunumler = ["gun", "ay", "yil"], ek = "" }: { yol: string; donem: Donem; gorunumler?: Donem["gorunum"][]; ek?: string }) {
  const bugun = bugunIstanbulTarihi();
  const ekParam = ek ? `&${ek}` : "";
  const baglanti = (g: Donem["gorunum"], tarih: string) => `${yol}?gorunum=${g}&tarih=${tarih}${ekParam}`;
  const bugunParami = donem.gorunum === "gun" ? bugun : donem.gorunum === "ay" ? bugun.slice(0, 7) : bugun.slice(0, 4);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-lg border border-border p-1" role="group" aria-label="Görünüm">
        {gorunumler.map((g) => (
          <Link key={g} href={baglanti(g, tarihParami(donem, g))} aria-current={donem.gorunum === g ? "true" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", donem.gorunum === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-3")}>
            {ETIKETLER[g]}
          </Link>
        ))}
      </div>
      <Link href={baglanti(donem.gorunum, donem.oncekiParam)} aria-label="Önceki dönem" className={buttonVariants({ variant: "outline", size: "icon" })}>
        <ChevronLeft aria-hidden />
      </Link>
      <Link href={baglanti(donem.gorunum, donem.sonrakiParam)} aria-label="Sonraki dönem" className={buttonVariants({ variant: "outline", size: "icon" })}>
        <ChevronRight aria-hidden />
      </Link>
      <Link href={baglanti(donem.gorunum, bugunParami)} className="text-sm font-semibold text-primary hover:underline">
        Bugüne dön
      </Link>
    </div>
  );
}

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/**
 * Klinik düzenli dönem çubuğu (Banka / Kasa): Yıllık-Aylık anahtarı, yıl ‹2026› ve (aylıkta) ay ‹Eylül› gezinmesi.
 * Günlük görünüm yoktur; eski `gorunum=gun` bağlantıları çağıran sayfada aylığa düşürülmelidir.
 */
export function KlinikDonemCubugu({ yol, donem, ek = "" }: { yol: string; donem: Donem; ek?: string }) {
  const ekParam = ek ? `&${ek}` : "";
  const baglanti = (g: "ay" | "yil", tarih: string) => `${yol}?gorunum=${g}&tarih=${tarih}${ekParam}`;
  const yil = Number(donem.param.slice(0, 4));
  const ay = donem.gorunum === "ay" ? Number(donem.param.slice(5, 7)) : 0;
  const yilParam = (y: number) => (donem.gorunum === "ay" ? baglanti("ay", `${y}-${String(ay).padStart(2, "0")}`) : baglanti("yil", String(y)));
  const bugun = bugunIstanbulTarihi();
  const ok = (href: string, etiket: string, sol: boolean) => (
    <Link href={href} aria-label={etiket} className={buttonVariants({ variant: "ghost", size: "icon" })}>
      {sol ? <ChevronLeft aria-hidden /> : <ChevronRight aria-hidden />}
    </Link>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="flex gap-1 rounded-lg bg-surface-2 p-1" role="group" aria-label="Görünüm">
        <Link href={baglanti("yil", String(yil))} aria-current={donem.gorunum === "yil" ? "true" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", donem.gorunum === "yil" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-surface-3")}>
          Yıllık
        </Link>
        <Link href={baglanti("ay", donem.gorunum === "ay" ? donem.param : `${yil}-${bugun.slice(0, 4) === String(yil) ? bugun.slice(5, 7) : "01"}`)} aria-current={donem.gorunum === "ay" ? "true" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", donem.gorunum === "ay" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-surface-3")}>
          Aylık
        </Link>
      </div>
      <div className="flex items-center gap-1">
        {ok(yilParam(yil - 1), "Önceki yıl", true)}
        <span className="min-w-14 text-center text-sm font-medium tabular-nums">{yil}</span>
        {ok(yilParam(yil + 1), "Sonraki yıl", false)}
      </div>
      {donem.gorunum === "ay" && (
        <div className="flex items-center gap-1">
          {ok(baglanti("ay", donem.oncekiParam), "Önceki ay", true)}
          <span className="min-w-20 text-center text-sm font-medium">{AYLAR[ay - 1]}</span>
          {ok(baglanti("ay", donem.sonrakiParam), "Sonraki ay", false)}
        </div>
      )}
    </div>
  );
}

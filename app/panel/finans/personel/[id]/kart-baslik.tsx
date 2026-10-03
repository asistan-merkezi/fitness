import Link from "next/link";
import { ArrowLeft, CalendarClock, CreditCard, Phone, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { telefonGoster } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type KartSekmesi = "genel" | "kisisel" | "odeme" | "puantaj";
type Nokta = "emerald" | "sky" | "muted";

const NOKTA: Record<Nokta, string> = { emerald: "bg-success", sky: "bg-info", muted: "bg-muted-foreground/40" };

function ModulKarti({ ikon: Ikon, etiket, altBaslik, href, aktif, nokta }: { ikon: typeof User; etiket: string; altBaslik?: string; href: string; aktif: boolean; nokta?: Nokta }) {
  return (
    <Link
      href={href}
      aria-current={aktif ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-col items-start gap-2 rounded-xl border bg-card p-3 text-left shadow-z1 transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 sm:p-4",
        aktif ? "border-primary bg-primary/6" : "border-border"
      )}
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className={cn("flex size-9 items-center justify-center rounded-lg", aktif ? "bg-primary text-primary-foreground" : "bg-primary/14 text-primary")}>
          <Ikon className="size-4.5" strokeWidth={1.5} aria-hidden />
        </span>
        {nokta && <span className={cn("mt-1 size-2.5 rounded-full", NOKTA[nokta])} aria-hidden />}
      </span>
      <span className="text-sm font-semibold leading-snug">{etiket}</span>
      {altBaslik && <span className="w-full truncate text-xs text-muted-foreground tabular-nums">{altBaslik}</span>}
    </Link>
  );
}

/**
 * Personel kartının üst bölümü (klinik düzeni): kimlik kartı (ad, tıklanınca arayan telefon, pozisyon · rol, durum) ve üç modül kartı —
 * Kişisel Bilgiler (yalnız yönetici), Ödemeler, Çalışma Çizelgesi (canlı ay özeti ve bugünün durum noktası).
 * Ad/avatar tıklanınca kartın özetine döner.
 */
export function PersonelKartBasligi({
  id,
  adSoyad,
  telefon,
  gorev,
  aktif,
  sekme,
  kisiselGorunur,
  bakiyeEtiketi,
  cizelgeAltBasligi,
  cizelgeNoktasi,
}: {
  id: string;
  adSoyad: string;
  telefon: string | null;
  gorev: string;
  aktif: boolean;
  sekme: KartSekmesi;
  kisiselGorunur: boolean;
  bakiyeEtiketi: string;
  cizelgeAltBasligi: string;
  cizelgeNoktasi: Nokta;
}) {
  const kok = `/panel/finans/personel/${id}`;
  return (
    <>
      <Link href="/panel/finans/personel" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Personel
      </Link>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Link href={kok} aria-label="Personel özeti" className="rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
            <Avatar name={adSoyad} />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
              <Link href={kok} className="hover:underline">
                {adSoyad}
              </Link>
              {!aktif && <StatusBadge tone="slate">Pasif</StatusBadge>}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              {telefon ? (
                <a href={`tel:${telefon}`} className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-foreground">
                  <Phone className="size-3.5" aria-hidden /> {telefonGoster(telefon)}
                </a>
              ) : (
                <span>Telefon kaydı yok</span>
              )}
              <span aria-hidden>·</span>
              <span>{gorev}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <nav aria-label="Personel kartı bölümleri" className={cn("grid gap-3", kisiselGorunur ? "grid-cols-3" : "grid-cols-2")}>
        {kisiselGorunur && <ModulKarti ikon={User} etiket="Kişisel Bilgiler" altBaslik="Bilgiler ve belgeler" href={`${kok}?sekme=kisisel`} aktif={sekme === "kisisel"} />}
        <ModulKarti ikon={CreditCard} etiket="Ödemeler" altBaslik={bakiyeEtiketi} href={`${kok}?sekme=odeme`} aktif={sekme === "odeme"} />
        <ModulKarti ikon={CalendarClock} etiket="Çalışma Çizelgesi" altBaslik={cizelgeAltBasligi} nokta={cizelgeNoktasi} href={`${kok}?sekme=puantaj`} aktif={sekme === "puantaj"} />
      </nav>
    </>
  );
}

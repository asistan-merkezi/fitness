import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { formatDateTime } from "@/lib/datetime";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn, telefonGoster } from "@/lib/utils";
import { PersonelSekmeleri } from "../personel-sekmeleri";
import { RedFormu } from "./red-formu";

export const metadata: Metadata = { title: "İş Başvuruları" };

const DURUMLAR: Record<string, { etiket: string; ton: StatusTone }> = {
  beklemede: { etiket: "Bekleyen", ton: "amber" },
  olumlu: { etiket: "Olumlu", ton: "emerald" },
  olumsuz: { etiket: "Olumsuz", ton: "slate" },
};

type Basvuru = {
  id: string;
  ad_soyad: string;
  telefon: string;
  eposta: string | null;
  basvurulan_pozisyon: string | null;
  deneyim: string | null;
  sertifikalar: string | null;
  durum: string;
  degerlendirme_notu: string | null;
  kullanici_id: string | null;
  created_at: string;
};

export default async function IsBasvurulariSayfasi({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(YONETICI_ROLLERI);
  const { durum: durumParam } = await searchParams;
  const durum = durumParam && durumParam in DURUMLAR ? durumParam : "beklemede";

  const supabase = await createClient();
  const [{ data }, { count: bekleyen }] = await Promise.all([
    supabase
      .from("is_basvurusu")
      .select("id, ad_soyad, telefon, eposta, basvurulan_pozisyon, deneyim, sertifikalar, durum, degerlendirme_notu, kullanici_id, created_at")
      .eq("isletme_id", kullanici.isletme_id)
      .eq("durum", durum)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("is_basvurusu").select("id", { count: "exact", head: true }).eq("isletme_id", kullanici.isletme_id).eq("durum", "beklemede"),
  ]);
  const basvurular = (data ?? []) as Basvuru[];

  return (
    <>
      <PageHeader title="Personel" description="İş başvuruları" icon={UserPlus} />
      <PersonelSekmeleri aktif="basvurular" />

      <nav aria-label="Başvuru durumu" className="flex flex-wrap gap-2">
        {Object.entries(DURUMLAR).map(([kod, d]) => (
          <Link
            key={kod}
            href={`/panel/finans/personel/basvurular?durum=${kod}`}
            aria-current={kod === durum ? "page" : undefined}
            className={cn(buttonVariants({ variant: kod === durum ? "default" : "outline", size: "sm" }))}
          >
            {d.etiket}
            {kod === "beklemede" && (bekleyen ?? 0) > 0 ? ` (${bekleyen})` : ""}
          </Link>
        ))}
      </nav>

      {basvurular.length === 0 ? (
        <EmptyState title={durum === "beklemede" ? "Bekleyen başvuru yok." : "Bu durumda başvuru yok."} description="Başvuru formu için Ayarlar > QR Kodları'ndan iş başvuru kodunu yazdırın." />
      ) : (
        <ul className="flex flex-col gap-3">
          {basvurular.map((b) => {
            const d = DURUMLAR[b.durum];
            return (
              <li key={b.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 pt-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold">{b.ad_soyad}</h2>
                        <StatusBadge tone={d.ton}>{d.etiket}</StatusBadge>
                        {b.basvurulan_pozisyon && <span className="text-sm text-muted-foreground">· {b.basvurulan_pozisyon}</span>}
                      </div>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {telefonGoster(b.telefon)}
                        {b.eposta ? ` · ${b.eposta}` : ""} · {formatDateTime(b.created_at)}
                      </p>
                      {b.deneyim && (
                        <p className="text-sm">
                          <span className="font-medium">Deneyim: </span>
                          {b.deneyim}
                        </p>
                      )}
                      {b.sertifikalar && (
                        <p className="text-sm">
                          <span className="font-medium">Sertifikalar: </span>
                          {b.sertifikalar}
                        </p>
                      )}
                      {b.degerlendirme_notu && <p className="text-xs text-muted-foreground">Not: {b.degerlendirme_notu}</p>}
                      {b.kullanici_id && (
                        <Link href={`/panel/finans/personel/${b.kullanici_id}`} className="w-fit text-sm font-semibold underline">
                          Personel kartına git
                        </Link>
                      )}
                    </div>
                    {b.durum === "beklemede" && (
                      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                        <Link href={`/panel/ayarlar/personel?basvuru=${b.id}`} className={cn(buttonVariants({ size: "sm" }), "w-full sm:w-64")}>
                          Olumlu: Personel Hesabı Aç
                        </Link>
                        <RedFormu basvuruId={b.id} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

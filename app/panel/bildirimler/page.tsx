import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CalendarCheck2, CalendarClock, ChevronRight, ClipboardList, UserPlus, UserRoundCheck, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { type BildirimAnahtari, bildirimKaynagiVarMi, bildirimleriGetir } from "@/lib/panel/bildirimler";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bildirimler" };

const IKONLAR: Record<BildirimAnahtari, LucideIcon> = {
  izin: CalendarCheck2,
  on_kayit: UserPlus,
  ders_talebi: ClipboardList,
  basvuru: UserRoundCheck,
  yenileme: CalendarClock,
};

/** Üst çubuktaki zilin sayfası: rolün görebildiği her yerden gelen bekleyen işler, ilgili ekrana bağlantıyla. */
export default async function BildirimlerSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(["isletme_admin", "resepsiyon", "muhasebe", "antrenor"]);
  const { kalemler, toplam } = bildirimKaynagiVarMi(kullanici.rol) ? await bildirimleriGetir(await createClient(), kullanici.rol) : { kalemler: [], toplam: 0 };

  return (
    <>
      <PageHeader title="Bildirimler" icon={Bell} description="Rolünüzün ilgilendiği, işlem bekleyen kayıtlar tek yerde toplanır." actions={toplam > 0 ? <StatusBadge tone="amber">{toplam} bekleyen</StatusBadge> : undefined} />
      {kalemler.length === 0 ? (
        <EmptyState icon={Bell} title="Bekleyen bildirim yok." description="İzin talebi, ön kayıt, ders talebi gibi işlem bekleyen kayıtlar geldiğinde burada görünür." />
      ) : (
        <div className="flex flex-col gap-3">
          {kalemler.map((k) => {
            const Ikon = IKONLAR[k.anahtar];
            return (
              <Link key={k.anahtar} href={k.href} className="group">
                <Card className="flex-row items-center gap-4 p-4 transition-colors group-hover:border-primary/60">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/14 text-primary">
                    <Ikon className="size-5" strokeWidth={1.5} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{k.baslik}</span>
                    <span className="block text-sm text-muted-foreground">{k.aciklama}</span>
                  </span>
                  <StatusBadge tone="amber">{k.sayi}</StatusBadge>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

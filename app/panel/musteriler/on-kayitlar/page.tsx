import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, QrCode } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { formatDateTime, gunYazi } from "@/lib/datetime";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { telefonGoster } from "@/lib/utils";
import { OnKayitEylemleri } from "./eylemler";

export const metadata: Metadata = { title: "Ön Kayıtlar" };

type Satir = { id: string; ad_soyad: string; telefon: string; eposta: string | null; dogum_tarihi: string | null; ticari_ileti_izni: boolean; durum: "beklemede" | "onaylandi" | "reddedildi"; red_nedeni: string | null; musteri_id: string | null; created_at: string };

const DURUM = { beklemede: { etiket: "Beklemede", ton: "amber" }, onaylandi: { etiket: "Onaylandı", ton: "emerald" }, reddedildi: { etiket: "Reddedildi", ton: "rose" } } as const;

export default async function OnKayitlarSayfasi() {
  await sayfaYetkisiIste(MUSTERI_ROLLERI);
  const supabase = await createClient();
  const { data } = await supabase
    .from("musteri_on_kayit")
    .select("id, ad_soyad, telefon, eposta, dogum_tarihi, ticari_ileti_izni, durum, red_nedeni, musteri_id, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const satirlar = (data ?? []) as Satir[];
  const bekleyen = satirlar.filter((s) => s.durum === "beklemede");
  const sonuclanan = satirlar.filter((s) => s.durum !== "beklemede").slice(0, 20);

  return (
    <>
      <Link href="/panel/musteriler" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Müşteriler
      </Link>
      <PageHeader title="Ön Kayıtlar" description="QR ile bırakılan başvurular. Onaylanınca müşteri olarak kaydedilir; onaylanmayan kayıtlar 30 gün sonra silinir." icon={QrCode} />

      <Card>
        <CardHeader>
          <CardTitle>Onay bekleyenler ({bekleyen.length})</CardTitle>
          <CardDescription>Kimliği doğrulamadan önce müşteri olarak kaydetmeyin; kaydettiğinizde KVKK aydınlatma onamı başvuru anındaki metin sürümüyle işlenir.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {bekleyen.length === 0 ? (
            <div className="p-5">
              <EmptyState compact icon={QrCode} title="Onay bekleyen ön kayıt yok." />
            </div>
          ) : (
            bekleyen.map((s) => (
              <div key={s.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-semibold">{s.ad_soyad}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {telefonGoster(s.telefon)}
                    {s.eposta && ` · ${s.eposta}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.dogum_tarihi ? `Doğum: ${gunYazi(s.dogum_tarihi)} · ` : ""}
                    {formatDateTime(s.created_at)}
                    {s.ticari_ileti_izni && " · ticari ileti izni var"}
                  </p>
                </div>
                <OnKayitEylemleri onKayitId={s.id} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {sonuclanan.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Son sonuçlananlar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {sonuclanan.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{s.musteri_id ? <Link href={`/panel/musteriler/${s.musteri_id}`} className="hover:underline">{s.ad_soyad}</Link> : s.ad_soyad}</p>
                  {s.red_nedeni && <p className="text-xs text-muted-foreground">{s.red_nedeni}</p>}
                </div>
                <StatusBadge tone={DURUM[s.durum].ton}>{DURUM[s.durum].etiket}</StatusBadge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

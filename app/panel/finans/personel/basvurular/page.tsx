import type { Metadata } from "next";
import Link from "next/link";
import { FileText, QrCode, UserPlus } from "lucide-react";
import { qrPngUret } from "@/components/panel/qr-kart";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { CLINIC_TZ, formatDateTime } from "@/lib/datetime";
import { siteKoku } from "@/lib/qr/isletme-bilgisi";
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

const ayEtiketi = (iso: string) => new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: CLINIC_TZ }).format(new Date(iso));

/**
 * Personel > Başvurular (klinik düzeni): üstte "Elle Doldurulacak Form" (yazdırılabilir) ve web başvuru QR'ı, altında Bekleyen Başvurular,
 * en altta sonuçlanmış başvuruların ay/yıl bazlı Arşivi (hiçbir bilgi silinmez).
 */
export default async function IsBasvurulariSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(YONETICI_ROLLERI);

  const supabase = await createClient();
  const [{ data }, { data: isletme }, koku] = await Promise.all([
    supabase
      .from("is_basvurusu")
      .select("id, ad_soyad, telefon, eposta, basvurulan_pozisyon, deneyim, sertifikalar, durum, degerlendirme_notu, kullanici_id, created_at")
      .eq("isletme_id", kullanici.isletme_id)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("isletme").select("qr_kisa_kod").eq("id", kullanici.isletme_id).maybeSingle<{ qr_kisa_kod: string }>(),
    siteKoku(),
  ]);
  const hepsi = (data ?? []) as Basvuru[];
  const bekleyenler = hepsi.filter((b) => b.durum === "beklemede");
  const arsiv = hepsi.filter((b) => b.durum !== "beklemede");

  const aylar = new Map<string, Basvuru[]>();
  for (const b of arsiv) {
    const etiket = ayEtiketi(b.created_at);
    aylar.set(etiket, [...(aylar.get(etiket) ?? []), b]);
  }

  const kisaKod = isletme?.qr_kisa_kod;
  const basvuruUrl = kisaKod ? `${koku}/basvuru/${kisaKod}` : null;
  const qrPng = basvuruUrl ? await qrPngUret(basvuruUrl, 360) : null;

  return (
    <>
      <PageHeader title="Personel" description="İş başvuruları · Olumlu bulduğunuz başvuru, bilgileriyle önceden doldurulmuş personel hesabı formunu açar. Sonuçlananlar aşağıdaki arşivde ay bazlı saklanır; hiçbir bilgi silinmez." icon={UserPlus} />
      <PersonelSekmeleri aktif="basvurular" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex h-full flex-col justify-center gap-3 pt-6">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="size-4 text-primary" aria-hidden /> Elle Doldurulacak Form
            </p>
            <p className="text-xs text-muted-foreground">Aday salona geldiyse formu yazdırıp kağıt üzerinde doldurtabilirsiniz; bilgileri sonra sisteme işlersiniz.</p>
            <Link href="/panel/finans/personel/basvurular/form" className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>
              İş Başvuru Formu (Yazdır)
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            {qrPng ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrPng} alt="İş başvurusu QR kodu" width={112} height={112} className="size-28 shrink-0 rounded-lg border border-border bg-white p-1" />
            ) : (
              <QrCode className="size-10 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-sm font-semibold">İş Başvurusu (Web)</p>
              <p className="text-xs text-muted-foreground">Aday kendi telefonundan doldurur; kayıt aşağıdaki listeye düşer.</p>
              <Link href="/panel/ayarlar/qr-kodlari" className="w-fit text-sm font-semibold underline">
                QR Kodları&apos;nda yönet / yazdır
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <section aria-label="Bekleyen başvurular" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Bekleyen Başvurular ({bekleyenler.length})</h2>
        {bekleyenler.length === 0 ? <EmptyState compact title="Bekleyen başvuru yok." /> : <ul className="flex flex-col gap-3">{bekleyenler.map((b) => <BasvuruKarti key={b.id} b={b} />)}</ul>}
      </section>

      <section aria-label="Arşiv" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Arşiv ({arsiv.length})</h2>
        {arsiv.length === 0 ? (
          <EmptyState compact title="Sonuçlanmış başvuru yok." />
        ) : (
          [...aylar.entries()].map(([etiket, liste], i) => (
            <details key={etiket} open={i === 0} className="rounded-xl border border-border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold capitalize select-none">
                {etiket} <span className="font-normal text-muted-foreground">({liste.length})</span>
              </summary>
              <ul className="flex flex-col gap-3 border-t border-border p-3">
                {liste.map((b) => (
                  <BasvuruKarti key={b.id} b={b} />
                ))}
              </ul>
            </details>
          ))
        )}
      </section>
    </>
  );
}

function BasvuruKarti({ b }: { b: Basvuru }) {
  const d = DURUMLAR[b.durum] ?? { etiket: b.durum, ton: "slate" as StatusTone };
  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{b.ad_soyad}</h3>
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
}

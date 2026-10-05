import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Receipt } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { FINANS_ROLLERI, FINANS_YONETIM_ROLLERI, MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { FaturaIptalFormu } from "../../formlar";
import { musteriAdlariGetir } from "@/lib/panel/musteri-adlari";
import { FATURA_BILGI_ETIKETLERI } from "../../sorgular";
import { EksikBilgiDialog } from "./eksik-bilgi-dialog";
import { FaturaKesFormu, type FaturasizSatir } from "./fatura-kes-formu";

export const metadata: Metadata = { title: "Fatura Kes" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DURUM = { bekliyor: "Kuyrukta", kesildi: "Kesildi", hata: "Hata", iptal: "İptal" } as const;

type Fatura = { id: string; durum: keyof typeof DURUM; fatura_no: string | null; hata_mesaji: string | null };
type Kalem = { fatura: Fatura | null };

/** Tek satırın fatura sayfası (klinikteki mini fatura sayfası): satır bilgisi, alıcı bilgisi kontrolü, "Fatura Kes". */
export default async function FaturaKesSayfasi({ params }: { params: Promise<{ id: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_ROLLERI);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const bilgiTamamlayabilir = (MUSTERI_ROLLERI as readonly string[]).includes(kullanici.rol);
  const iptalYetkili = (FINANS_YONETIM_ROLLERI as readonly string[]).includes(kullanici.rol);

  const supabase = await createClient();
  const { data: borc } = await supabase
    .from("musteri_bakiye_hareket")
    .select("id, musteri_id, aciklama, islem_tarihi, tutar_kurus, iskonto_kurus, fatura_kalem(fatura(id, durum, fatura_no, hata_mesaji))")
    .eq("id", id)
    .eq("tur", "borc")
    .maybeSingle();
  if (!borc) notFound();

  const net = Number(borc.tutar_kurus) - Number(borc.iskonto_kurus);
  const kalemHam = borc.fatura_kalem as unknown as Kalem[] | Kalem | null;
  const fatura = (Array.isArray(kalemHam) ? kalemHam[0] : kalemHam)?.fatura ?? null;

  const [ad, eksikSonuc, digerSonuc] = await Promise.all([
    musteriAdlariGetir(supabase, [borc.musteri_id]),
    fatura || net <= 0 ? Promise.resolve({ data: [] as string[] }) : supabase.rpc("fatura_bilgi_eksikleri", { p_musteri_id: borc.musteri_id }),
    fatura || net <= 0 ? Promise.resolve({ data: [] }) : supabase.from("faturalanmamis_borc").select("id, aciklama, islem_tarihi, net_kurus").eq("musteri_id", borc.musteri_id).neq("id", id).order("islem_tarihi"),
  ]);
  const eksikler = (eksikSonuc.data ?? []) as string[];
  const digerleri = ((digerSonuc.data ?? []) as FaturasizSatir[]).map((s) => ({ ...s, net_kurus: Number(s.net_kurus) }));
  const musteriAdi = ad.get(borc.musteri_id) ?? "Müşteri";

  return (
    <>
      <Link href="/panel/finans/gelirler-takibi/faturalar" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Kesilen Faturalar
      </Link>
      <PageHeader title="Fatura Kes" description="Satışı ve alıcı bilgisini kontrol edip faturayı kuyruğa alın." icon={Receipt} />

      <Card>
        <CardHeader>
          <CardTitle>Satış bilgisi</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Müşteri</dt>
              <dd className="font-medium">
                {bilgiTamamlayabilir ? (
                  <Link href={`/panel/musteriler/${borc.musteri_id}`} className="hover:underline">
                    {musteriAdi}
                  </Link>
                ) : (
                  musteriAdi
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tarih</dt>
              <dd className="font-medium tabular-nums">{gunYazi(borc.islem_tarihi)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Açıklama</dt>
              <dd className="font-medium">{borc.aciklama ?? "Borç"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tutar (KDV dahil, iskonto sonrası)</dt>
              <dd className="font-semibold tabular-nums">{kurusTLyazi(net)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fatura</CardTitle>
          <CardDescription>KDV, satışın paket oranına göre (tanımsızsa %20) KDV dahil tutardan ayrıştırılır.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {fatura ? (
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tone={fatura.durum === "kesildi" ? "emerald" : fatura.durum === "hata" ? "rose" : "amber"}>{DURUM[fatura.durum]}</StatusBadge>
              {fatura.fatura_no && <span className="text-sm tabular-nums">Fatura no: {fatura.fatura_no}</span>}
              {fatura.hata_mesaji && <span className="text-sm text-destructive">{fatura.hata_mesaji}</span>}
              {iptalYetkili && (fatura.durum === "bekliyor" || fatura.durum === "hata") && <FaturaIptalFormu faturaId={fatura.id} />}
            </div>
          ) : net <= 0 ? (
            <p className="text-sm text-muted-foreground">Ücretsiz satış faturalanamaz.</p>
          ) : eksikler.length > 0 ? (
            <div className="flex flex-col gap-3">
              <p role="alert" className="rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
                Fatura için eksik bilgi: {eksikler.map((e) => FATURA_BILGI_ETIKETLERI[e] ?? e).join(", ")}.
              </p>
              {bilgiTamamlayabilir ? <EksikBilgiDialog musteriId={borc.musteri_id} eksikler={eksikler} /> : <p className="text-sm text-muted-foreground">Bu bilgileri yönetici veya resepsiyon tamamlamalıdır; lütfen onlara iletin.</p>}
            </div>
          ) : (
            <FaturaKesFormu hedef={{ id: borc.id, aciklama: borc.aciklama, islem_tarihi: borc.islem_tarihi, net_kurus: net }} digerleri={digerleri} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

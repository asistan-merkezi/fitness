import Link from "next/link";
import { BellRing, ChevronRight, RefreshCw, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { gunFarki } from "@/lib/donem";
import { KATEGORI_ETIKETLERI } from "@/lib/panel/etiketler";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { telefonGoster } from "@/lib/utils";
import type { MusteriSatiri } from "@/types/veritabani";
import { HizliKayitDialog } from "./hizli-kayit-dialog";
import { MusteriAramaKutusu } from "./musteri-arama-kutusu";

const SAYFA_BOYUTU = 50;

type UyelikOzeti = { musteri_id: string; paket_adi: string; tur: "sure" | "seans"; baslangic_tarihi: string; bitis_tarihi: string | null; toplam_hak: number | null; kalan_hak: number | null; gecerli_durum: string };
type Ilerleme = { paket: string; kullanilan: number; toplam: number; uyari: boolean; etiket: string };

/** Süreli üyelikte geçen gün / toplam gün, seanslıda kullanılan / toplam hak. */
function ilerlemeHesapla(u: UyelikOzeti, bugun: string): Ilerleme | null {
  if (u.tur === "seans" && u.toplam_hak) {
    const kalan = u.kalan_hak ?? 0;
    return { paket: u.paket_adi, kullanilan: u.toplam_hak - kalan, toplam: u.toplam_hak, uyari: kalan <= 2, etiket: `${kalan} hak kaldı` };
  }
  if (u.bitis_tarihi) {
    const toplam = Math.max(1, gunFarki(u.baslangic_tarihi, u.bitis_tarihi) + 1);
    const gecen = Math.min(toplam, Math.max(0, gunFarki(u.baslangic_tarihi, bugun)));
    const kalanGun = gunFarki(bugun, u.bitis_tarihi);
    return { paket: u.paket_adi, kullanilan: gecen, toplam, uyari: kalanGun <= 7, etiket: kalanGun >= 0 ? `${kalanGun} gün kaldı` : "Süresi doldu" };
  }
  return null;
}

function eksikAlanlar(m: MusteriSatiri): string[] {
  const eksik: string[] = [];
  if (!m.eposta?.trim()) eksik.push("E-posta");
  if (!m.telefon?.trim()) eksik.push("Telefon");
  if (!m.dogum_tarihi) eksik.push("Doğum tarihi");
  return eksik;
}

export default async function MusterilerSayfasi({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await sayfaYetkisiIste(MUSTERI_ROLLERI);
  const { q } = await searchParams;
  const sorgu = (q ?? "").trim().slice(0, 100);
  const bugun = bugunIstanbulTarihi();

  const supabase = await createClient();
  const [{ data, error }, { count: onKayitSayisi }] = await Promise.all([
    sorgu
      ? supabase.rpc("musteri_ara", { p_sorgu: sorgu, p_limit: SAYFA_BOYUTU })
      : supabase.from("musteri").select("id, uye_no, ad_soyad, telefon, eposta, dogum_tarihi, kategori, aktif, created_at").order("ad_soyad").limit(SAYFA_BOYUTU),
    supabase.from("musteri_on_kayit").select("id", { count: "exact", head: true }).eq("durum", "beklemede"),
  ]);
  const musteriler = (data ?? []) as MusteriSatiri[];
  const idler = musteriler.map((m) => m.id);

  // Liste satırı başına tek sorgu: bakiye (borç noktası) ve geçerli üyelik (ilerleme).
  const [{ data: bakiyeVeri }, { data: uyelikVeri }] = idler.length
    ? await Promise.all([
        supabase.from("musteri_bakiye").select("musteri_id, bakiye_kurus").in("musteri_id", idler),
        supabase.from("uyelik_gorunum").select("musteri_id, paket_adi, tur, baslangic_tarihi, bitis_tarihi, toplam_hak, kalan_hak, gecerli_durum").in("musteri_id", idler).in("gecerli_durum", ["aktif", "dondurulmus"]).order("bitis_tarihi", { ascending: false, nullsFirst: true }),
      ])
    : [{ data: [] }, { data: [] }];
  const borclu = new Set(((bakiyeVeri ?? []) as { musteri_id: string; bakiye_kurus: number | string }[]).filter((b) => Number(b.bakiye_kurus) < 0).map((b) => b.musteri_id));
  const uyelikler = new Map<string, UyelikOzeti>();
  for (const u of (uyelikVeri ?? []) as UyelikOzeti[]) if (!uyelikler.has(u.musteri_id)) uyelikler.set(u.musteri_id, u);

  const satirlar = musteriler.map((m) => {
    const uyelik = uyelikler.get(m.id);
    return { m, borclu: borclu.has(m.id), uyelik, ilerleme: uyelik ? ilerlemeHesapla(uyelik, bugun) : null, eksik: eksikAlanlar(m) };
  });

  const durumRozeti = (s: (typeof satirlar)[number]) =>
    !s.m.aktif ? <StatusBadge tone="slate">Pasif</StatusBadge> : s.uyelik?.gecerli_durum === "dondurulmus" ? <StatusBadge tone="sky">Dondurulmuş</StatusBadge> : s.eksik.length > 0 ? <StatusBadge tone="amber">{s.eksik.join(", ")} eksik</StatusBadge> : s.uyelik ? <StatusBadge tone="emerald">Aktif üye</StatusBadge> : <StatusBadge tone="slate">Üyeliği yok</StatusBadge>;

  return (
    <>
      <PageHeader
        title="Müşteriler"
        description={sorgu ? `"${sorgu}" için sonuçlar` : "Müşteri kayıtlarını görüntüle, ekle ve düzenle."}
        icon={Users}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/panel/musteriler/on-kayitlar" className={buttonVariants({ variant: "outline" })}>
              <BellRing className="size-4" aria-hidden />
              Ön Kayıtlar
              {(onKayitSayisi ?? 0) > 0 && <StatusBadge tone="amber">{onKayitSayisi}</StatusBadge>}
            </Link>
            <Link href="/panel/musteriler/yenileme" className={buttonVariants({ variant: "outline" })}>
              <RefreshCw className="size-4" aria-hidden />
              Yenileme Takibi
            </Link>
            <HizliKayitDialog />
          </span>
        }
      />

      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-2 backdrop-blur-sm sm:mx-0 sm:px-0">
        <MusteriAramaKutusu baslangic={sorgu} />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">Müşteriler yüklenemedi. Lütfen sayfayı yenileyin.</p>}

      {!error && musteriler.length === 0 ? (
        <EmptyState icon={Users} title={sorgu ? "Eşleşen müşteri yok" : "Henüz müşteri yok"} description={sorgu ? "Farklı bir ad, telefon veya üye numarası deneyin." : "İlk müşteriyi ekleyerek başlayın."} />
      ) : (
        <>
          {/* <768px: kart listesi */}
          <ul className="flex flex-col gap-3 md:hidden">
            {satirlar.map((s) => (
              <li key={s.m.id}>
                <Link href={`/panel/musteriler/${s.m.id}`} className="block">
                  <Card interactive className="flex-row items-center gap-3 p-3">
                    <div className="relative shrink-0">
                      <Avatar name={s.m.ad_soyad} size="sm" />
                      <span className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-background ${s.borclu ? "bg-rose-500" : "bg-emerald-500"}`} title={s.borclu ? "Cari borcu var" : "Cari borcu yok"}>
                        <span className="sr-only">{s.borclu ? "Cari borcu var" : "Cari borcu yok"}</span>
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium">{s.m.ad_soyad}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">{telefonGoster(s.m.telefon)}</span>
                    </div>
                    <div className="shrink-0">{durumRozeti(s)}</div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          {/* ≥768px: tablo */}
          <Card className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Aktif Üyelik</TableHead>
                  <TableHead>Üyelik İlerlemesi</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {satirlar.map((s) => (
                  <TableRow key={s.m.id}>
                    <TableCell>
                      <Link href={`/panel/musteriler/${s.m.id}`} className="flex items-center gap-2.5">
                        <div className="relative shrink-0">
                          <Avatar name={s.m.ad_soyad} size="sm" />
                          <span className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card ${s.borclu ? "bg-rose-500" : "bg-emerald-500"}`} title={s.borclu ? "Cari borcu var" : "Cari borcu yok"} />
                        </div>
                        <span>
                          <span className="block text-sm font-semibold text-foreground hover:underline">{s.m.ad_soyad}</span>
                          <span className="block text-xs text-muted-foreground tabular-nums">Üye no {s.m.uye_no}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{telefonGoster(s.m.telefon)}</TableCell>
                    <TableCell className="text-muted-foreground">{KATEGORI_ETIKETLERI[s.m.kategori]}</TableCell>
                    <TableCell className="text-muted-foreground">{s.uyelik?.paket_adi ?? "—"}</TableCell>
                    <TableCell className="min-w-40">
                      {s.ilerleme ? (
                        <div className="flex flex-col gap-1">
                          <ProgressBar value={s.ilerleme.kullanilan} max={s.ilerleme.toplam} ton={s.ilerleme.uyari ? "uyari" : "marka"} />
                          <span className="text-xs text-muted-foreground">{s.ilerleme.etiket}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{durumRozeti(s)}</TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}

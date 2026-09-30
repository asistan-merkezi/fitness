import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, formatDateTime } from "@/lib/datetime";
import { gunDonemi, gunEkle } from "@/lib/donem";
import {
  DENETIM_GRUP_ETIKETLERI,
  DENETIM_GRUP_TABLOLARI,
  DENETIM_ISLEM_ETIKETLERI,
  DENETIM_ISLEM_TONLARI,
  type DenetimGrubu,
  denetimOzeti,
} from "@/lib/panel/denetim";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Denetim Geçmişi" };

const SAYFA_BOYUTU = 50;
const GUN_SECENEKLERI = [7, 30, 90] as const;
const ISLEMLER = ["INSERT", "UPDATE", "DELETE"] as const;
const GRUPLAR: (DenetimGrubu | "hepsi")[] = ["hepsi", "finans", "musteri", "uyelik", "diger"];

type Satir = { id: number; created_at: string; kullanici_id: string | null; tablo: string; islem: string; degisen_alanlar: string[] | null };
type Filtreler = { grup: DenetimGrubu | "hepsi"; islem: string; gun: number; sayfa: number };

function filtreleriCoz(p: { grup?: string; islem?: string; gun?: string; sayfa?: string }): Filtreler {
  return {
    grup: GRUPLAR.find((g) => g === p.grup) ?? "hepsi",
    islem: ISLEMLER.find((i) => i === p.islem) ?? "",
    gun: GUN_SECENEKLERI.find((g) => g === Number(p.gun)) ?? 30,
    sayfa: Math.max(1, Math.floor(Number(p.sayfa)) || 1),
  };
}

function baglanti(f: Filtreler, degisiklik: Partial<Filtreler>) {
  const s = { ...f, sayfa: 1, ...degisiklik };
  const q = new URLSearchParams();
  if (s.grup !== "hepsi") q.set("grup", s.grup);
  if (s.islem) q.set("islem", s.islem);
  if (s.gun !== 30) q.set("gun", String(s.gun));
  if (s.sayfa > 1) q.set("sayfa", String(s.sayfa));
  const metin = q.toString();
  return `/panel/yonetim/denetim-gecmisi${metin ? `?${metin}` : ""}`;
}

function Secenek({ aktif, href, children }: { aktif: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={aktif ? "true" : undefined} className={cn(buttonVariants({ variant: aktif ? "default" : "outline", size: "sm" }), !aktif && "text-muted-foreground")}>
      {children}
    </Link>
  );
}

export default async function DenetimGecmisiSayfasi({ searchParams }: { searchParams: Promise<{ grup?: string; islem?: string; gun?: string; sayfa?: string }> }) {
  // Yalnız işletme yöneticisi; audit_log RLS'i de aynıdır.
  await sayfaYetkisiIste(YONETICI_ROLLERI);
  const f = filtreleriCoz(await searchParams);
  const supabase = await createClient();

  // Dönem: son N gün, İstanbul takvimine göre (bugün dahil), alt sınır günün başlangıcı.
  const baslangic = gunDonemi(gunEkle(bugunIstanbulTarihi(), -(f.gun - 1))).baslangic;
  const atla = (f.sayfa - 1) * SAYFA_BOYUTU;

  let sorgu = supabase
    .from("audit_log")
    .select("id, created_at, kullanici_id, tablo, islem, degisen_alanlar")
    .gte("created_at", baslangic)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    // Bir fazla çekilir: "sonraki sayfa var mı" için ayrı COUNT sorgusu gerekmez.
    .range(atla, atla + SAYFA_BOYUTU);

  if (f.islem) sorgu = sorgu.eq("islem", f.islem);
  if (f.grup === "diger") {
    const bilinenler = Object.values(DENETIM_GRUP_TABLOLARI).flat();
    sorgu = sorgu.not("tablo", "in", `(${bilinenler.join(",")})`);
  } else if (f.grup !== "hepsi") {
    sorgu = sorgu.in("tablo", DENETIM_GRUP_TABLOLARI[f.grup]);
  }

  const { data, error } = await sorgu.returns<Satir[]>();
  const tumu = data ?? [];
  const sonrakiVar = tumu.length > SAYFA_BOYUTU;
  const satirlar = tumu.slice(0, SAYFA_BOYUTU);

  const kisiler = new Map<string, string>();
  const idler = [...new Set(satirlar.map((s) => s.kullanici_id).filter((x): x is string => !!x))];
  if (idler.length) {
    const { data: kisiSatirlari } = await supabase.from("kullanici").select("id, ad_soyad").in("id", idler);
    for (const k of (kisiSatirlari ?? []) as { id: string; ad_soyad: string }[]) kisiler.set(k.id, k.ad_soyad);
  }

  return (
    <>
      <PageHeader title="Denetim Geçmişi" description="Kim, ne zaman, neyi değiştirdi. Yalnız alan adları tutulur; değerler (sağlık/kişisel veri dahil) saklanmaz." icon={History} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Kayıt türü">
          {GRUPLAR.map((g) => (
            <Secenek key={g} aktif={f.grup === g} href={baglanti(f, { grup: g })}>
              {g === "hepsi" ? "Hepsi" : DENETIM_GRUP_ETIKETLERI[g]}
            </Secenek>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="İşlem ve süre">
          <Secenek aktif={!f.islem} href={baglanti(f, { islem: "" })}>
            Tüm işlemler
          </Secenek>
          {ISLEMLER.map((i) => (
            <Secenek key={i} aktif={f.islem === i} href={baglanti(f, { islem: i })}>
              {DENETIM_ISLEM_ETIKETLERI[i]}
            </Secenek>
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {GUN_SECENEKLERI.map((g) => (
            <Secenek key={g} aktif={f.gun === g} href={baglanti(f, { gun: g })}>
              Son {g} gün
            </Secenek>
          ))}
        </div>
      </div>

      {error ? (
        <EmptyState icon={History} title="Kayıtlar yüklenemedi." description="Lütfen sayfayı yenileyin." />
      ) : satirlar.length === 0 ? (
        <EmptyState icon={History} title="Bu süzgeçle eşleşen kayıt yok." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zaman</TableHead>
              <TableHead>Kişi</TableHead>
              <TableHead>İşlem</TableHead>
              <TableHead>Kayıt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {satirlar.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(s.created_at)}</TableCell>
                <TableCell>{s.kullanici_id ? (kisiler.get(s.kullanici_id) ?? "Bilinmiyor") : "Sistem"}</TableCell>
                <TableCell>
                  <StatusBadge tone={DENETIM_ISLEM_TONLARI[s.islem] ?? "slate"}>{DENETIM_ISLEM_ETIKETLERI[s.islem] ?? s.islem}</StatusBadge>
                </TableCell>
                <TableCell className="text-muted-foreground">{denetimOzeti(s.tablo, s.degisen_alanlar)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {(f.sayfa > 1 || sonrakiVar) && (
        <nav aria-label="Sayfalama" className="flex items-center justify-between gap-3">
          {f.sayfa > 1 ? (
            <Link href={baglanti(f, { sayfa: f.sayfa - 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Önceki
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground tabular-nums">Sayfa {f.sayfa}</span>
          {sonrakiVar ? (
            <Link href={baglanti(f, { sayfa: f.sayfa + 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Sonraki
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardList, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi, gunYazi } from "@/lib/datetime";
import { donemCoz } from "@/lib/donem";
import { PUANTAJ_DURUMU } from "@/lib/panel/etiketler";
import { ayGunleri, ayOzeti, type HucreTuru, hucreTuru } from "@/lib/panel/puantaj";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { DURUM_TONU_SINIFLARI } from "@/lib/ui/durum-tonlari";
import { cn } from "@/lib/utils";
import { PersonelSekmeleri } from "../personel-sekmeleri";
import { HucreDialog, type HucreKaydi } from "./hucre-dialog";

export const metadata: Metadata = { title: "Puantaj Cetveli" };

const UUID_KISMI = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const HUCRE_DESENI = new RegExp(`^(${UUID_KISMI}):(\\d{4}-\\d{2}-\\d{2})$`, "i");
const SAYFA = 1000;

type KayitSatiri = { kullanici_id: string; tarih: string; durum: string; giris_saati: string | null; cikis_saati: string | null; fazla_mesai_dk: number; not_metni: string | null };

/** Hücre görünümü: kod, erişilebilir etiket, renk. Pazar/boş/gelecek soluk. */
function hucreGorunumu(tur: HucreTuru): { kod: string; etiket: string; sinif: string } {
  switch (tur) {
    case "geldi":
    case "yarim_gun":
    case "gelmedi":
    case "raporlu":
    case "izinli":
    case "tatil": {
      const d = PUANTAJ_DURUMU[tur];
      return { kod: d.kod, etiket: d.etiket, sinif: DURUM_TONU_SINIFLARI[d.ton] };
    }
    case "pazar":
      return { kod: "", etiket: "Pazar", sinif: "bg-surface-2" };
    case "gelecek":
      return { kod: "", etiket: "Henüz gelmedi", sinif: "" };
    default:
      return { kod: "·", etiket: "Girilmemiş", sinif: "text-muted-foreground" };
  }
}

export default async function PuantajCetveliSayfasi({ searchParams }: { searchParams: Promise<{ ay?: string; hucre?: string }> }) {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";
  const { ay: ayParam, hucre: hucreParam } = await searchParams;
  const donem = donemCoz({ gorunum: "ay", tarih: ayParam });
  const gunler = ayGunleri(donem.param);
  const bugun = bugunIstanbulTarihi();
  const baglanti = (p: string) => `/panel/finans/personel/puantaj?ay=${p}`;

  const supabase = await createClient();
  const kayitlar: KayitSatiri[] = [];
  for (let bas = 0; ; bas += SAYFA) {
    const { data } = await supabase
      .from("personel_puantaj")
      .select("kullanici_id, tarih, durum, giris_saati, cikis_saati, fazla_mesai_dk, not_metni")
      .gte("tarih", donem.baslangicTarih)
      .lt("tarih", donem.bitisTarih)
      .order("tarih")
      .order("kullanici_id")
      .range(bas, bas + SAYFA - 1);
    kayitlar.push(...((data ?? []) as KayitSatiri[]));
    if (!data || data.length < SAYFA) break;
  }

  const [{ data: personelVeri }, { data: izinVeri }, { data: tatilVeri }, { data: kapaliVeri }] = await Promise.all([
    supabase.from("kullanici").select("id, ad_soyad, aktif").neq("rol", "super_admin").order("ad_soyad"),
    // Muhasebe izin kayıtlarını okuyamaz (RLS): onun cetvelinde izin günleri "girilmemiş" görünür.
    supabase.from("izin_talebi").select("kullanici_id, baslangic_tarihi, bitis_tarihi").eq("durum", "onaylandi").lt("baslangic_tarihi", donem.bitisTarih).gte("bitis_tarihi", donem.baslangicTarih),
    supabase.from("resmi_tatil").select("tarih, ad").gte("tarih", donem.baslangicTarih).lt("tarih", donem.bitisTarih),
    supabase.from("personel_hesap_hareket").select("kullanici_id").in("tur", ["hakedis", "prim"]).eq("donem", `${donem.param}-01`),
  ]);

  const tatiller = new Map(((tatilVeri ?? []) as { tarih: string; ad: string }[]).map((t) => [t.tarih, t.ad]));
  const izinler = (izinVeri ?? []) as { kullanici_id: string; baslangic_tarihi: string; bitis_tarihi: string }[];
  const kapali = new Set(((kapaliVeri ?? []) as { kullanici_id: string }[]).map((h) => h.kullanici_id));
  const kayitHaritasi = new Map(kayitlar.map((k) => [`${k.kullanici_id}:${k.tarih}`, k]));
  const kayitliKisiler = new Set(kayitlar.map((k) => k.kullanici_id));
  // Pasif personel yalnız o ayda kaydı varsa görünür.
  const personel = ((personelVeri ?? []) as { id: string; ad_soyad: string; aktif: boolean }[]).filter((p) => p.aktif || kayitliKisiler.has(p.id));

  const satirlar = personel.map((p) => {
    const kendiIzinleri = izinler.filter((i) => i.kullanici_id === p.id);
    const hucreler = gunler.map((tarih) => {
      const k = kayitHaritasi.get(`${p.id}:${tarih}`);
      const izinli = kendiIzinleri.some((i) => tarih >= i.baslangic_tarihi && tarih <= i.bitis_tarihi);
      const tur = hucreTuru({ tarih, bugun, kayitDurumu: k?.durum, izinli, tatil: tatiller.has(tarih) });
      return { tarih, tur, kayit: k ?? null, fazlaMesaiDk: k?.fazla_mesai_dk ?? 0 };
    });
    return { ...p, hucreler, ozet: ayOzeti(hucreler), donemKapali: kapali.has(p.id) };
  });

  // Hücre penceresi: yalnız yönetici, geçerli personel+gün, gelecek olmayan, dönemi kapanmamış ve izin günü olmayan hücre.
  let hucrePenceresi: React.ReactNode = null;
  const eslesme = yonetici && hucreParam ? HUCRE_DESENI.exec(hucreParam) : null;
  if (eslesme) {
    const [, kisiId, tarih] = eslesme;
    const satir = satirlar.find((s) => s.id === kisiId);
    const hucre = satir?.hucreler.find((h) => h.tarih === tarih);
    if (satir && hucre && !satir.donemKapali && hucre.tur !== "izinli" && hucre.tur !== "gelecek") {
      const k: HucreKaydi | null = hucre.kayit ? { durum: hucre.kayit.durum, giris: hucre.kayit.giris_saati, cikis: hucre.kayit.cikis_saati, fazlaMesaiDk: hucre.kayit.fazla_mesai_dk, not: hucre.kayit.not_metni } : null;
      hucrePenceresi = <HucreDialog key={hucreParam} kapatHref={baglanti(donem.param)} kullaniciId={satir.id} personelAdi={satir.ad_soyad} tarih={tarih} tarihEtiketi={gunYazi(tarih)} kayit={k} />;
    }
  }

  return (
    <>
      <PageHeader title="Personel" description={`Puantaj Cetveli · ${donem.etiket}`} icon={ClipboardList} />
      <PersonelSekmeleri aktif="puantaj" />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={baglanti(donem.oncekiParam)} aria-label="Önceki ay" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeft aria-hidden />
        </Link>
        <span className="min-w-36 text-center text-sm font-semibold capitalize">{donem.etiket}</span>
        <Link href={baglanti(donem.sonrakiParam)} aria-label="Sonraki ay" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronRight aria-hidden />
        </Link>
        <Link href={baglanti(bugun.slice(0, 7))} className="text-sm font-semibold text-primary hover:underline">
          Bu aya dön
        </Link>
      </div>

      {satirlar.length === 0 ? (
        <EmptyState title="Personel yok." description="Önce Ayarlar > Personel Tanımlama'dan personel hesabı oluşturun." />
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="overflow-x-auto">
              <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
                <caption className="sr-only">{donem.etiket} puantaj cetveli: satırlar personel, sütunlar ayın günleri</caption>
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 z-10 min-w-40 bg-card px-2 py-1.5 text-left font-semibold">
                      Personel
                    </th>
                    {gunler.map((g) => {
                      const pazar = new Date(`${g}T12:00:00Z`).getUTCDay() === 0;
                      return (
                        <th key={g} scope="col" title={tatiller.get(g) ?? gunYazi(g)} className={cn("w-8 min-w-8 px-0.5 py-1.5 text-center text-xs font-medium tabular-nums", pazar || tatiller.has(g) ? "text-muted-foreground" : "")}>
                          {Number(g.slice(8))}
                        </th>
                      );
                    })}
                    <th scope="col" className="px-2 py-1.5 text-center text-xs font-semibold" title="Geldi (yarım gün 0,5 sayılır)">
                      Gün
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-center text-xs font-semibold">
                      Yok
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-center text-xs font-semibold">
                      Rapor
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-center text-xs font-semibold">
                      İzin
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-center text-xs font-semibold" title="Fazla mesai (saat)">
                      FM
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {satirlar.map((s) => (
                    <tr key={s.id}>
                      <th scope="row" className="sticky left-0 z-10 border-t border-border bg-card px-2 py-1 text-left font-medium">
                        <span className="flex items-center gap-1.5">
                          <Link href={`/panel/finans/personel/${s.id}?sekme=puantaj`} className="truncate hover:underline">
                            {s.ad_soyad}
                          </Link>
                          {s.donemKapali && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Hakedişi kapatılmış ay" />}
                          {!s.aktif && <span className="text-xs text-muted-foreground">(pasif)</span>}
                        </span>
                      </th>
                      {s.hucreler.map((h) => {
                        const g = hucreGorunumu(h.tur);
                        const duzenlenebilir = yonetici && !s.donemKapali && h.tur !== "izinli" && h.tur !== "gelecek";
                        const ortak = cn("flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold", g.sinif);
                        const etiket = `${s.ad_soyad}, ${gunYazi(h.tarih)}: ${g.etiket}${h.fazlaMesaiDk ? `, ${h.fazlaMesaiDk} dk fazla mesai` : ""}`;
                        return (
                          <td key={h.tarih} className="border-t border-border px-0.5 py-1">
                            {duzenlenebilir ? (
                              <Link href={`${baglanti(donem.param)}&hucre=${s.id}:${h.tarih}`} scroll={false} aria-label={etiket} title={etiket} className={cn(ortak, "transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring")}>
                                {g.kod}
                              </Link>
                            ) : (
                              <span role="img" aria-label={etiket} title={etiket} className={ortak}>
                                {g.kod}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="border-t border-border px-2 py-1 text-center tabular-nums font-semibold">{s.ozet.geldi + s.ozet.yarimGun * 0.5}</td>
                      <td className="border-t border-border px-2 py-1 text-center tabular-nums">{s.ozet.gelmedi}</td>
                      <td className="border-t border-border px-2 py-1 text-center tabular-nums">{s.ozet.raporlu}</td>
                      <td className="border-t border-border px-2 py-1 text-center tabular-nums">{s.ozet.izinli}</td>
                      <td className="border-t border-border px-2 py-1 text-center tabular-nums">{s.ozet.fazlaMesaiDk ? (s.ozet.fazlaMesaiDk / 60).toFixed(1).replace(".", ",") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul aria-label="Gösterge" className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {(["geldi", "yarim_gun", "gelmedi", "raporlu", "izinli", "tatil"] as const).map((d) => (
                <li key={d} className="flex items-center gap-1.5">
                  <span className={cn("flex size-5 items-center justify-center rounded text-[11px] font-semibold", DURUM_TONU_SINIFLARI[PUANTAJ_DURUMU[d].ton])}>{PUANTAJ_DURUMU[d].kod}</span>
                  {PUANTAJ_DURUMU[d].etiket}
                </li>
              ))}
              <li className="flex items-center gap-1.5">
                <span className="flex size-5 items-center justify-center rounded bg-surface-2" /> Pazar
              </li>
              <li className="flex items-center gap-1.5">
                <Lock className="size-3.5" aria-hidden /> Hakedişi kapatılmış ay (değiştirilemez)
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              {yonetici ? "Bir güne tıklayarak puantaj girin." : "Puantaj girişini işletme yöneticisi yapar."} İzin, resmi tatil ve Pazar günleri otomatik gösterilir. Puantaj kayıt amaçlıdır; maaş hakedişini değiştirmez.
            </p>
          </CardContent>
        </Card>
      )}
      {hucrePenceresi}
    </>
  );
}

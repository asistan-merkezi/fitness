import Link from "next/link";
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bugunIstanbulTarihi, formatDateForInput, formatTime } from "@/lib/datetime";
import type { Donem } from "@/lib/donem";
import { aliciMaskele } from "@/lib/mesaj/kredi-yardimcilari";
import { tetikleyiciGetir } from "@/lib/mesaj/tetikleyiciler";
import { tumSayfalariOku } from "@/lib/supabase/sayfali-oku";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { BOLUM_ETIKET, type MesajKanal } from "@/types/mesajlasma";

const GORUNUMLER = [
  { kod: "gun", etiket: "Günlük" },
  { kod: "ay", etiket: "Aylık" },
  { kod: "yil", etiket: "Yıllık" },
] as const;

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

type Gonderim = { id: string; tetikleyici_kodu: string; alici_adres: string; gonderim_zamani: string };

/** Görünüm değişince aynı dönemde kalır (gün→ay→yıl param kısaltılır/uzatılır). */
function tarihParami(d: Donem, yeni: Donem["gorunum"]): string {
  const p = d.param;
  if (yeni === "gun") return d.gorunum === "gun" ? p : d.gorunum === "ay" ? `${p}-01` : `${p}-01-01`;
  if (yeni === "ay") return d.gorunum === "yil" ? `${p}-01` : p.slice(0, 7);
  return p.slice(0, 4);
}

/**
 * Kredi Takip: seçili dönemde GÖNDERİLEN (test hariç) mesajlar. Günlük = tek tek (saat, tetikleyici, bölüm, maskeli alıcı);
 * Aylık = gün bazında, Yıllık = ay bazında adet. Dönem `[başlangıç, bitiş)` ve İstanbul saatine göredir; gelecek döneme gidilemez.
 */
export async function KrediTakip({ kanal, isletmeId, donem }: { kanal: MesajKanal; isletmeId: string; donem: Donem }) {
  const supabase = await createClient();
  const satirlar = await tumSayfalariOku<Gonderim>((bas, son) =>
    supabase
      .from("mesaj_kuyrugu")
      .select("id, tetikleyici_kodu, alici_adres, gonderim_zamani")
      .eq("isletme_id", isletmeId)
      .eq("kanal", kanal)
      .eq("durum", "gonderildi")
      .eq("test_mi", false)
      .gte("gonderim_zamani", donem.baslangic)
      .lt("gonderim_zamani", donem.bitis)
      .order("gonderim_zamani", { ascending: false })
      .order("id")
      .range(bas, son)
  );

  const bugun = bugunIstanbulTarihi();
  const bugunParami = donem.gorunum === "gun" ? bugun : donem.gorunum === "ay" ? bugun.slice(0, 7) : bugun.slice(0, 4);
  const sonrakiYok = donem.sonrakiParam > bugunParami;
  const yol = `/panel/ayarlar/mesajlasma/kredi/${kanal}`;
  const baglanti = (g: Donem["gorunum"], tarih: string) => `${yol}?sekme=takip&gorunum=${g}&tarih=${tarih}`;

  // Aylıkta gün, yıllıkta ay bazında toplam (İstanbul takvimine göre).
  const gruplar = new Map<string, number>();
  if (donem.gorunum !== "gun") {
    for (const s of satirlar) {
      const gun = formatDateForInput(s.gonderim_zamani);
      const anahtar = donem.gorunum === "ay" ? gun : gun.slice(0, 7);
      gruplar.set(anahtar, (gruplar.get(anahtar) ?? 0) + 1);
    }
  }
  const grupSatirlari = [...gruplar.entries()].sort(([a], [b]) => (a < b ? 1 : -1));

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>Kullanım</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-border p-1" role="group" aria-label="Görünüm">
            {GORUNUMLER.map((g) => (
              <Link key={g.kod} href={baglanti(g.kod, tarihParami(donem, g.kod))} aria-current={donem.gorunum === g.kod ? "true" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", donem.gorunum === g.kod ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-3")}>
                {g.etiket}
              </Link>
            ))}
          </div>
          <Link href={baglanti(donem.gorunum, donem.oncekiParam)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ChevronLeft aria-hidden /> Önceki
          </Link>
          <span className="min-w-32 text-center text-sm font-medium">{donem.etiket}</span>
          {sonrakiYok ? (
            <span aria-disabled="true" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
              Sonraki <ChevronRight aria-hidden />
            </span>
          ) : (
            <Link href={baglanti(donem.gorunum, donem.sonrakiParam)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Sonraki <ChevronRight aria-hidden />
            </Link>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Bu dönemde gönderilen: <span className="font-semibold tabular-nums text-foreground">{satirlar.length}</span> mesaj
        </p>
      </CardHeader>
      <CardContent>
        {satirlar.length === 0 ? (
          <EmptyState compact icon={MessageCircle} title="Bu dönemde gönderilen mesaj yok." />
        ) : donem.gorunum === "gun" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Saat</TableHead>
                <TableHead>Tetikleyici</TableHead>
                <TableHead>Bölüm</TableHead>
                <TableHead>Alıcı</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {satirlar.map((s) => {
                const tanim = tetikleyiciGetir(s.tetikleyici_kodu);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatTime(s.gonderim_zamani)}</TableCell>
                    <TableCell>{tanim?.ad ?? s.tetikleyici_kodu}</TableCell>
                    <TableCell>{tanim ? BOLUM_ETIKET[tanim.bolum] : "—"}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{aliciMaskele(s.alici_adres)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{donem.gorunum === "ay" ? "Gün" : "Ay"}</TableHead>
                <TableHead className="text-right">Adet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupSatirlari.map(([anahtar, adet]) => (
                <TableRow key={anahtar}>
                  <TableCell className="tabular-nums">
                    {donem.gorunum === "ay" ? (
                      <Link href={baglanti("gun", anahtar)} className="hover:underline">
                        {anahtar.slice(8, 10)}.{anahtar.slice(5, 7)}.{anahtar.slice(0, 4)}
                      </Link>
                    ) : (
                      <Link href={baglanti("ay", anahtar)} className="hover:underline">
                        {AYLAR[Number(anahtar.slice(5, 7)) - 1]} {anahtar.slice(0, 4)}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{adet}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

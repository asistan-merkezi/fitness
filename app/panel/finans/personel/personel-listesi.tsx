"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatTime } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { cn, telefonGoster } from "@/lib/utils";
import { personelPuantajHizli } from "./actions";

export type PersonelSatiri = {
  id: string;
  ad_soyad: string;
  rolEtiketi: string;
  telefon: string | null;
  aktif: boolean;
  pozisyonGrup: string | null;
  pozisyonAd: string | null;
  pozisyonSira: number | null;
  /** Yönetici dışında (muhasebe) maaş gösterilmez. */
  maasKurus: number | null;
  maasTanimli: boolean;
  bakiyeKurus: number;
  bugunIzinli: boolean;
  bekleyenIzin: number;
  bilgiEksik: boolean;
  /** Bugünkü puantajın giriş/çıkış saati ("HH:mm"); kayıt yoksa null. */
  bugunGiris: string | null;
  bugunCikis: string | null;
};

const DIGER_SIRA = Number.MAX_SAFE_INTEGER;

/**
 * Personel listesi (klinikteki Liste sekmesi): departman → pozisyon sırasıyla gruplu (Ayarlar > Personel Tanımlama'daki katalogla aynı
 * sıra), aranabilir. Pozisyonu olmayan personel "Diğer" grubunda sona düşer.
 */
export function PersonelListesi({ personel, yonetici }: { personel: PersonelSatiri[]; yonetici: boolean }) {
  const [arama, setArama] = useState("");

  const gruplar = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    const kalan = personel.filter((p) => !q || p.ad_soyad.toLocaleLowerCase("tr").includes(q) || (p.pozisyonAd ?? "").toLocaleLowerCase("tr").includes(q) || p.rolEtiketi.toLocaleLowerCase("tr").includes(q) || (p.telefon ?? "").includes(q.replace(/\s/g, "")));

    const pozisyonlar = new Map<string, { grup: string; ad: string; sira: number; kisiler: PersonelSatiri[] }>();
    for (const p of kalan) {
      const grup = p.pozisyonGrup ?? "Diğer";
      const ad = p.pozisyonAd ?? p.rolEtiketi;
      const anahtar = `${grup}::${ad}`;
      const mevcut = pozisyonlar.get(anahtar) ?? { grup, ad, sira: p.pozisyonSira ?? DIGER_SIRA, kisiler: [] };
      mevcut.kisiler.push(p);
      pozisyonlar.set(anahtar, mevcut);
    }
    const grupSirasi = new Map<string, number>();
    for (const poz of pozisyonlar.values()) grupSirasi.set(poz.grup, Math.min(grupSirasi.get(poz.grup) ?? DIGER_SIRA, poz.sira));

    return [...grupSirasi.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([grup]) => ({
        grup,
        pozisyonlar: [...pozisyonlar.values()]
          .filter((poz) => poz.grup === grup)
          .sort((a, b) => a.sira - b.sira)
          .map((poz) => ({ ad: poz.ad, kisiler: [...poz.kisiler].sort((a, b) => a.ad_soyad.localeCompare(b.ad_soyad, "tr")) })),
      }));
  }, [personel, arama]);

  return (
    <div className="flex flex-col gap-5">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" placeholder="İsim, pozisyon, rol veya telefon ile ara" aria-label="Personel ara" value={arama} onChange={(e) => setArama(e.target.value)} className="pl-8" />
      </div>

      {gruplar.length === 0 && <p className="text-sm text-muted-foreground">Aramayla eşleşen personel bulunamadı.</p>}

      {gruplar.map(({ grup, pozisyonlar }) => (
        <section key={grup} className="flex flex-col gap-3" aria-label={grup}>
          <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{grup}</h2>
          {pozisyonlar.map(({ ad, kisiler }) => (
            <div key={ad} className="flex flex-col gap-2">
              <h3 className="px-1 text-xs font-medium text-muted-foreground/80">{ad}</h3>
              <ul className="flex flex-col gap-2">
                {kisiler.map((p) => (
                  <li key={p.id}>
                    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/60">
                      <Link href={`/panel/finans/personel/${p.id}`} className="flex flex-wrap items-center gap-3">
                        <Avatar name={p.ad_soyad} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm font-semibold", !p.aktif && "text-muted-foreground line-through")}>{p.ad_soyad}</span>
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            {p.rolEtiketi} · {telefonGoster(p.telefon) || "Telefon yok"}
                            {p.maasKurus !== null && p.maasKurus > 0 && ` · ${kurusTLyazi(p.maasKurus)}`}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                          {p.bugunIzinli && <StatusBadge tone="sky">Bugün izinli</StatusBadge>}
                          {p.bekleyenIzin > 0 && <StatusBadge tone="amber">{p.bekleyenIzin} izin talebi</StatusBadge>}
                          {!p.maasTanimli && <StatusBadge tone="amber">Maaş tanımsız</StatusBadge>}
                          {p.bilgiEksik && <StatusBadge tone="amber">Bilgiler eksik</StatusBadge>}
                          <StatusBadge tone={p.aktif ? "emerald" : "slate"}>{p.aktif ? "Aktif" : "Pasif"}</StatusBadge>
                          {p.bakiyeKurus !== 0 && <span className={cn("text-sm font-semibold tabular-nums", p.bakiyeKurus < 0 && "text-destructive")}>{kurusTLyazi(Math.abs(p.bakiyeKurus))}</span>}
                        </span>
                      </Link>
                      {yonetici && p.aktif && <HizliIslemler p={p} />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * Yönetici için satır kısayolları (klinik düzeni): Giriş · Çıkış · Ödeme. Giriş/Çıkış bugünün puantajını yazar; saat şimdiki İstanbul saatidir,
 * "Düzenle" ile değiştirilebilir. Mevcut kaydı ezmez (girişi olana ikinci giriş yok; çıkış için önce giriş gerekir).
 */
function HizliIslemler({ p }: { p: PersonelSatiri }) {
  const [bekliyor, basla] = useTransition();
  const [panel, setPanel] = useState<"giris" | "cikis" | null>(null);
  const [duzenle, setDuzenle] = useState(false);
  const [saat, setSaat] = useState("");
  const [sonuc, setSonuc] = useState<{ success: boolean; message: string } | null>(null);

  const simdi = () => formatTime(new Date().toISOString());
  function ac(tur: "giris" | "cikis") {
    setSonuc(null);
    setDuzenle(false);
    setSaat(simdi());
    setPanel((o) => (o === tur ? null : tur));
  }
  function kaydet() {
    if (!panel) return;
    const tur = panel;
    basla(async () => {
      const r = await personelPuantajHizli(p.id, tur, saat);
      setSonuc(r);
      if (r.success) {
        setPanel(null);
        setDuzenle(false);
      }
    });
  }

  const girisVar = p.bugunGiris !== null;
  const cikisVar = p.bugunCikis !== null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-3 gap-2">
        <Button type="button" variant="outline" size="sm" disabled={bekliyor || p.bugunIzinli || girisVar} onClick={() => ac("giris")} className={cn("border-success-border bg-success-soft text-success hover:bg-success-soft hover:text-success", panel === "giris" && "ring-2 ring-success/50")}>
          Giriş
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={bekliyor || p.bugunIzinli || !girisVar || cikisVar} onClick={() => ac("cikis")} className={cn("border-warning-border bg-warning-soft text-warning hover:bg-warning-soft hover:text-warning", panel === "cikis" && "ring-2 ring-warning/50")}>
          Çıkış
        </Button>
        <Link href={`/panel/finans/personel/${p.id}?sekme=odeme&odemeEkle=1`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-info-border bg-info-soft text-info hover:bg-info-soft hover:text-info")}>
          Ödeme
        </Link>
      </div>
      {(girisVar || cikisVar) && (
        <p className="text-xs text-muted-foreground tabular-nums">
          Bugün: giriş {p.bugunGiris ?? "—"} · çıkış {p.bugunCikis ?? "—"}
        </p>
      )}
      {panel && (
        <div className="flex items-center gap-2 rounded-lg border border-border p-2">
          <span className="text-xs text-muted-foreground">{panel === "giris" ? "Giriş saati" : "Çıkış saati"}</span>
          {duzenle ? <Input type="time" value={saat} onChange={(e) => setSaat(e.target.value)} disabled={bekliyor} className="h-8 w-28" /> : <span className="font-medium tabular-nums">{saat}</span>}
          <div className="ml-auto flex gap-1.5">
            {duzenle ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bekliyor}
                  onClick={() => {
                    setDuzenle(false);
                    setSaat(simdi());
                  }}
                >
                  Vazgeç
                </Button>
                <Button type="button" size="sm" disabled={bekliyor || !saat} onClick={kaydet}>
                  Kaydet
                </Button>
              </>
            ) : (
              <>
                <Button type="button" size="sm" disabled={bekliyor} onClick={kaydet}>
                  Onayla
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={bekliyor} onClick={() => setDuzenle(true)}>
                  Düzenle
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      {sonuc && (
        <p role={sonuc.success ? "status" : "alert"} className={cn("text-xs font-medium", sonuc.success ? "text-success" : "text-destructive")}>
          {sonuc.message}
        </p>
      )}
    </div>
  );
}

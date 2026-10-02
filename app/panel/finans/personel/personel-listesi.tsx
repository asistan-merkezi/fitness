"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { kurusTLyazi } from "@/lib/para";
import { cn } from "@/lib/utils";

export type PersonelSatiri = {
  id: string;
  ad_soyad: string;
  rolEtiketi: string;
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
};

const DIGER_SIRA = Number.MAX_SAFE_INTEGER;

/**
 * Personel listesi (klinikteki Liste sekmesi): departman → pozisyon sırasıyla gruplu (Ayarlar > Personel Tanımlama'daki katalogla aynı
 * sıra), aranabilir. Pozisyonu olmayan personel "Diğer" grubunda sona düşer.
 */
export function PersonelListesi({ personel }: { personel: PersonelSatiri[] }) {
  const [arama, setArama] = useState("");

  const gruplar = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    const kalan = personel.filter((p) => !q || p.ad_soyad.toLocaleLowerCase("tr").includes(q) || (p.pozisyonAd ?? "").toLocaleLowerCase("tr").includes(q) || p.rolEtiketi.toLocaleLowerCase("tr").includes(q));

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
        <Input type="search" placeholder="İsim, pozisyon veya rol ile ara" aria-label="Personel ara" value={arama} onChange={(e) => setArama(e.target.value)} className="pl-8" />
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
                    <Link href={`/panel/finans/personel/${p.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/60">
                      <Avatar name={p.ad_soyad} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm font-semibold", !p.aktif && "text-muted-foreground line-through")}>{p.ad_soyad}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {p.rolEtiketi}
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

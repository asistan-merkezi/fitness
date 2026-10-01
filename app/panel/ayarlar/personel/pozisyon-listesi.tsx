"use client";

import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { type Pozisyon, PUANTAJ_MODU_ETIKETLERI, pozisyonGruplari, UCRET_TIPI_ETIKETLERI } from "@/lib/panel/pozisyon";
import { ROL_ETIKETLERI } from "@/lib/panel/roller";
import { pozisyonDegistir } from "./actions";

function IkiliAnahtar({
  baslik,
  kapaliEtiket,
  acikEtiket,
  checked,
  disabled,
  onChange,
}: {
  baslik: string;
  kapaliEtiket: string;
  acikEtiket: string;
  checked: boolean;
  disabled: boolean;
  onChange: (deger: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{baslik}</span>
      <div className="flex items-center gap-2 text-xs">
        <span className={cn(!checked ? "font-semibold text-destructive" : "text-muted-foreground")}>{kapaliEtiket}</span>
        <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={`${baslik}: ${checked ? acikEtiket : kapaliEtiket}`} />
        <span className={cn(checked ? "font-semibold text-success" : "text-muted-foreground")}>{acikEtiket}</span>
      </div>
    </div>
  );
}

function PozisyonSatiri({ pozisyon, calisanSayisi, duzenlenebilir }: { pozisyon: Pozisyon; calisanSayisi: number; duzenlenebilir: boolean }) {
  const [bekliyor, basla] = useTransition();
  const [hata, setHata] = useState<string | null>(null);

  function degistir(alan: "aktif" | "sistem_erisimi", deger: boolean) {
    basla(async () => {
      setHata(null);
      const sonuc = await pozisyonDegistir(pozisyon.id, alan, deger);
      if (!sonuc.success) setHata(sonuc.message);
    });
  }

  return (
    <li className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("font-medium", !pozisyon.aktif && "text-muted-foreground line-through")}>{pozisyon.ad}</span>
          {pozisyon.ozel_mi && <StatusBadge tone="sky">Özel</StatusBadge>}
          {calisanSayisi > 0 && <StatusBadge tone="emerald">{calisanSayisi} personel</StatusBadge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {ROL_ETIKETLERI[pozisyon.varsayilan_rol]} · {UCRET_TIPI_ETIKETLERI[pozisyon.ucret_tipi]} · {PUANTAJ_MODU_ETIKETLERI[pozisyon.puantaj_modu]}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap items-center gap-4">
          <IkiliAnahtar baslik="Durum" kapaliEtiket="Pasif" acikEtiket="Aktif" checked={pozisyon.aktif} disabled={!duzenlenebilir || bekliyor} onChange={(d) => degistir("aktif", d)} />
          <IkiliAnahtar baslik="Sistem erişimi" kapaliEtiket="Yok" acikEtiket="Var" checked={pozisyon.sistem_erisimi} disabled={!duzenlenebilir || bekliyor} onChange={(d) => degistir("sistem_erisimi", d)} />
        </div>
        {hata && (
          <p role="alert" className="text-xs text-destructive">
            {hata}
          </p>
        )}
      </div>
    </li>
  );
}

/** Departman bazlı pozisyon kataloğu: açma/kapama ve sistem erişimi anahtarları. */
export function PozisyonListesi({ pozisyonlar, calisanSayilari, duzenlenebilir }: { pozisyonlar: Pozisyon[]; calisanSayilari: Record<string, number>; duzenlenebilir: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {pozisyonGruplari(pozisyonlar).map(({ grup, pozisyonlar: liste }) => (
        <section key={grup} className="flex flex-col gap-1" aria-label={grup}>
          <h2 className="text-etiket text-muted-foreground">{grup}</h2>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card px-4">
            {liste.map((p) => (
              <PozisyonSatiri key={p.id} pozisyon={p} calisanSayisi={calisanSayilari[p.id] ?? 0} duzenlenebilir={duzenlenebilir} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

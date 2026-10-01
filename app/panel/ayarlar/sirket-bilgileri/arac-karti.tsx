"use client";

import { Alan, IsimGirdisi, OnayKutusu } from "@/components/panel/form-alanlari";
import { EylemFormu } from "@/components/panel/eylem-formu";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { plakaBicimle } from "@/lib/utils";
import type { AracSatiri } from "@/types/veritabani";
import { aracKaydet } from "./actions";

function AracFormu({ arac }: { arac?: AracSatiri }) {
  const on = arac ? `ar_${arac.id}_` : "ar_yeni_";
  return (
    <EylemFormu eylem={aracKaydet} gonder={arac ? "Kaydet" : "Araç Ekle"} varyant={arac ? "outline" : "default"}>
      {arac && <input type="hidden" name="arac_id" value={arac.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Alan etiket="Marka" htmlFor={`${on}marka`}>
          <IsimGirdisi id={`${on}marka`} name="marka" varsayilan={arac?.marka ?? ""} required />
        </Alan>
        <Alan etiket="Model" htmlFor={`${on}model`}>
          <IsimGirdisi id={`${on}model`} name="model" varsayilan={arac?.model ?? ""} required />
        </Alan>
        <Alan etiket="Plaka" htmlFor={`${on}plaka`} ipucu="Örn. 34 ABC 123">
          <Input id={`${on}plaka`} name="plaka" defaultValue={arac ? plakaBicimle(arac.plaka) : ""} required autoComplete="off" spellCheck={false} className="uppercase" />
        </Alan>
      </div>
      {arac && <OnayKutusu id={`${on}aktif`} name="aktif" etiket="Kullanımda (aktif)" varsayilan={arac.aktif} />}
    </EylemFormu>
  );
}

export function AracKarti({ araclar, duzenlenebilir }: { araclar: AracSatiri[]; duzenlenebilir: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      {araclar.length === 0 ? (
        <p className="text-sm text-muted-foreground">Kayıtlı araç yok.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {araclar.map((a) => (
            <li key={a.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {a.marka} {a.model}
                  <span className="ml-2 font-mono text-sm font-normal text-muted-foreground tabular-nums">{plakaBicimle(a.plaka)}</span>
                </p>
                <StatusBadge tone={a.aktif ? "emerald" : "slate"}>{a.aktif ? "Aktif" : "Pasif"}</StatusBadge>
              </div>
              {duzenlenebilir && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-primary select-none">Düzenle</summary>
                  <div className="mt-4">
                    <AracFormu arac={a} />
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {duzenlenebilir && (
        <div className="border-t border-border pt-5">
          <p className="mb-3 text-sm font-semibold">Yeni araç</p>
          <AracFormu />
        </div>
      )}
    </div>
  );
}

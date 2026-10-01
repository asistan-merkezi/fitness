"use client";

import { Alan } from "@/components/panel/form-alanlari";
import { EylemFormu } from "@/components/panel/eylem-formu";
import { Input } from "@/components/ui/input";
import { kurusGirdiYazi } from "@/lib/para";
import { acilisBakiyeKaydet } from "./actions";

export type HesapSecimSatiri = { kod: string; ad: string };

export function AcilisFormu({ hesapKodu, acilisKurus }: { hesapKodu: string; acilisKurus: number }) {
  return (
    <EylemFormu eylem={acilisBakiyeKaydet} gonder="Kaydet" varyant="outline" boyut="sm" className="sm:flex-row sm:items-end sm:gap-3">
      <input type="hidden" name="hesap" value={hesapKodu} />
      <Alan etiket="Açılış bakiyesi (₺)" htmlFor={`ab_${hesapKodu}`} ipucu="Kayıtlara başlamadan önceki bakiye; eksi girilebilir.">
        <Input id={`ab_${hesapKodu}`} name="tutar" inputMode="decimal" defaultValue={acilisKurus === 0 ? "" : (acilisKurus < 0 ? "-" : "") + kurusGirdiYazi(Math.abs(acilisKurus))} autoComplete="off" className="w-44" />
      </Alan>
    </EylemFormu>
  );
}

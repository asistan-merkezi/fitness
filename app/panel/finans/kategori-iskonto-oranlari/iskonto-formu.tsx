"use client";

import { Alan } from "@/components/panel/form-alanlari";
import { EylemFormu } from "@/components/panel/eylem-formu";
import { Input } from "@/components/ui/input";
import { KATEGORI_ETIKETLERI_FINANS } from "@/lib/panel/finans";
import { iskontoOranlariKaydet } from "./actions";

export function IskontoFormu({ oranlar }: { oranlar: Record<string, number> }) {
  return (
    <EylemFormu eylem={iskontoOranlariKaydet} gonder="Kaydet">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(KATEGORI_ETIKETLERI_FINANS).map(([kod, etiket]) => (
          <Alan key={kod} etiket={`${etiket} (%)`} htmlFor={`iskonto_${kod}`}>
            <Input id={`iskonto_${kod}`} name={kod} inputMode="decimal" defaultValue={oranlar[kod] ? String(oranlar[kod]).replace(".", ",") : ""} placeholder="0" autoComplete="off" />
          </Alan>
        ))}
      </div>
    </EylemFormu>
  );
}

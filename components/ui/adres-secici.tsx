"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { getIlceler, getIller, getMahalleler } from "@/lib/turkiye-adres";
import { cn } from "@/lib/utils";

const SECIM_SINIFI =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-input-bg px-3 text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const ILLER = getIller();

/** İl → ilçe → mahalle zincirleme seçici. Alan adları `<prefix>_il`, `<prefix>_ilce`, `<prefix>_mahalle` olarak gönderilir. */
export function AdresSecici({
  prefix = "adres",
  defaultIl,
  defaultIlce,
  defaultMahalle,
  disabled,
  className,
}: {
  prefix?: string;
  defaultIl?: string | null;
  defaultIlce?: string | null;
  defaultMahalle?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const [il, setIl] = React.useState(defaultIl ?? "");
  const [ilce, setIlce] = React.useState(defaultIlce ?? "");
  const [mahalle, setMahalle] = React.useState(defaultMahalle ?? "");

  const ilceler = React.useMemo(() => (il ? getIlceler(il) : []), [il]);
  const mahalleler = React.useMemo(() => (il && ilce ? getMahalleler(il, ilce) : []), [il, ilce]);

  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-3", className)}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}_il`}>İl</Label>
        <select
          id={`${prefix}_il`}
          name={`${prefix}_il`}
          value={il}
          disabled={disabled}
          onChange={(e) => {
            setIl(e.target.value);
            setIlce("");
            setMahalle("");
          }}
          className={SECIM_SINIFI}
        >
          <option value="">Seçiniz</option>
          {ILLER.map((ad) => (
            <option key={ad} value={ad}>
              {ad}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}_ilce`}>İlçe</Label>
        <select
          id={`${prefix}_ilce`}
          name={`${prefix}_ilce`}
          value={ilce}
          disabled={disabled || !il}
          onChange={(e) => {
            setIlce(e.target.value);
            setMahalle("");
          }}
          className={SECIM_SINIFI}
        >
          <option value="">Seçiniz</option>
          {ilceler.map((ad) => (
            <option key={ad} value={ad}>
              {ad}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}_mahalle`}>Mahalle</Label>
        <select
          id={`${prefix}_mahalle`}
          name={`${prefix}_mahalle`}
          value={mahalle}
          disabled={disabled || !ilce}
          onChange={(e) => setMahalle(e.target.value)}
          className={SECIM_SINIFI}
        >
          <option value="">Seçiniz</option>
          {mahalleler.map((ad) => (
            <option key={ad} value={ad}>
              {ad}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

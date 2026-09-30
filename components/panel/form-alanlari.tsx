"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isimBasHarfBuyukYap } from "@/lib/utils";

/** Etiket + alan + ipucu. */
export function Alan({ etiket, htmlFor, ipucu, children }: { etiket: string; htmlFor: string; ipucu?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{etiket}</Label>
      {children}
      {ipucu && <p className="text-xs text-muted-foreground">{ipucu}</p>}
    </div>
  );
}

/**
 * İsim alanı: yazarken her kelimenin ilk harfi büyür (uzunluğu değiştirmediği için imleç zıplamaz).
 * Kayıtta sunucu `isimNormalle` ile yeniden doğrular. Açıklama alanlarında KULLANILMAZ.
 */
export function IsimGirdisi({
  id,
  name,
  varsayilan = "",
  ...rest
}: { id: string; name: string; varsayilan?: string } & Omit<React.ComponentProps<typeof Input>, "id" | "name" | "value" | "onChange" | "defaultValue">) {
  const [deger, setDeger] = useState(varsayilan);
  return <Input id={id} name={name} value={deger} onChange={(e) => setDeger(isimBasHarfBuyukYap(e.target.value))} autoComplete="off" {...rest} />;
}

export function OnayKutusu({ id, name, etiket, varsayilan = false, aciklama }: { id: string; name: string; etiket: string; varsayilan?: boolean; aciklama?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} name={name} type="checkbox" defaultChecked={varsayilan} className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary" />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="font-normal">
          {etiket}
        </Label>
        {aciklama && <p className="text-xs text-muted-foreground">{aciklama}</p>}
      </div>
    </div>
  );
}

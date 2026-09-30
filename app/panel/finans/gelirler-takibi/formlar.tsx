"use client";

import { useActionState } from "react";
import { EylemFormu } from "@/components/panel/eylem-formu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { faturaIptal, faturaOlustur } from "./actions";

export type FaturasizSatir = { id: string; aciklama: string | null; islem_tarihi: string; net_kurus: number };

/** Bir müşterinin faturalanmamış borç satırları: seçilenler tek faturada birleşir. */
export function FaturaOlusturFormu({ satirlar }: { satirlar: FaturasizSatir[] }) {
  return (
    <EylemFormu eylem={faturaOlustur} gonder="Faturalandır" boyut="sm" varyant="outline">
      <ul className="grid gap-1.5">
        {satirlar.map((s) => (
          <li key={s.id}>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name="hareket_idleri" value={s.id} defaultChecked className="size-4" />
              <span className="tabular-nums text-muted-foreground">{gunYazi(s.islem_tarihi)}</span>
              <span className="min-w-0 flex-1 truncate">{s.aciklama ?? "Borç"}</span>
              <span className="font-semibold tabular-nums">{kurusTLyazi(s.net_kurus)}</span>
            </label>
          </li>
        ))}
      </ul>
    </EylemFormu>
  );
}

export function FaturaIptalFormu({ faturaId }: { faturaId: string }) {
  const [durum, eylem, bekliyor] = useActionState(faturaIptal, null);
  return (
    <details>
      <summary className="cursor-pointer text-xs font-semibold text-destructive select-none">İptal et</summary>
      <form action={eylem} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="fatura_id" value={faturaId} />
        <Input name="neden" required minLength={3} maxLength={300} placeholder="İptal nedeni" aria-label="İptal nedeni" className="h-8 w-56" autoComplete="off" />
        <Button type="submit" size="sm" variant="destructive" disabled={bekliyor}>
          İptal Et
        </Button>
        {durum && !durum.success && <span className="basis-full text-xs font-medium text-destructive">{durum.message}</span>}
      </form>
    </details>
  );
}

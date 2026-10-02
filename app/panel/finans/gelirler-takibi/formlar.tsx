"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { faturaIptal } from "./actions";

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

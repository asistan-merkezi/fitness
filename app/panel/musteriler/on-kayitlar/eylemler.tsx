"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { onKayitOnayla, onKayitReddet } from "./actions";

/** Bekleyen ön kayıt için Müşteri Olarak Kaydet / Reddet. */
export function OnKayitEylemleri({ onKayitId }: { onKayitId: string }) {
  const [onayDurum, onayEylem, onayBekliyor] = useActionState(onKayitOnayla, null);
  const [redDurum, redEylem, redBekliyor] = useActionState(onKayitReddet, null);
  const mesaj = onayDurum ?? redDurum;

  return (
    <div className="flex flex-col gap-2 sm:w-72">
      <form action={onayEylem}>
        <input type="hidden" name="on_kayit_id" value={onKayitId} />
        <Button type="submit" size="sm" disabled={onayBekliyor || redBekliyor} className="w-full">
          {onayBekliyor ? "Kaydediliyor..." : "Müşteri Olarak Kaydet"}
        </Button>
      </form>
      <form action={redEylem} className="flex gap-2">
        <input type="hidden" name="on_kayit_id" value={onKayitId} />
        <Input name="red_nedeni" placeholder="Ret nedeni (isteğe bağlı)" maxLength={200} aria-label="Ret nedeni" className="h-8" autoComplete="off" />
        <Button type="submit" size="sm" variant="destructive" disabled={onayBekliyor || redBekliyor}>
          Reddet
        </Button>
      </form>
      {mesaj && (
        <p role={mesaj.success ? "status" : "alert"} className={mesaj.success ? "text-xs font-medium text-success" : "text-xs font-medium text-destructive"}>
          {mesaj.message}
        </p>
      )}
    </div>
  );
}

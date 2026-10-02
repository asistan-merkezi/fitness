"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isBasvurusuReddet } from "../actions";

/** Bekleyen başvuruyu olumsuz kapatır; not isteğe bağlıdır (iç kullanım, aday görmez). */
export function RedFormu({ basvuruId }: { basvuruId: string }) {
  const [durum, eylem, bekliyor] = useActionState(isBasvurusuReddet, null);
  return (
    <form action={eylem} className="flex w-full flex-col gap-2 sm:w-64">
      <input type="hidden" name="basvuru_id" value={basvuruId} />
      <Textarea name="not_metni" rows={1} maxLength={500} placeholder="İç not (isteğe bağlı)" aria-label="İç not" />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={bekliyor}
        onClick={(e) => {
          if (!window.confirm("Başvuru olumsuz olarak kapatılsın mı?")) e.preventDefault();
        }}
      >
        Olumsuz Kapat
      </Button>
      {durum && !durum.success && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {durum.message}
        </p>
      )}
    </form>
  );
}

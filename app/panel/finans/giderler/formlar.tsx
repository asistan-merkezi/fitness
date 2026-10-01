"use client";

import { useActionState, useState } from "react";
import { SecimKutusu } from "@/components/panel/eylem-formu";
import type { HesapSecenegi } from "@/components/panel/yontem-hesap-secimi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GIDER_YONTEMLERI } from "@/lib/panel/finans";
import { giderIptal, giderOde } from "./actions";

/** Bekleyen gider satırında: yöntem (ve hesap) seçip öde. */
export function GiderOdeFormu({ giderId, hesaplar }: { giderId: string; hesaplar: HesapSecenegi[] }) {
  const [durum, eylem, bekliyor] = useActionState(giderOde, null);
  const [yontem, setYontem] = useState("");
  return (
    <form action={eylem} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="gider_id" value={giderId} />
      <SecimKutusu name="yontem" required value={yontem} onChange={(e) => setYontem(e.target.value)} className="h-8 w-40" aria-label="Ödeme yöntemi">
        <option value="" disabled>
          Yöntem
        </option>
        {Object.entries(GIDER_YONTEMLERI).map(([k, e]) => (
          <option key={k} value={k}>
            {e}
          </option>
        ))}
      </SecimKutusu>
      {(yontem === "havale" || yontem === "kredi_karti") && hesaplar.length > 0 && (
        <SecimKutusu name="banka_hesap_id" defaultValue="" className="h-8 w-44" aria-label="Banka hesabı">
          <option value="">Hesap seçilmedi</option>
          {hesaplar.map((h) => (
            <option key={h.id} value={h.id}>
              {h.ad}
            </option>
          ))}
        </SecimKutusu>
      )}
      <Button type="submit" size="sm" disabled={bekliyor}>
        Öde
      </Button>
      {durum && !durum.success && <span className="basis-full text-xs font-medium text-destructive">{durum.message}</span>}
    </form>
  );
}

export function GiderIptalFormu({ giderId }: { giderId: string }) {
  const [durum, eylem, bekliyor] = useActionState(giderIptal, null);
  return (
    <details>
      <summary className="cursor-pointer text-xs font-semibold text-destructive select-none">İptal et</summary>
      <form action={eylem} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="gider_id" value={giderId} />
        <Input name="neden" required minLength={3} maxLength={300} placeholder="İptal nedeni" aria-label="İptal nedeni" className="h-8 w-56" autoComplete="off" />
        <Button type="submit" size="sm" variant="destructive" disabled={bekliyor}>
          İptal Et
        </Button>
        {durum && !durum.success && <span className="basis-full text-xs font-medium text-destructive">{durum.message}</span>}
      </form>
    </details>
  );
}

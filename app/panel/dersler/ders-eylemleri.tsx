"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type DersEylemi, DERS_EYLEM_ETIKETLERI } from "@/lib/panel/ders";
import { dersDurumuDegistir, dersTasi } from "./actions";

/** Ders satırındaki eylem düğmeleri. Hangi eylemlerin görüneceği sunucuda role/duruma göre belirlenir. */
export function DersEylemleri({ dersId, eylemler, tasimaBaslangici }: { dersId: string; eylemler: DersEylemi[]; tasimaBaslangici: string }) {
  const [durum, eylem, bekliyor] = useActionState(dersDurumuDegistir, null);
  const [tasiDurum, tasiEylem, tasiBekliyor] = useActionState(dersTasi, null);

  if (eylemler.length === 0) return null;

  const dogrudan = eylemler.filter((e): e is Exclude<DersEylemi, "gecikmeli_geldi" | "ertele"> => e !== "gecikmeli_geldi" && e !== "ertele");
  const mesaj = tasiDurum ?? durum;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {dogrudan.length > 0 && (
          <form action={eylem} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="ders_id" value={dersId} />
            {dogrudan.map((h) => (
              <Button
                key={h}
                type="submit"
                name="hedef"
                value={h}
                size="sm"
                variant={h === "iptal" ? "destructive" : h === "planlandi" || h === "gelmedi" ? "outline" : "default"}
                disabled={bekliyor}
                onClick={(e) => {
                  if (h === "iptal" && !window.confirm("Ders iptal edilsin mi?")) e.preventDefault();
                }}
              >
                {DERS_EYLEM_ETIKETLERI[h]}
              </Button>
            ))}
          </form>
        )}

        {eylemler.includes("gecikmeli_geldi") && (
          <details className="group">
            <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-lg border border-border px-3 text-sm font-medium select-none hover:bg-surface-3">{DERS_EYLEM_ETIKETLERI.gecikmeli_geldi}</summary>
            <form action={eylem} className="mt-2 flex items-end gap-2">
              <input type="hidden" name="ders_id" value={dersId} />
              <input type="hidden" name="hedef" value="gecikmeli_geldi" />
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Gecikme (dakika)
                <Input name="gecikme_dk" inputMode="numeric" required className="h-8 w-28" autoComplete="off" />
              </label>
              <Button type="submit" size="sm" disabled={bekliyor}>
                Kaydet
              </Button>
            </form>
          </details>
        )}

        {eylemler.includes("ertele") && (
          <details>
            <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-lg border border-border px-3 text-sm font-medium select-none hover:bg-surface-3">{DERS_EYLEM_ETIKETLERI.ertele}</summary>
            <form action={tasiEylem} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="ders_id" value={dersId} />
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Yeni tarih ve saat
                <Input name="baslangic" type="datetime-local" defaultValue={tasimaBaslangici} required className="h-8" />
              </label>
              <Button type="submit" size="sm" disabled={tasiBekliyor}>
                Taşı
              </Button>
            </form>
          </details>
        )}
      </div>

      {mesaj && (
        <p role={mesaj.success ? "status" : "alert"} className={mesaj.success ? "text-xs font-medium text-success" : "text-xs font-medium text-destructive"}>
          {mesaj.message}
        </p>
      )}
    </div>
  );
}

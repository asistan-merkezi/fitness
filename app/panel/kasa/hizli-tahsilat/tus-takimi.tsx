"use client";

import { useActionState, useState } from "react";
import { Banknote, CreditCard, Delete, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { kurusGirdiYazi, tusMetniGoster, tusUygula } from "@/lib/para";
import { cn } from "@/lib/utils";
import { hizliTahsilatKaydet } from "./actions";

const YONTEMLER = [
  { kod: "nakit", etiket: "Nakit", ikon: Banknote },
  { kod: "kredi_karti", etiket: "Kredi Kartı", ikon: CreditCard },
  { kod: "havale", etiket: "Havale/EFT", ikon: Landmark },
] as const;

const TUSLAR = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "sil", "0", ",00"] as const;

/** Tutar tuş takımı + ödeme yöntemi + kaydet. Tutar sunucuda yeniden doğrulanır; kayıt idempotent anahtarla gider. */
export function TusTakimi({ musteriId, borcKurus }: { musteriId: string; borcKurus: number }) {
  const [tutar, setTutar] = useState("");
  const [yontem, setYontem] = useState<(typeof YONTEMLER)[number]["kod"]>("kredi_karti");
  const [anahtar] = useState(() => crypto.randomUUID());
  const [durum, eylem, bekliyor] = useActionState(hizliTahsilatKaydet, null);

  const sifir = tutar === "" || /^0*(,0*)?$/.test(tutar);

  return (
    <form action={eylem} className="flex flex-col gap-4">
      <input type="hidden" name="musteri_id" value={musteriId} />
      <input type="hidden" name="tutar" value={tutar || "0"} />
      <input type="hidden" name="yontem" value={yontem} />
      <input type="hidden" name="anahtar" value={anahtar} suppressHydrationWarning />

      <div className="rounded-lg bg-background p-4 text-center" aria-live="polite">
        <p className="text-etiket text-muted-foreground">Tahsil edilecek tutar</p>
        <p className="text-metric mt-1 text-[2.5rem] leading-[3rem]">
          {tusMetniGoster(tutar)} <span className="text-primary">₺</span>
        </p>
        {borcKurus > 0 && (
          <button type="button" onClick={() => setTutar(kurusGirdiYazi(borcKurus))} className="mt-2 text-xs font-semibold text-primary hover:underline">
            Borcun tamamı: {kurusGirdiYazi(borcKurus)} ₺
          </button>
        )}
      </div>

      <div role="radiogroup" aria-label="Ödeme yöntemi" className="grid grid-cols-3 gap-2">
        {YONTEMLER.map(({ kod, etiket, ikon: Ikon }) => (
          <button
            key={kod}
            type="button"
            role="radio"
            aria-checked={yontem === kod}
            onClick={() => setYontem(kod)}
            className={cn(
              "flex min-h-12 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-semibold transition-colors",
              yontem === kod ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2 text-foreground hover:bg-surface-3"
            )}
          >
            <Ikon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            {etiket}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tuş takımı">
        {TUSLAR.map((tus) => (
          <button
            key={tus}
            type="button"
            onClick={() => setTutar((m) => tusUygula(m, tus))}
            aria-label={tus === "sil" ? "Sil" : tus}
            className={cn(
              "flex h-14 items-center justify-center rounded-lg text-xl font-semibold tabular-nums transition-colors active:translate-y-px",
              tus === "sil" ? "bg-destructive-soft text-destructive hover:bg-[color-mix(in_srgb,var(--destructive)_20%,transparent)]" : "bg-surface-2 hover:bg-surface-3"
            )}
          >
            {tus === "sil" ? <Delete className="size-6" strokeWidth={1.5} aria-hidden /> : tus}
          </button>
        ))}
      </div>

      {durum && !durum.success && (
        <p role="alert" className="rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
          {durum.message}
        </p>
      )}

      <Button type="submit" size="lg" disabled={bekliyor || sifir} className="w-full text-base font-bold">
        {bekliyor ? "Kaydediliyor..." : "Ödemeyi Kaydet"}
      </Button>
    </form>
  );
}

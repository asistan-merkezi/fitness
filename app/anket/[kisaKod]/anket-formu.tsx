"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Star } from "lucide-react";
import { Alan, IsimGirdisi } from "@/components/panel/form-alanlari";
import { Button } from "@/components/ui/button";
import { TelefonGirisi } from "@/components/ui/telefon-girisi";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { anketGonder } from "./actions";

const ETIKETLER = ["Çok kötü", "Kötü", "İdare eder", "İyi", "Çok iyi"];

export function AnketFormu({ kisaKod }: { kisaKod: string }) {
  const [durum, eylem, bekliyor] = useActionState(anketGonder, null);
  const [puan, setPuan] = useState(0);

  if (durum?.success) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-10 text-success" strokeWidth={1.5} aria-hidden />
        <p className="font-semibold">{durum.message}</p>
        <p className="text-sm text-muted-foreground">Bu sayfayı kapatabilirsiniz.</p>
      </div>
    );
  }

  return (
    <form action={eylem} className="flex flex-col gap-4">
      <input type="hidden" name="kisa_kod" value={kisaKod} />
      <input type="hidden" name="puan" value={puan || ""} />
      <div className="absolute -left-[9999px] size-px overflow-hidden" aria-hidden>
        <label htmlFor="an_website">Web sitesi</label>
        <input id="an_website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Genel memnuniyetiniz</legend>
        <div className="flex justify-between gap-1" role="radiogroup" aria-label="Memnuniyet puanı">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={puan === n}
              aria-label={`${n} puan: ${ETIKETLER[n - 1]}`}
              onClick={() => setPuan(n)}
              className="flex size-12 items-center justify-center rounded-lg border border-border bg-surface-2 transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Star className={cn("size-7", n <= puan ? "fill-primary text-primary" : "text-muted-foreground")} strokeWidth={1.5} aria-hidden />
            </button>
          ))}
        </div>
        <p className="h-4 text-center text-xs text-muted-foreground">{puan ? ETIKETLER[puan - 1] : "Bir puan seçin"}</p>
      </fieldset>

      <Alan etiket="Öneri veya yorumunuz (isteğe bağlı)" htmlFor="an_oneri">
        <Textarea id="an_oneri" name="oneri" rows={4} maxLength={1000} disabled={bekliyor} />
      </Alan>
      <details className="rounded-lg border border-border bg-surface p-3">
        <summary className="cursor-pointer text-sm font-medium select-none">Bize ulaşmamızı istiyorsanız (isteğe bağlı)</summary>
        <div className="mt-3 flex flex-col gap-3">
          <Alan etiket="Ad soyad" htmlFor="an_ad">
            <IsimGirdisi id="an_ad" name="ad_soyad" disabled={bekliyor} />
          </Alan>
          <TelefonGirisi ad="telefon" label="Telefon" disabled={bekliyor} />
        </div>
      </details>

      {durum && !durum.success && (
        <p role="alert" className="rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
          {durum.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={bekliyor || puan === 0} className="w-full">
        {bekliyor ? "Gönderiliyor..." : "Gönder"}
      </Button>
    </form>
  );
}

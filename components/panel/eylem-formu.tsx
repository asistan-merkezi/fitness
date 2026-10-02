"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { EylemSonucu } from "@/lib/eylem";
import { cn } from "@/lib/utils";

type Eylem = (onceki: EylemSonucu | null, formData: FormData) => Promise<EylemSonucu | null>;

/**
 * Server action formu: sonuç mesajı, yükleniyor durumu ve (istenirse) idempotency anahtarı.
 * `anahtarli`: her gönderimde tek kullanımlık UUID gönderilir; başarıdan sonra sunucu yenisini döndürür.
 * `onay`: geri dönüşsüz işlemlerde tarayıcı onay sorusu.
 * `basariliOlunca`: islem basariyla bitince bir kez cagrilir (or. icinde bulundugu pencereyi kapatmak icin).
 */
export function EylemFormu({
  eylem,
  children,
  gonder,
  yukleniyor = "Kaydediliyor...",
  anahtarli = false,
  onay,
  varyant = "default",
  boyut = "default",
  className,
  gonderSinifi,
  basariliOlunca,
}: {
  eylem: Eylem;
  children?: React.ReactNode;
  gonder: string;
  yukleniyor?: string;
  anahtarli?: boolean;
  onay?: string;
  varyant?: "default" | "outline" | "destructive" | "secondary";
  boyut?: "default" | "sm" | "lg";
  className?: string;
  gonderSinifi?: string;
  basariliOlunca?: () => void;
}) {
  const [durum, formAction, bekliyor] = useActionState(eylem, null);
  const [ilkAnahtar] = useState(() => crypto.randomUUID());
  const [gorulen, setGorulen] = useState(durum);
  if (durum !== gorulen) {
    setGorulen(durum);
    if (durum?.success) basariliOlunca?.();
  }

  return (
    <form
      action={formAction}
      className={cn("flex flex-col gap-3", className)}
      onSubmit={(e) => {
        if (onay && !window.confirm(onay)) e.preventDefault();
      }}
    >
      {/* Anahtar sunucuda ve istemcide ayrı üretilir; fark kasıtlıdır (her sayfa yüklemesi tek kullanımlık bir anahtar taşır). */}
      {anahtarli && <input type="hidden" name="anahtar" value={durum?.anahtar ?? ilkAnahtar} suppressHydrationWarning />}
      {children}
      {durum && (
        <p
          role={durum.success ? "status" : "alert"}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm font-medium",
            durum.success ? "border-success-border bg-success-soft text-success" : "border-destructive-border bg-destructive-soft text-destructive"
          )}
        >
          {durum.message}
        </p>
      )}
      <Button type="submit" variant={varyant} size={boyut} disabled={bekliyor} className={gonderSinifi}>
        {bekliyor ? yukleniyor : gonder}
      </Button>
    </form>
  );
}

/** Native select: FormData ile sorunsuz çalışır, erişilebilir ve hafiftir. */
export function SecimKutusu({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-input-bg px-3 text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

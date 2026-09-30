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
 */
export function EylemFormu({
  eylem,
  children,
  gonder,
  yukleniyor = "Kaydediliyor...",
  anahtarli = false,
  onay,
  varyant = "default",
  className,
  gonderSinifi,
}: {
  eylem: Eylem;
  children?: React.ReactNode;
  gonder: string;
  yukleniyor?: string;
  anahtarli?: boolean;
  onay?: string;
  varyant?: "default" | "outline" | "destructive" | "secondary";
  className?: string;
  gonderSinifi?: string;
}) {
  const [durum, formAction, bekliyor] = useActionState(eylem, null);
  const [ilkAnahtar] = useState(() => crypto.randomUUID());

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
        <p role={durum.success ? "status" : "alert"} className={cn("text-sm", durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
          {durum.message}
        </p>
      )}
      <Button type="submit" variant={varyant} disabled={bekliyor} className={gonderSinifi}>
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
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15 disabled:opacity-50 dark:bg-input/30",
        className
      )}
      {...props}
    />
  );
}

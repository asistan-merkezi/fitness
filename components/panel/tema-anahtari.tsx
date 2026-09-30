"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const bosAbone = () => () => {};
/** İstemcide true, sunucuda/hidrasyonda false: tema seçimi tarayıcıdan okunduğu için ilk çizimde varsayılan (koyu) gösterilir. */
function useMounted() {
  return useSyncExternalStore(bosAbone, () => true, () => false);
}

/** Üst çubuk/kenar çubuğu anahtarı: koyu ↔ açık. Etiket, TIKLANINCA geçilecek temayı söyler. */
export function TemaDugmesi({ etiketGoster = true, className }: { etiketGoster?: boolean; className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const koyu = !mounted || resolvedTheme !== "light";
  const Ikon = koyu ? Sun : Moon;
  const etiket = koyu ? "Açık Yap" : "Koyu Yap";

  return (
    <button
      type="button"
      onClick={() => setTheme(koyu ? "light" : "dark")}
      aria-label={koyu ? "Açık temaya geç" : "Koyu temaya geç"}
      title={koyu ? "Açık temaya geç" : "Koyu temaya geç"}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-3",
        !etiketGoster && "size-9 px-0",
        className
      )}
    >
      <Ikon className="size-4 text-primary" strokeWidth={1.5} aria-hidden />
      {etiketGoster && <span>{etiket}</span>}
    </button>
  );
}

const SECENEKLER = [
  { deger: "dark", etiket: "Koyu", ikon: Moon },
  { deger: "light", etiket: "Açık", ikon: Sun },
  { deger: "system", etiket: "Sistem", ikon: Monitor },
] as const;

/** Mobil "Daha Fazla > Görünüm": Koyu | Açık | Sistem segmentli seçici. */
export function TemaSecici({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const secili = mounted ? (theme ?? "dark") : "dark";

  return (
    <div role="radiogroup" aria-label="Uygulama teması" className={cn("inline-flex rounded-lg border border-border bg-surface p-0.5", className)}>
      {SECENEKLER.map(({ deger, etiket, ikon: Ikon }) => (
        <button
          key={deger}
          type="button"
          role="radio"
          aria-checked={secili === deger}
          onClick={() => setTheme(deger)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
            secili === deger ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Ikon className="size-4" strokeWidth={1.5} aria-hidden />
          {etiket}
        </button>
      ))}
    </div>
  );
}

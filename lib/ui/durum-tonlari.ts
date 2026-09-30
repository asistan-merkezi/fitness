/**
 * StatusBadge'in TEK renk kaynağı (DESIGN.md "Status Chips"). Semantik durum renkleri:
 *   Aktif = emerald, Dondurulmuş = sky, Başlamadı = amber, Sona Erdi = slate, İptal = rose.
 * Hap zemini durum renginin %12'si, metin ve nokta durum rengi (açık temada daha koyu ton: AA kontrast).
 * Tonlar (emerald/sky/amber/slate/rose) sayfalarda doğrudan durumlara eşlenir; `primary` marka vurgusudur;
 * `teal`/`indigo` eski adlar olarak emerald/sky'a yönlenir.
 */
export type StatusTone = "emerald" | "amber" | "teal" | "rose" | "indigo" | "sky" | "slate" | "primary";

const EMERALD = "bg-emerald-600/12 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-400";
const SKY = "bg-sky-600/12 text-sky-700 dark:bg-sky-500/12 dark:text-sky-400";
const AMBER = "bg-amber-600/14 text-amber-700 dark:bg-amber-500/12 dark:text-amber-400";
const ROSE = "bg-rose-600/12 text-rose-700 dark:bg-rose-500/12 dark:text-rose-400";
const SLATE = "bg-slate-500/14 text-slate-600 dark:bg-slate-500/12 dark:text-slate-400";
const PRIMARY = "bg-primary/14 text-primary";

export const DURUM_TONU_SINIFLARI: Record<StatusTone, string> = {
  emerald: EMERALD,
  teal: EMERALD,
  sky: SKY,
  indigo: SKY,
  amber: AMBER,
  rose: ROSE,
  slate: SLATE,
  primary: PRIMARY,
};

/** Sol taraftaki 6px durum noktasının rengi. */
export const DURUM_NOKTA_RENGI: Record<StatusTone, string> = {
  emerald: "bg-emerald-600 dark:bg-emerald-500",
  teal: "bg-emerald-600 dark:bg-emerald-500",
  sky: "bg-sky-600 dark:bg-sky-500",
  indigo: "bg-sky-600 dark:bg-sky-500",
  amber: "bg-amber-600 dark:bg-amber-500",
  rose: "bg-rose-600 dark:bg-rose-500",
  slate: "bg-slate-500",
  primary: "bg-primary",
};

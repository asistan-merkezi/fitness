import { MarkaIsareti } from "@/components/marka/logo";

/**
 * İşletmenin yüklediği logo: açık temada `logoUrl`, koyu temada `logoUrlKoyu` gösterilir; biri eksikse diğeri iki temada da kullanılır.
 * Hiç logo yoksa Fitness Asistanı işareti gösterilir.
 */
export function IsletmeLogosu({ logoUrl, logoUrlKoyu, boyut = 32 }: { logoUrl: string | null; logoUrlKoyu: string | null; boyut?: number }) {
  if (!logoUrl && !logoUrlKoyu) return <MarkaIsareti boyut={boyut} />;
  const acik = logoUrl ?? logoUrlKoyu ?? "";
  const koyu = logoUrlKoyu ?? logoUrl ?? "";
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ width: boyut, height: boyut }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={acik} alt="İşletme logosu" className="size-full object-contain dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={koyu} alt="" aria-hidden className="hidden size-full object-contain dark:block" />
    </span>
  );
}

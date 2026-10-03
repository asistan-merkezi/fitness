import { redirect } from "next/navigation";
import { IZIN_TAKIBI_YOLU } from "@/lib/panel/izin-yollari";

/** Eski adres: izin talepleri artık Puantaj > İzin / Rapor Takibi'nde. */
export default async function EskiIzinTalepleriSayfasi({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  const { durum } = await searchParams;
  redirect(durum ? `${IZIN_TAKIBI_YOLU}?durum=${encodeURIComponent(durum)}` : IZIN_TAKIBI_YOLU);
}

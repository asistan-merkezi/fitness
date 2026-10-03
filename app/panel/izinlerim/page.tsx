import { redirect } from "next/navigation";
import { IZIN_TALEBI_YOLU } from "@/lib/panel/izin-yollari";

/** Eski adres (yer imi/bildirim bağlantıları için): izinler artık Puantaj'ın altında. */
export default function EskiIzinlerimSayfasi() {
  redirect(IZIN_TALEBI_YOLU);
}

import { redirect } from "next/navigation";

/** Eski adres: Şirket Bilgileri sayfasına taşındı. */
export default function EskiIsletmeSayfasi() {
  redirect("/panel/ayarlar/sirket-bilgileri");
}

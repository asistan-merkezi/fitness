import { redirect } from "next/navigation";

/** Eski adres: Donanım sayfasına taşındı. */
export default function EskiAlanlarSayfasi() {
  redirect("/panel/yonetim/donanim");
}

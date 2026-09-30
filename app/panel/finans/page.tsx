import type { Metadata } from "next";
import { MenuGrubuSayfasi } from "@/components/panel/menu-grubu-sayfasi";

export const metadata: Metadata = { title: "Finans" };

export default function FinansSayfasi() {
  return <MenuGrubuSayfasi anahtar="finans" />;
}

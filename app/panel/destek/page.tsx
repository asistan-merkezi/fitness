import type { Metadata } from "next";
import { MenuGrubuSayfasi } from "@/components/panel/menu-grubu-sayfasi";

export const metadata: Metadata = { title: "Destek" };

export default function DestekSayfasi() {
  return <MenuGrubuSayfasi anahtar="destek" />;
}

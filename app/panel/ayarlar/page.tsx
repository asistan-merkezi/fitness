import type { Metadata } from "next";
import { MenuGrubuSayfasi } from "@/components/panel/menu-grubu-sayfasi";

export const metadata: Metadata = { title: "Ayarlar" };

export default function AyarlarSayfasi() {
  return <MenuGrubuSayfasi anahtar="ayarlar" />;
}

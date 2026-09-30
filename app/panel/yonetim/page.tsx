import type { Metadata } from "next";
import { MenuGrubuSayfasi } from "@/components/panel/menu-grubu-sayfasi";

export const metadata: Metadata = { title: "Yönetim" };

export default function YonetimSayfasi() {
  return <MenuGrubuSayfasi anahtar="yonetim" />;
}

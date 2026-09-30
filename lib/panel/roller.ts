import type { KullaniciRolu } from "@/lib/auth/gecerli-kullanici";

/** Panel rol kümeleri (asıl zorlama RLS/RPC'dedir; bunlar sayfa kapısı ve menü içindir). */
export const MUSTERI_ROLLERI = ["isletme_admin", "resepsiyon"] as const satisfies readonly KullaniciRolu[];
export const FINANS_ROLLERI = ["isletme_admin", "resepsiyon", "muhasebe"] as const satisfies readonly KullaniciRolu[];
export const PAKET_GORUNTULEME_ROLLERI = ["isletme_admin", "resepsiyon", "muhasebe"] as const satisfies readonly KullaniciRolu[];
export const YONETICI_ROLLERI = ["isletme_admin"] as const satisfies readonly KullaniciRolu[];

export const ROL_ETIKETLERI: Record<KullaniciRolu, string> = {
  super_admin: "Platform Yöneticisi",
  isletme_admin: "İşletme Yöneticisi",
  resepsiyon: "Resepsiyon",
  antrenor: "Antrenör",
  muhasebe: "Muhasebe",
};

export type MenuOgesi = { href: string; etiket: string; roller: readonly KullaniciRolu[] };

export const MENU: readonly MenuOgesi[] = [
  { href: "/panel", etiket: "Panel", roller: ["isletme_admin", "resepsiyon", "muhasebe", "antrenor"] },
  { href: "/panel/check-in", etiket: "Check-in", roller: MUSTERI_ROLLERI },
  { href: "/panel/musteriler", etiket: "Müşteriler", roller: MUSTERI_ROLLERI },
  { href: "/panel/uyelik-paketleri", etiket: "Üyelik Paketleri", roller: PAKET_GORUNTULEME_ROLLERI },
  { href: "/panel/kasa", etiket: "Kasa ve Cari", roller: FINANS_ROLLERI },
  { href: "/panel/ayarlar/personel", etiket: "Personel", roller: YONETICI_ROLLERI },
];

export function menuIcinRol(rol: KullaniciRolu | null | undefined): MenuOgesi[] {
  if (!rol) return [];
  return MENU.filter((m) => m.roller.includes(rol) || rol === "super_admin");
}

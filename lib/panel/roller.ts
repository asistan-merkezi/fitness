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
/** Personel maaş/hakediş: yönetim + muhasebe (resepsiyon göremez). */
export const FINANS_YONETIM_ROLLERI = ["isletme_admin", "muhasebe"] as const satisfies readonly KullaniciRolu[];

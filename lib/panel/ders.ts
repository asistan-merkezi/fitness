import type { KullaniciRolu } from "@/lib/auth/gecerli-kullanici";
import type { DersDurumu } from "@/types/veritabani";

/** Bir dersin satırında gösterilebilecek eylemler. `ertele` durum değil, taşıma işlemidir. */
export type DersEylemi = "geldi" | "gecikmeli_geldi" | "derste" | "tamamlandi" | "gelmedi" | "iptal" | "planlandi" | "ertele";

export const DERS_EYLEM_ETIKETLERI: Record<DersEylemi, string> = {
  geldi: "Geldi",
  gecikmeli_geldi: "Gecikmeli Geldi",
  derste: "Derse Başla",
  tamamlandi: "Tamamlandı",
  gelmedi: "Gelmedi",
  iptal: "İptal Et",
  planlandi: "Geri Al (Planlandı)",
  ertele: "Ertele",
};

/**
 * Role ve dersin mevcut durumuna göre gösterilecek eylemler (yalnız arayüz; asıl kural `ders_seansi_durum` RPC'sindedir).
 *  - Resepsiyon/yönetici: her durumdan düzeltme yapabilir.
 *  - Antrenör: yalnız KENDİ dersinde derse başla / tamamla.
 *  - Muhasebe: hiçbiri.
 */
export function dersEylemleri(durum: DersDurumu, rol: KullaniciRolu | null | undefined, antrenorBenMi: boolean): DersEylemi[] {
  if (rol === "super_admin" || rol === "isletme_admin" || rol === "resepsiyon") {
    switch (durum) {
      case "planlandi":
      case "ertelendi":
        return ["geldi", "gecikmeli_geldi", "gelmedi", "ertele", "iptal"];
      case "geldi":
      case "gecikmeli_geldi":
        return ["derste", "tamamlandi", "planlandi"];
      case "derste":
        return ["tamamlandi", "planlandi"];
      case "tamamlandi":
      case "gelmedi":
      case "iptal":
        return ["planlandi"];
    }
  }
  if (rol === "antrenor" && antrenorBenMi) {
    if (durum === "iptal" || durum === "gelmedi" || durum === "tamamlandi") return [];
    return durum === "derste" ? ["tamamlandi"] : ["derste", "tamamlandi"];
  }
  return [];
}

/** RPC sonucunu kullanıcıya gösterilecek cümleye çevirir. */
export function dersSonucMesaji(sonuc: { yontem?: string | null; kalan_hak?: number | null; tutar_kurus?: number | null } | null, tutarYazi: (kurus: number) => string): string {
  switch (sonuc?.yontem) {
    case "hak":
      return `Ders hakkından 1 düşüldü (kalan: ${sonuc.kalan_hak ?? 0}).`;
    case "borc":
      return `${tutarYazi(sonuc.tutar_kurus ?? 0)} ders ücreti cariye borç yazıldı.`;
    case "yok":
      return "Durum güncellendi (ders paketi ve ücret olmadığı için hak/borç işlenmedi).";
    case "geri_verildi":
      return "Durum güncellendi, ders hakkı geri verildi.";
    default:
      return "Durum güncellendi.";
  }
}

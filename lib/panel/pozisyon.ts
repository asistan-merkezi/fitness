import type { KullaniciRolu } from "@/lib/auth/gecerli-kullanici";

export type UcretTipi = "aylik_maas" | "maas_ve_prim";
export type PuantajModu = "gunluk" | "esnek" | "takipsiz";

export const UCRET_TIPI_ETIKETLERI: Record<UcretTipi, string> = {
  aylik_maas: "Aylık maaş",
  maas_ve_prim: "Maaş + ders primi",
};

export const PUANTAJ_MODU_ETIKETLERI: Record<PuantajModu, string> = {
  gunluk: "Günlük puantaj",
  esnek: "Esnek (saat takibi yok)",
  takipsiz: "Puantaj takipsiz",
};

export type Pozisyon = {
  id: string;
  ad: string;
  grup: string;
  sira: number;
  aktif: boolean;
  sistem_erisimi: boolean;
  varsayilan_rol: Exclude<KullaniciRolu, "super_admin">;
  ucret_tipi: UcretTipi;
  puantaj_modu: PuantajModu;
  ozel_mi: boolean;
};

export const POZISYON_SELECT = "id, ad, grup, sira, aktif, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu, ozel_mi";

/** Pozisyonları departmana (grup) göre toplar; departman sırası, içindeki en küçük sıraya göredir. */
export function pozisyonGruplari(pozisyonlar: Pozisyon[]): { grup: string; pozisyonlar: Pozisyon[] }[] {
  const gruplar = new Map<string, Pozisyon[]>();
  for (const p of pozisyonlar) gruplar.set(p.grup, [...(gruplar.get(p.grup) ?? []), p]);
  return [...gruplar.entries()]
    .map(([grup, liste]) => ({ grup, pozisyonlar: [...liste].sort((a, b) => a.sira - b.sira || a.ad.localeCompare(b.ad, "tr")) }))
    .sort((a, b) => a.pozisyonlar[0].sira - b.pozisyonlar[0].sira);
}

/** Hesap atanabilecek pozisyonlar: aktif ve sistem erişimi açık (mevcut atamayı korumak için `dahilId` her durumda listelenir). */
export function atanabilirPozisyonlar(pozisyonlar: Pozisyon[], dahilId?: string | null): Pozisyon[] {
  return pozisyonlar.filter((p) => (p.aktif && p.sistem_erisimi) || p.id === dahilId);
}

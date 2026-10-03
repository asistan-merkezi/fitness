/**
 * Personel "Ödeme Ekle" kategorileri (klinikle aynı): Maaş, Diğer Ödeme, Avans, Prim, Yol, Yemek, Fazla Mesai, Kesinti.
 * "Maaş" ayrı bir defter türü DEĞİLDİR: `odeme` olarak yazılır (hakediş yalnız dönem kapanışından gelir), yalnız tutar önerisi/açıklaması farklıdır.
 * Hesap sekmesindeki ve personel kartındaki "Ödeme Ekle" penceresi bu eşlemeyi paylaşır.
 */
export type OdemeKategori = "maas" | "odeme" | "avans" | "prim" | "yol" | "yemek" | "mesai" | "kesinti";

export const ODEME_KATEGORI_ETIKET: Record<OdemeKategori, string> = {
  maas: "Maaş",
  odeme: "Diğer Ödeme",
  avans: "Avans",
  prim: "Prim",
  yol: "Yol",
  yemek: "Yemek",
  mesai: "Fazla Mesai",
  kesinti: "Kesinti",
};

/** Defterdeki `tur` karşılığı (prim: dönem kapanışının `prim` satırından ayrı, elle girilen `prim_manuel`). */
export const ODEME_KATEGORI_TUR: Record<OdemeKategori, ManuelHareketTuru> = {
  maas: "odeme",
  odeme: "odeme",
  avans: "avans",
  prim: "prim_manuel",
  yol: "yol",
  yemek: "yemek",
  mesai: "mesai",
  kesinti: "kesinti",
};

export const MANUEL_HAREKET_TURLERI = ["odeme", "avans", "prim_manuel", "yol", "yemek", "mesai", "kesinti"] as const;
export type ManuelHareketTuru = (typeof MANUEL_HAREKET_TURLERI)[number];

/** Yalnız bu türlerde para kasa/bankadan çıkar: ödeme tipi (nakit/havale) ve banka hesabı yalnız bunlarda sorulur. */
export const ODEME_YONTEMLI_TURLER: readonly string[] = ["odeme", "avans"];

/** Bakiyeyi ARTIRAN (personelin alacağı) defter türleri; diğerleri (ödeme, avans, kesinti) azaltır. */
export const HAKEDIS_ARTIRAN_TURLER: readonly string[] = ["hakedis", "prim", "prim_manuel", "yol", "yemek", "mesai"];
export const hakedisArtirirMi = (tur: string) => HAKEDIS_ARTIRAN_TURLER.includes(tur);

export const PERSONEL_ODEME_YONTEMLERI = { nakit: "Nakit", havale: "Havale" } as const;

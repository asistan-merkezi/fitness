import { describe, expect, it } from "vitest";
import { dersEylemleri, dersSonucMesaji } from "./ders";

describe("dersEylemleri", () => {
  it("resepsiyon planlı dersi işaretler, erteler, iptal eder", () => {
    expect(dersEylemleri("planlandi", "resepsiyon", false)).toEqual(["geldi", "gecikmeli_geldi", "gelmedi", "ertele", "iptal"]);
    expect(dersEylemleri("ertelendi", "isletme_admin", false)).toContain("ertele");
  });

  it("geldi/derste dersler ilerletilir veya geri alınır; bitmiş/iptal dersler yalnız geri alınır", () => {
    expect(dersEylemleri("geldi", "resepsiyon", false)).toEqual(["derste", "tamamlandi", "planlandi"]);
    expect(dersEylemleri("derste", "resepsiyon", false)).toEqual(["tamamlandi", "planlandi"]);
    for (const d of ["tamamlandi", "gelmedi", "iptal"] as const) expect(dersEylemleri(d, "resepsiyon", false)).toEqual(["planlandi"]);
  });

  it("antrenör yalnız kendi dersinde başlatır/tamamlar", () => {
    expect(dersEylemleri("planlandi", "antrenor", true)).toEqual(["derste", "tamamlandi"]);
    expect(dersEylemleri("derste", "antrenor", true)).toEqual(["tamamlandi"]);
    expect(dersEylemleri("tamamlandi", "antrenor", true)).toEqual([]);
    expect(dersEylemleri("planlandi", "antrenor", false)).toEqual([]);
  });

  it("muhasebe ve rolsüz kullanıcı eylem göremez", () => {
    expect(dersEylemleri("planlandi", "muhasebe", false)).toEqual([]);
    expect(dersEylemleri("planlandi", null, false)).toEqual([]);
  });
});

describe("dersSonucMesaji", () => {
  const tl = (k: number) => `${k / 100} TL`;
  it("hak, borç, ücretsiz ve geri verme mesajları", () => {
    expect(dersSonucMesaji({ yontem: "hak", kalan_hak: 4 }, tl)).toBe("Ders hakkından 1 düşüldü (kalan: 4).");
    expect(dersSonucMesaji({ yontem: "borc", tutar_kurus: 75000 }, tl)).toBe("750 TL ders ücreti cariye borç yazıldı.");
    expect(dersSonucMesaji({ yontem: "yok" }, tl)).toMatch(/işlenmedi/);
    expect(dersSonucMesaji({ yontem: "geri_verildi" }, tl)).toMatch(/geri verildi/);
    expect(dersSonucMesaji(null, tl)).toBe("Durum güncellendi.");
  });
});

import { describe, expect, it } from "vitest";
import { alanEtiketi, denetimOzeti, tabloGrubu } from "./denetim";

describe("denetim gösterimi", () => {
  it("tabloları gruba çözer, bilinmeyeni diğere atar", () => {
    expect(tabloGrubu("musteri_bakiye_hareket")).toBe("finans");
    expect(tabloGrubu("musteri_hassas")).toBe("musteri");
    expect(tabloGrubu("giris_kaydi")).toBe("uyelik");
    expect(tabloGrubu("kullanici")).toBe("diger");
    expect(tabloGrubu("yeni_tablo")).toBe("diger");
  });

  it("alan adlarını okunur yapar", () => {
    expect(alanEtiketi("tutar_kurus")).toBe("tutar");
    expect(alanEtiketi("yeni_bir_alan")).toBe("yeni bir alan");
  });

  it("özet üretir", () => {
    expect(denetimOzeti("uyelik", ["bitis_tarihi", "kalan_hak"])).toBe("Üyelik · bitiş tarihi, kalan hak");
    expect(denetimOzeti("musteri", null)).toBe("Müşteri bilgisi");
    expect(denetimOzeti("musteri", [])).toBe("Müşteri bilgisi");
  });
});

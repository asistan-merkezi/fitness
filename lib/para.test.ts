import { describe, expect, it } from "vitest";
import { kurusGirdiYazi, kurusTLyazi, tlYaziKurusa, tusMetniGoster, tusUygula } from "./para";

describe("tlYaziKurusa", () => {
  it.each([
    ["1250", 125_000],
    ["1250,5", 125_050],
    ["1.250,50", 125_050],
    ["1250.50", 125_050],
    ["₺ 1.250,50", 125_050],
    ["1.250", 125_000], // 3 hane = binlik
    ["0,99", 99],
    [",5", 50],
    ["10 TL", 1_000],
    ["1.234.567,89", 123_456_789],
  ])("%j -> %j kuruş", (girdi, beklenen) => {
    expect(tlYaziKurusa(girdi)).toBe(beklenen);
  });

  it.each([[""], ["abc"], ["-5"], ["1,2,3"], ["1,234"], [null], [undefined], ["12,"], ["1e5"]])("%j geçersiz", (girdi) => {
    // "12," boş kesir → tam sayı 12,00 olarak kabul edilmez
    expect(tlYaziKurusa(girdi as string | null | undefined)).toBe(girdi === "12," ? 1_200 : null);
  });

  it("kayan nokta hatası üretmez (0,29 * 100 = 28.999…)", () => {
    expect(tlYaziKurusa("0,29")).toBe(29);
    expect(tlYaziKurusa("19,99")).toBe(1_999);
  });
});

describe("kurusTLyazi", () => {
  it("tr-TR para biçimi", () => {
    expect(kurusTLyazi(125_050)).toBe("1.250,50 ₺");
    expect(kurusTLyazi(0)).toBe("0,00 ₺");
    expect(kurusTLyazi(99)).toBe("0,99 ₺");
    expect(kurusTLyazi(123_456_789)).toBe("1.234.567,89 ₺");
  });
  it("bigint/string ve boş değerler", () => {
    expect(kurusTLyazi(BigInt(100))).toBe("1,00 ₺");
    expect(kurusTLyazi("250")).toMatch(/2,50/);
    expect(kurusTLyazi(null)).toBe("—");
    expect(kurusTLyazi(undefined)).toBe("—");
  });
});

describe("kurusGirdiYazi", () => {
  it("forma geri doldurma; tlYaziKurusa ile gidiş-dönüş", () => {
    expect(kurusGirdiYazi(125_050)).toBe("1250,50");
    expect(kurusGirdiYazi(5)).toBe("0,05");
    expect(kurusGirdiYazi(0)).toBe("0,00");
    expect(kurusGirdiYazi(null)).toBe("");
    for (const k of [0, 1, 99, 100, 123_456, 99_999_999]) {
      expect(tlYaziKurusa(kurusGirdiYazi(k))).toBe(k);
    }
  });
});

describe("tusUygula / tusMetniGoster (tahsilat tuş takımı)", () => {
  const yaz = (...tuslar: string[]) => tuslar.reduce((m, t) => tusUygula(m, t), "");

  it("rakamlar, virgül ve ,00", () => {
    expect(yaz("1", "2", "5", "0")).toBe("1250");
    expect(yaz("1", ",", "5")).toBe("1,5");
    expect(yaz(",", "5")).toBe("0,5");
    expect(yaz("4", "5", "0", ",00")).toBe("450,00");
  });
  it("kurallar: tek virgül, en çok 2 kuruş hanesi, en çok 9 tam hane, baştaki sıfır", () => {
    expect(yaz("1", ",", "5", ",")).toBe("1,5");
    expect(yaz("1", ",", "2", "5", "9")).toBe("1,25");
    expect(yaz("1", ",00", ",00")).toBe("1,00");
    expect(yaz(..."1234567890".split(""))).toBe("123456789");
    expect(yaz("0", "0", "0")).toBe("0");
    expect(yaz("0", "7")).toBe("7");
  });
  it("sil son karakteri kaldırır; boşta bir şey yapmaz", () => {
    expect(yaz("1", "2", "sil")).toBe("1");
    expect(yaz("sil")).toBe("");
    expect(yaz("1", ",", "sil")).toBe("1");
  });
  it("geçersiz tuş yok sayılır", () => {
    expect(yaz("1", "x", "2")).toBe("12");
  });
  it("gösterim: binlik nokta, virgül korunur; tlYaziKurusa ile gidiş-dönüş", () => {
    expect(tusMetniGoster("")).toBe("0");
    expect(tusMetniGoster("1250")).toBe("1.250");
    expect(tusMetniGoster("1234567,5")).toBe("1.234.567,5");
    expect(tusMetniGoster("450,00")).toBe("450,00");
    expect(tlYaziKurusa(yaz("1", "2", "5", "0", ",", "5"))).toBe(125_050);
  });
});

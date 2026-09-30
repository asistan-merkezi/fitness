import { describe, expect, it } from "vitest";
import { antrenorDurumu } from "./antrenor-durumu";

const Z = (saat: number, dk = 0) => new Date(Date.UTC(2026, 9, 5, saat - 3, dk)).toISOString();
const ders = (durum: "planlandi" | "geldi" | "derste" | "iptal" | "tamamlandi" | "gelmedi", bas: number, bit: number, antrenor = "a1") => ({ antrenor_id: antrenor, baslangic: Z(bas), bitis: Z(bit), durum });

describe("antrenorDurumu", () => {
  const yok = new Set<string>();

  it("dersi yoksa müsait", () => {
    expect(antrenorDurumu("a1", [], yok, Z(10))).toBe("musait");
  });

  it("izinliyse her zaman izinli", () => {
    expect(antrenorDurumu("a1", [ders("derste", 10, 11)], new Set(["a1"]), Z(10, 30))).toBe("izinli");
  });

  it("şu an devam eden derste/geldi dersi varsa Derste; yalnız planlıysa Dersi Var", () => {
    expect(antrenorDurumu("a1", [ders("derste", 10, 11)], yok, Z(10, 30))).toBe("derste");
    expect(antrenorDurumu("a1", [ders("geldi", 10, 11)], yok, Z(10, 30))).toBe("derste");
    expect(antrenorDurumu("a1", [ders("planlandi", 10, 11)], yok, Z(10, 30))).toBe("sirada");
  });

  it("ders saatinin dışında, iptal/gelmedi/tamamlanmış ve başka antrenörün dersi sayılmaz; bitiş anı dışlayıcıdır", () => {
    expect(antrenorDurumu("a1", [ders("derste", 10, 11)], yok, Z(11))).toBe("musait");
    expect(antrenorDurumu("a1", [ders("derste", 10, 11)], yok, Z(9, 59))).toBe("musait");
    for (const d of ["iptal", "gelmedi", "tamamlandi"] as const) expect(antrenorDurumu("a1", [ders(d, 10, 11)], yok, Z(10, 30))).toBe("musait");
    expect(antrenorDurumu("a1", [ders("derste", 10, 11, "a2")], yok, Z(10, 30))).toBe("musait");
  });
});

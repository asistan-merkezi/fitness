import { describe, expect, it } from "vitest";
import { blokKonumu, cizelgeSaatAraligi, dakikaya, SAAT_PX, suAnKonumu } from "./cizelge";

// İstanbul +03: yerel saat -> UTC ISO
const Z = (saat: number, dk = 0, gun = 5) => new Date(Date.UTC(2026, 9, gun, saat - 3, dk)).toISOString();

describe("çizelge yerleşimi", () => {
  it("dakikaya çevirir", () => {
    expect(dakikaya("09:30")).toBe(570);
  });

  it("varsayılan aralık 08-22; taşan ders aralığı genişletir", () => {
    expect(cizelgeSaatAraligi([])).toEqual({ bas: 8, bit: 22 });
    expect(cizelgeSaatAraligi([{ baslangic: Z(10), bitis: Z(11) }])).toEqual({ bas: 8, bit: 22 });
    expect(cizelgeSaatAraligi([{ baslangic: Z(6, 30), bitis: Z(7, 30) }])).toEqual({ bas: 6, bit: 22 });
    expect(cizelgeSaatAraligi([{ baslangic: Z(21, 30), bitis: Z(23, 30) }])).toEqual({ bas: 8, bit: 24 });
  });

  it("gece yarısını aşan ders 24:00'te kesilir", () => {
    expect(cizelgeSaatAraligi([{ baslangic: Z(23, 30), bitis: Z(24 + 0, 30) }]).bit).toBe(24);
  });

  it("blok konumu İstanbul saatine göre: üst = başlangıç, yükseklik = süre", () => {
    expect(blokKonumu(Z(10), Z(11), 8)).toEqual({ top: 2 * SAAT_PX, height: SAAT_PX });
    expect(blokKonumu(Z(9, 30), Z(10, 30), 8)).toEqual({ top: 1.5 * SAAT_PX, height: SAAT_PX });
    expect(blokKonumu(Z(10), Z(10, 15), 8).height).toBe(28); // çok kısa blok okunur kalır
  });

  it("şu an çizgisi aralık içindeyse konum, dışındaysa null", () => {
    expect(suAnKonumu(Z(10), { bas: 8, bit: 22 })).toBe(2 * SAAT_PX);
    expect(suAnKonumu(Z(7), { bas: 8, bit: 22 })).toBeNull();
    expect(suAnKonumu(Z(23), { bas: 8, bit: 22 })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { anMs, musaitSaatler, saatAdaylari, saatMusaitMi } from "./musait-saatler";

const TARIH = "2030-03-12";

describe("saatAdaylari", () => {
  it("08:00-21:30 arası 30 dk'lık ızgara üretir, ızgara dışı ekstra saati sıralı katar", () => {
    const adaylar = saatAdaylari("09:15");
    expect(adaylar[0]).toBe("08:00");
    expect(adaylar.at(-1)).toBe("21:30");
    expect(adaylar.indexOf("09:15")).toBe(adaylar.indexOf("09:00") + 1);
  });
});

describe("saatMusaitMi", () => {
  const dolu = [{ bas: anMs(TARIH, "10:00"), bit: anMs(TARIH, "11:00") }];

  it("dolu aralıkla çakışan saati eler, bitişikteki saati kabul eder", () => {
    expect(saatMusaitMi(TARIH, "09:30", 45, dolu)).toBe(false);
    expect(saatMusaitMi(TARIH, "09:00", 60, dolu)).toBe(true);
    expect(saatMusaitMi(TARIH, "11:00", 60, dolu)).toBe(true);
  });

  it("ders gün sonunu (22:00) aşarsa eler", () => {
    expect(saatMusaitMi(TARIH, "21:30", 30, [])).toBe(true);
    expect(saatMusaitMi(TARIH, "21:30", 45, [])).toBe(false);
  });
});

describe("musaitSaatler", () => {
  it("geçmiş günde hiç saat dönmez, gelecekte dolu saatleri eler", () => {
    expect(musaitSaatler("2020-01-01", 60, [])).toEqual([]);
    const saatler = musaitSaatler(TARIH, 60, [{ bas: anMs(TARIH, "10:00"), bit: anMs(TARIH, "11:00") }]);
    expect(saatler).not.toContain("10:00");
    expect(saatler).not.toContain("09:30");
    expect(saatler).toContain("09:00");
    expect(saatler).toContain("11:00");
  });
});

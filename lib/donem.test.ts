import { afterEach, describe, expect, it, vi } from "vitest";
import { ayDonemi, donemCoz, gunDonemi, gunEkle, gunFarki, haftaGunuIlkTarih, takvimTarihiGecerli, yilDonemi } from "./donem";

describe("gunDonemi — İstanbul takvim günü, yarı açık aralık", () => {
  it("00:00 İstanbul = önceki gün 21:00Z; bitiş ertesi gün 00:00 İstanbul (dışlayıcı)", () => {
    const d = gunDonemi("2026-10-01");
    expect(d.baslangic).toBe("2026-09-30T21:00:00.000Z");
    expect(d.bitis).toBe("2026-10-01T21:00:00.000Z");
    expect(d.baslangicTarih).toBe("2026-10-01");
    expect(d.bitisTarih).toBe("2026-10-02");
    expect(d.oncekiParam).toBe("2026-09-30");
    expect(d.sonrakiParam).toBe("2026-10-02");
  });
  it("ay/yıl taşması", () => {
    expect(gunDonemi("2026-12-31").sonrakiParam).toBe("2027-01-01");
    expect(gunDonemi("2027-01-01").oncekiParam).toBe("2026-12-31");
    expect(gunDonemi("2028-03-01").oncekiParam).toBe("2028-02-29"); // artık yıl
  });
  it("etiket Türkçe", () => {
    expect(gunDonemi("2026-10-01").etiket).toMatch(/Ekim 2026/);
    expect(gunDonemi("2026-10-01").etiket).toMatch(/Perşembe/);
  });
});

describe("ayDonemi / yilDonemi", () => {
  it("ay başı İstanbul 00:00; bitiş bir sonraki ayın başı", () => {
    const d = ayDonemi(2026, 10);
    expect(d.baslangicTarih).toBe("2026-10-01");
    expect(d.bitisTarih).toBe("2026-11-01");
    expect(d.baslangic).toBe("2026-09-30T21:00:00.000Z");
    expect(d.etiket).toMatch(/Ekim 2026/);
  });
  it("Ocak ← Aralık gezinme", () => {
    expect(ayDonemi(2027, 1).oncekiParam).toBe("2026-12");
    expect(ayDonemi(2026, 12).sonrakiParam).toBe("2027-01");
    expect(ayDonemi(2026, 12).bitisTarih).toBe("2027-01-01");
  });
  it("Şubat 28/29 gün", () => {
    expect(ayDonemi(2027, 2).bitisTarih).toBe("2027-03-01");
    expect(ayDonemi(2028, 2).bitisTarih).toBe("2028-03-01");
  });
  it("yıl", () => {
    const d = yilDonemi(2026);
    expect(d.baslangicTarih).toBe("2026-01-01");
    expect(d.bitisTarih).toBe("2027-01-01");
    expect(d.param).toBe("2026");
  });
});

describe("donemCoz — bozuk parametre varsayılan üretir (İstanbul'a göre)", () => {
  afterEach(() => vi.useRealTimers());

  it("gece yarısı sınırı: 21:30Z = İstanbul'da ertesi gün", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T21:30:00Z"));
    expect(donemCoz({}).param).toBe("2026-10-01");
    expect(donemCoz({ gorunum: "ay" }).param).toBe("2026-10");
    expect(donemCoz({ gorunum: "yil" }).param).toBe("2026");
  });
  it("yılbaşı sınırı: 31 Aralık 21:30Z = İstanbul'da 1 Ocak", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T21:30:00Z"));
    expect(donemCoz({ gorunum: "yil" }).param).toBe("2027");
    expect(donemCoz({ gorunum: "ay" }).param).toBe("2027-01");
  });
  it.each([
    [{ gorunum: "gun", tarih: "2026-13-45" }],
    [{ gorunum: "gun", tarih: "2026-02-30" }],
    [{ gorunum: "gun", tarih: "abc" }],
    [{ gorunum: "ay", tarih: "2026-00" }],
    [{ gorunum: "ay", tarih: "1999-05" }],
    [{ gorunum: "yil", tarih: "12" }],
    [{ gorunum: "saat", tarih: "abc" }],
  ])("%j bozuk -> bugüne düşer, hata atmaz", (girdi) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
    const d = donemCoz(girdi);
    expect(d.baslangicTarih <= "2026-10-05").toBe(true);
    expect(d.bitisTarih > "2026-10-05").toBe(true);
  });
  it("geçerli parametre olduğu gibi kullanılır", () => {
    expect(donemCoz({ gorunum: "gun", tarih: "2026-02-28" }).param).toBe("2026-02-28");
    expect(donemCoz({ gorunum: "ay", tarih: "2026-02" }).param).toBe("2026-02");
    expect(donemCoz({ gorunum: "yil", tarih: "2025" }).param).toBe("2025");
  });
});

describe("gunEkle", () => {
  it("ay/yıl/artık yıl sınırlarını aşar", () => {
    expect(gunEkle("2026-10-01", 7)).toBe("2026-10-08");
    expect(gunEkle("2026-10-28", 7)).toBe("2026-11-04");
    expect(gunEkle("2026-12-28", 7)).toBe("2027-01-04");
    expect(gunEkle("2028-02-28", 1)).toBe("2028-02-29");
    expect(gunEkle("2026-10-01", -1)).toBe("2026-09-30");
    expect(gunEkle("2026-10-01", 0)).toBe("2026-10-01");
  });
});

describe("gunFarki", () => {
  it("takvim günü farkı (ay/yıl/artık yıl sınırları dahil)", () => {
    expect(gunFarki("2026-10-01", "2026-10-08")).toBe(7);
    expect(gunFarki("2026-10-08", "2026-10-01")).toBe(-7);
    expect(gunFarki("2026-12-31", "2027-01-01")).toBe(1);
    expect(gunFarki("2028-02-28", "2028-03-01")).toBe(2);
    expect(gunFarki("2026-10-01", "2026-10-01")).toBe(0);
  });
});

describe("haftaGunuIlkTarih", () => {
  it("aynı gün kendisi, sonraki günler ileri sarar (yıl sonu dahil)", () => {
    // 2026-10-05 Pazartesi
    expect(haftaGunuIlkTarih("2026-10-05", 1)).toBe("2026-10-05");
    expect(haftaGunuIlkTarih("2026-10-05", 0)).toBe("2026-10-11");
    expect(haftaGunuIlkTarih("2026-10-05", 6)).toBe("2026-10-10");
    // 2026-12-31 Perşembe → sonraki Pazartesi 2027-01-04
    expect(haftaGunuIlkTarih("2026-12-31", 1)).toBe("2027-01-04");
  });
});

describe("takvimTarihiGecerli", () => {
  it("olmayan günleri reddeder (Date.parse bunları kabul ediyordu)", () => {
    expect(takvimTarihiGecerli("2026-02-28")).toBe(true);
    expect(takvimTarihiGecerli("2028-02-29")).toBe(true);
    expect(takvimTarihiGecerli("2026-02-29")).toBe(false);
    expect(takvimTarihiGecerli("2026-02-31")).toBe(false);
    expect(takvimTarihiGecerli("2026-04-31")).toBe(false);
    expect(takvimTarihiGecerli("2026-13-01")).toBe(false);
    expect(takvimTarihiGecerli("26-01-01")).toBe(false);
    // Doğum tarihi gibi alanlar için 2000 öncesi geçerlidir.
    expect(takvimTarihiGecerli("1985-06-15")).toBe(true);
    expect(takvimTarihiGecerli("1899-12-31")).toBe(false);
  });
});

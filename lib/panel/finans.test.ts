import { describe, expect, it } from "vitest";
import { girenCikan, hareketBasligi, hareketleriSirala, kategoriDagilimi, vadesiGecti } from "./finans";

describe("finans yardımcıları", () => {
  it("hareket başlığı kaynağa ve işarete göre", () => {
    expect(hareketBasligi({ kaynak: "musteri", tutar_kurus: 100 })).toBe("Müşteri tahsilatı");
    expect(hareketBasligi({ kaynak: "musteri", tutar_kurus: -100 })).toBe("Müşteri iadesi");
    expect(hareketBasligi({ kaynak: "manuel", tutar_kurus: 5 })).toBe("Manuel giriş");
    expect(hareketBasligi({ kaynak: "manuel", tutar_kurus: -5 })).toBe("Manuel çıkış");
    expect(hareketBasligi({ kaynak: "gider", tutar_kurus: -5 })).toBe("Gider");
    expect(hareketBasligi({ kaynak: "personel", tutar_kurus: -5 })).toBe("Personel ödemesi");
  });

  it("giren ve çıkanı ayırır (çıkan pozitif)", () => {
    expect(girenCikan([{ tutar_kurus: 500 }, { tutar_kurus: -200 }, { tutar_kurus: 100 }, { tutar_kurus: -50 }])).toEqual({ giren: 600, cikan: 250 });
    expect(girenCikan([])).toEqual({ giren: 0, cikan: 0 });
  });

  it("tarihe göre yeniden eskiye sıralar, girdiyi bozmaz", () => {
    const girdi = [{ tarih: "2026-10-01" }, { tarih: "2026-10-03" }, { tarih: "2026-10-02" }];
    expect(hareketleriSirala(girdi).map((x) => x.tarih)).toEqual(["2026-10-03", "2026-10-02", "2026-10-01"]);
    expect(girdi[0].tarih).toBe("2026-10-01");
  });

  it("kategori dağılımı toplar, büyükten küçüğe sıralar, yüzde verir", () => {
    const r = kategoriDagilimi([
      { kategori: "kira", tutar_kurus: 7000 },
      { kategori: "su", tutar_kurus: 1000 },
      { kategori: "kira", tutar_kurus: 1000 },
      { kategori: "reklam", tutar_kurus: 1000 },
    ]);
    expect(r).toEqual([
      { kategori: "kira", tutar_kurus: 8000, yuzde: 80 },
      { kategori: "su", tutar_kurus: 1000, yuzde: 10 },
      { kategori: "reklam", tutar_kurus: 1000, yuzde: 10 },
    ]);
    expect(kategoriDagilimi([])).toEqual([]);
  });

  it("vade bugünden önceyse geçmiştir; bugün ve sonrası değildir", () => {
    expect(vadesiGecti("2026-09-30", "2026-10-01")).toBe(true);
    expect(vadesiGecti("2026-10-01", "2026-10-01")).toBe(false);
    expect(vadesiGecti("2026-10-15", "2026-10-01")).toBe(false);
    expect(vadesiGecti(null, "2026-10-01")).toBe(false);
  });
});

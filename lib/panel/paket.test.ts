import { describe, expect, it } from "vitest";
import { paketArsivdeMi, paketSatilabilir, satisSuresiDoldu } from "./paket";

describe("paket arşiv ayrımı", () => {
  const bugun = "2026-10-10";
  it("satış bitiş günü hâlâ satılabilir; ertesi gün arşivde", () => {
    expect(satisSuresiDoldu({ satis_bitis_tarihi: "2026-10-10" }, bugun)).toBe(false);
    expect(satisSuresiDoldu({ satis_bitis_tarihi: "2026-10-09" }, bugun)).toBe(true);
    expect(satisSuresiDoldu({ satis_bitis_tarihi: null }, bugun)).toBe(false);
  });
  it("kapalı paket süresi dolmasa da arşivdedir; açık ve süresi dolmamış paket satılabilir", () => {
    expect(paketArsivdeMi({ aktif: false, satis_bitis_tarihi: null }, bugun)).toBe(true);
    expect(paketArsivdeMi({ aktif: true, satis_bitis_tarihi: "2026-10-01" }, bugun)).toBe(true);
    expect(paketSatilabilir({ aktif: true, satis_bitis_tarihi: "2026-12-31" }, bugun)).toBe(true);
    expect(paketSatilabilir({ aktif: true, satis_bitis_tarihi: null }, bugun)).toBe(true);
  });
});

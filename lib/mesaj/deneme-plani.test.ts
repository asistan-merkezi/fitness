import { describe, expect, it } from "vitest";
import { GERI_CEKILME_DAKIKA, sonrakiDeneme } from "./deneme-plani";

describe("yeniden deneme planı", () => {
  it("ilk iki başarısızlıkta 5 ve 30 dk sonraya planlar; üçüncüde durur", () => {
    const simdi = Date.UTC(2026, 9, 1, 10, 0, 0);
    expect(GERI_CEKILME_DAKIKA).toEqual([5, 30, 120]);
    expect(sonrakiDeneme(0, simdi)).toEqual({ son: false, zaman: new Date(simdi + 5 * 60_000).toISOString() });
    expect(sonrakiDeneme(1, simdi)).toEqual({ son: false, zaman: new Date(simdi + 30 * 60_000).toISOString() });
    expect(sonrakiDeneme(2, simdi)).toEqual({ son: true, zaman: null });
  });
});

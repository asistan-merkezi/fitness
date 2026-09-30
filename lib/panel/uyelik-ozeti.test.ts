import { describe, expect, it } from "vitest";
import { birincilUyelik, bitiyorUyarisi, gecenSureYuzdesi, kalanGun } from "./uyelik-ozeti";

type U = Parameters<typeof bitiyorUyarisi>[0];
const u = (o: Partial<U>): U => ({
  id: "x",
  tur: "sure",
  baslangic_tarihi: "2026-10-01",
  bitis_tarihi: "2026-10-30",
  kalan_hak: null,
  toplam_hak: null,
  gecerli_durum: "aktif",
  ...o,
});

describe("birincilUyelik", () => {
  it("boşsa null", () => expect(birincilUyelik([])).toBeNull());

  it("aktif olanı, aktifler arasında bitişi en yakın olanı seçer (bitişsiz sona)", () => {
    const a = u({ id: "uzun", bitis_tarihi: "2026-12-01" });
    const b = u({ id: "kisa", bitis_tarihi: "2026-10-10" });
    const c = u({ id: "suresiz", bitis_tarihi: null, tur: "seans", kalan_hak: 5, toplam_hak: 5 });
    const d = u({ id: "bitmis", gecerli_durum: "sona_erdi", bitis_tarihi: "2026-09-01" });
    expect(birincilUyelik([a, b, c, d])?.id).toBe("kisa");
    expect(birincilUyelik([c, d])?.id).toBe("suresiz");
  });

  it("aktif yoksa dondurulmuş > başlamamış > sona ermiş > iptal", () => {
    const iptal = u({ id: "iptal", gecerli_durum: "iptal" });
    const bitti = u({ id: "bitti", gecerli_durum: "sona_erdi" });
    const bekleyen = u({ id: "bekleyen", gecerli_durum: "beklemede" });
    const dondu = u({ id: "dondu", gecerli_durum: "dondurulmus" });
    expect(birincilUyelik([iptal, bitti, bekleyen, dondu])?.id).toBe("dondu");
    expect(birincilUyelik([iptal, bitti, bekleyen])?.id).toBe("bekleyen");
    expect(birincilUyelik([iptal, bitti])?.id).toBe("bitti");
  });
});

describe("kalanGun / bitiyorUyarisi", () => {
  it("bitiş günü DAHİL: bitiş günü 0, ertesi gün -1", () => {
    expect(kalanGun(u({ bitis_tarihi: "2026-10-30" }), "2026-10-30")).toBe(0);
    expect(kalanGun(u({ bitis_tarihi: "2026-10-30" }), "2026-10-31")).toBe(-1);
    expect(kalanGun(u({ bitis_tarihi: null }), "2026-10-30")).toBeNull();
  });

  it("seans ≤ 2 veya bitişe ≤ 7 gün uyarır; aksi halde uyarmaz", () => {
    expect(bitiyorUyarisi(u({ tur: "seans", kalan_hak: 1, toplam_hak: 10, bitis_tarihi: "2026-12-01" }), "2026-10-01")).toBe("Paket bitmek üzere (Son 1 seans hakkı)");
    expect(bitiyorUyarisi(u({ bitis_tarihi: "2026-10-08" }), "2026-10-01")).toBe("Paket bitmek üzere (7 gün kaldı)");
    expect(bitiyorUyarisi(u({ bitis_tarihi: "2026-10-01" }), "2026-10-01")).toBe("Paket bitmek üzere (Bugün son gün)");
    expect(bitiyorUyarisi(u({ bitis_tarihi: "2026-10-09" }), "2026-10-01")).toBeNull();
    expect(bitiyorUyarisi(u({ tur: "seans", kalan_hak: 3, toplam_hak: 10, bitis_tarihi: null }), "2026-10-01")).toBeNull();
    expect(bitiyorUyarisi(u({ gecerli_durum: "dondurulmus", bitis_tarihi: "2026-10-02" }), "2026-10-01")).toBeNull();
  });
});

describe("gecenSureYuzdesi", () => {
  it("başlangıç günü dahil doluluk", () => {
    expect(gecenSureYuzdesi(u({ baslangic_tarihi: "2026-10-01", bitis_tarihi: "2026-10-10" }), "2026-10-01")).toBe(10);
    expect(gecenSureYuzdesi(u({ baslangic_tarihi: "2026-10-01", bitis_tarihi: "2026-10-10" }), "2026-10-05")).toBe(50);
    expect(gecenSureYuzdesi(u({ baslangic_tarihi: "2026-10-01", bitis_tarihi: "2026-10-10" }), "2026-10-10")).toBe(100);
    expect(gecenSureYuzdesi(u({ baslangic_tarihi: "2026-10-01", bitis_tarihi: "2026-10-10" }), "2026-11-01")).toBe(100);
    expect(gecenSureYuzdesi(u({ baslangic_tarihi: "2026-10-10", bitis_tarihi: "2026-10-20" }), "2026-10-01")).toBe(0);
    expect(gecenSureYuzdesi(u({ bitis_tarihi: null }), "2026-10-01")).toBeNull();
  });
});

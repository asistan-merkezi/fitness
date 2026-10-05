import { describe, expect, it } from "vitest";
import { type BitenUyelik, type SonrakiUyelik, yenilemeOrani, yenilemeSiniflandir } from "./yenileme";

const biten = (id: string, musteri: string, bitis: string, created = "2026-09-01T10:00:00Z"): BitenUyelik => ({ id, musteri_id: musteri, paket_adi: "Aylık", bitis_tarihi: bitis, created_at: created });
const diger = (id: string, musteri: string, bitis: string | null, created: string, paket = "Aylık"): SonrakiUyelik => ({ id, musteri_id: musteri, paket_adi: paket, bitis_tarihi: bitis, created_at: created });

describe("yenilemeSiniflandir", () => {
  const BUGUN = "2026-10-15";

  it("sonradan alınan ve daha ileri biten üyelik yenilemedir (paket farklı olabilir)", () => {
    const r = yenilemeSiniflandir([biten("u1", "m1", "2026-10-05")], [diger("u2", "m1", "2027-01-05", "2026-10-04T09:00:00Z", "3 Aylık")], BUGUN);
    expect(r[0]).toMatchObject({ durum: "yeniledi", yeniPaket: "3 Aylık" });
  });

  it("bitişi gelmemiş ve yenilenmemiş = bekliyor; bitişi geçmiş = yenilemedi", () => {
    const r = yenilemeSiniflandir([biten("u1", "m1", "2026-10-05"), biten("u2", "m2", "2026-10-25")], [], BUGUN);
    expect(r.map((s) => s.durum)).toEqual(["yenilemedi", "bekliyor"]);
  });

  it("aynı ayda biten paralel üyelik ya da daha önce alınmış üyelik yenileme SAYILMAZ", () => {
    const r = yenilemeSiniflandir(
      [biten("u1", "m1", "2026-10-05", "2026-09-05T10:00:00Z")],
      [
        diger("eski", "m1", "2026-12-31", "2026-08-01T10:00:00Z"), // önce alınmış
        diger("kisa", "m1", "2026-10-03", "2026-09-20T10:00:00Z"), // sonra alınmış ama daha önce bitiyor
      ],
      BUGUN
    );
    expect(r[0].durum).toBe("yenilemedi");
  });

  it("bitişsiz (süresiz seans) yeni üyelik yenilemedir; müşteri bir kez sayılır", () => {
    const r = yenilemeSiniflandir(
      [biten("u1", "m1", "2026-10-05"), biten("u3", "m1", "2026-10-20")],
      [diger("u2", "m1", null, "2026-10-10T10:00:00Z")],
      BUGUN
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "u3", durum: "yeniledi" });
  });
});

describe("yenilemeOrani", () => {
  it("bekleyenler paydaya girmez; sonuçlanan yoksa null", () => {
    const r = yenilemeSiniflandir([biten("a", "m1", "2026-10-01"), biten("b", "m2", "2026-10-02"), biten("c", "m3", "2026-10-30")], [diger("x", "m1", "2026-11-30", "2026-10-01T12:00:00Z")], "2026-10-15");
    expect(yenilemeOrani(r)).toBe(50);
    expect(yenilemeOrani(yenilemeSiniflandir([biten("c", "m3", "2026-10-30")], [], "2026-10-15"))).toBeNull();
  });
});

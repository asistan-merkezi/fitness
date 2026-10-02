import { describe, expect, it } from "vitest";
import { ayGunleri, ayOzeti, haftaninGunu, hucreTuru } from "./puantaj";

const bugun = "2026-10-14"; // Çarşamba

describe("puantaj hücre türü", () => {
  it("öncelik: kayıt > izin > tatil > Pazar > gelecek > boş", () => {
    const taban = { tarih: "2026-10-13", bugun, izinli: false, tatil: false };
    expect(hucreTuru({ ...taban, kayitDurumu: "geldi", izinli: true, tatil: true })).toBe("geldi");
    expect(hucreTuru({ ...taban, izinli: true, tatil: true })).toBe("izinli");
    expect(hucreTuru({ ...taban, tatil: true })).toBe("tatil");
    expect(hucreTuru({ ...taban, tarih: "2026-10-11" })).toBe("pazar"); // Pazar
    expect(hucreTuru({ ...taban, tarih: "2026-10-20" })).toBe("gelecek");
    expect(hucreTuru(taban)).toBe("bos");
    expect(hucreTuru({ ...taban, tarih: bugun })).toBe("bos"); // bugün gelecek sayılmaz
  });

  it("hafta günü saat dilimine bağlı değildir", () => {
    expect(haftaninGunu("2026-10-11")).toBe(0);
    expect(haftaninGunu("2026-10-12")).toBe(1);
    expect(haftaninGunu("2026-10-17")).toBe(6);
  });

  it("ay günleri: ay uzunluğu, artık yıl, yıl sonu", () => {
    expect(ayGunleri("2026-10")).toHaveLength(31);
    expect(ayGunleri("2026-02")).toHaveLength(28);
    expect(ayGunleri("2028-02")).toHaveLength(29);
    expect(ayGunleri("2026-12").at(-1)).toBe("2026-12-31");
  });

  it("ay özeti durumları ve fazla mesaiyi toplar", () => {
    const o = ayOzeti([
      { tur: "geldi", fazlaMesaiDk: 30 },
      { tur: "geldi", fazlaMesaiDk: 0 },
      { tur: "yarim_gun", fazlaMesaiDk: 0 },
      { tur: "gelmedi", fazlaMesaiDk: 0 },
      { tur: "izinli", fazlaMesaiDk: 0 },
      { tur: "pazar", fazlaMesaiDk: 0 },
    ]);
    expect(o).toEqual({ geldi: 2, yarimGun: 1, gelmedi: 1, raporlu: 0, izinli: 1, fazlaMesaiDk: 30 });
  });
});

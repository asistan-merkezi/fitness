import { describe, expect, it } from "vitest";
import { dersTalebiSemasi, talepTuruSemasi, talepYanitSemasi, yorumSemasi } from "./dogrulama";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("talep ve öneriler şemaları", () => {
  it("talep türü yalnız bilinen beş değeri kabul eder", () => {
    for (const t of ["ders_talebi", "ders_iptali", "ders_ertele", "antrenor_yorumu", "ders_yorumu"]) {
      expect(talepTuruSemasi.safeParse(t).success).toBe(true);
    }
    expect(talepTuruSemasi.safeParse("randevu_talebi").success).toBe(false);
    expect(talepTuruSemasi.safeParse(undefined).success).toBe(false);
  });

  it("ders talebi: tarih zorunlu; saat ve antrenör opsiyonel, boş değerler null/undefined olur", () => {
    const r = dersTalebiSemasi.safeParse({ musteri_id: UUID, tarih: "2026-10-10", saat: "", antrenor_id: "", not: "  Akşam  " });
    expect(r.success && r.data).toMatchObject({ tarih: "2026-10-10", saat: null, antrenor_id: undefined, not: "Akşam" });
    expect(dersTalebiSemasi.safeParse({ musteri_id: UUID, tarih: "" }).success).toBe(false);
    expect(dersTalebiSemasi.safeParse({ musteri_id: UUID, tarih: "10.10.2026" }).success).toBe(false);
    expect(dersTalebiSemasi.safeParse({ musteri_id: UUID, tarih: "2026-10-10", saat: "25:00" }).success).toBe(false);
    expect(dersTalebiSemasi.safeParse({ musteri_id: UUID, tarih: "2026-10-10", saat: "18:30" }).success).toBe(true);
    expect(dersTalebiSemasi.safeParse({ musteri_id: UUID, tarih: "2026-10-10", not: "x".repeat(501) }).success).toBe(false);
  });

  it("yorum: puan 1-5 tam sayı, metin zorunlu, tür yalnız yorum türleri", () => {
    const temel = { musteri_id: UUID, tur: "ders_yorumu", ders_id: UUID, puan: "4", yorum: " İyiydi " };
    const r = yorumSemasi.safeParse(temel);
    expect(r.success && r.data).toMatchObject({ puan: 4, yorum: "İyiydi" });
    expect(yorumSemasi.safeParse({ ...temel, puan: "0" }).success).toBe(false);
    expect(yorumSemasi.safeParse({ ...temel, puan: "6" }).success).toBe(false);
    expect(yorumSemasi.safeParse({ ...temel, puan: "3.5" }).success).toBe(false);
    expect(yorumSemasi.safeParse({ ...temel, puan: "" }).success).toBe(false);
    expect(yorumSemasi.safeParse({ ...temel, yorum: "   " }).success).toBe(false);
    expect(yorumSemasi.safeParse({ ...temel, tur: "ders_iptali" }).success).toBe(false);
    expect(yorumSemasi.safeParse({ ...temel, ders_id: "x" }).success).toBe(false);
  });

  it("talep yanıtı yalnız planlandı/reddedildi", () => {
    expect(talepYanitSemasi.safeParse({ musteri_id: UUID, talep_id: UUID, durum: "planlandi" }).success).toBe(true);
    expect(talepYanitSemasi.safeParse({ musteri_id: UUID, talep_id: UUID, durum: "bekliyor" }).success).toBe(false);
  });
});

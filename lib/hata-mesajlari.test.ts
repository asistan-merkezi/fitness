import { describe, expect, it } from "vitest";
import { GENEL_HATA, hataMesajiCoz } from "./hata-mesajlari";

describe("hataMesajiCoz", () => {
  it("SQL kodlarını Türkçe mesaja çevirir", () => {
    expect(hataMesajiCoz({ message: "veli_gerekli" })).toMatch(/veli/);
    expect(hataMesajiCoz({ message: "dondurma_limiti" })).toMatch(/Dondurma hakkı/);
    expect(hataMesajiCoz({ message: "iade_tutari_asildi" })).toMatch(/aşamaz/);
  });
  it("kod mesajın içinde geçse de çözer", () => {
    expect(hataMesajiCoz({ message: "ERROR: yetki_yetersiz CONTEXT: PL/pgSQL" })).toBe("Bu işlem için yetkiniz yok.");
  });
  it("iç içe kodlarda en özgül olan kazanır (izin_cakisma ≠ cakisma)", () => {
    expect(hataMesajiCoz({ message: "izin_cakisma" })).toMatch(/izin/);
    expect(hataMesajiCoz({ message: "ERROR: izin_cakisma" })).toMatch(/izin/);
    expect(hataMesajiCoz({ message: "dondurma_cakisma" })).toMatch(/dondurma/);
    expect(hataMesajiCoz({ message: "cakisma" })).toMatch(/çakışan bir ders/);
  });
  it("izin/RLS ve kısıt ihlalleri", () => {
    expect(hataMesajiCoz({ message: 'new row violates row-level security policy for table "musteri"' })).toMatch(/yetkiniz/);
    expect(hataMesajiCoz({ message: 'duplicate key value violates unique constraint "x"' })).toMatch(/zaten mevcut/);
  });
  it("bilinmeyen/teknik hata ayrıntısı SIZMAZ", () => {
    const m = hataMesajiCoz({ message: 'relation "public.gizli_tablo" does not exist SELECT * FROM ...' });
    expect(m).toBe(GENEL_HATA);
    expect(m).not.toMatch(/gizli_tablo|SELECT/);
    expect(hataMesajiCoz(null)).toBe(GENEL_HATA);
    expect(hataMesajiCoz(undefined)).toBe(GENEL_HATA);
  });
});

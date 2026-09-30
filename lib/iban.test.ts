import { describe, expect, it } from "vitest";
import { ibanBicimle, ibanGecerli, ibanTemizle } from "./iban";

describe("iban", () => {
  it("geçerli IBAN'ı boşluk ve küçük harfe bakmadan kabul eder", () => {
    expect(ibanGecerli("TR330006100519786457841326")).toBe(true);
    expect(ibanGecerli("tr33 0006 1005 1978 6457 8413 26")).toBe(true);
  });

  it("bozuk sağlama, eksik hane, yabancı ülke ve boşu reddeder", () => {
    expect(ibanGecerli("TR330006100519786457841327")).toBe(false);
    expect(ibanGecerli("TR33000610051978645784132")).toBe(false);
    expect(ibanGecerli("DE89370400440532013000")).toBe(false);
    expect(ibanGecerli("")).toBe(false);
    expect(ibanGecerli(null)).toBe(false);
  });

  it("temizler ve 4'lü gruplar", () => {
    expect(ibanTemizle(" tr33 0006 ")).toBe("TR330006");
    expect(ibanBicimle("TR330006100519786457841326")).toBe("TR33 0006 1005 1978 6457 8413 26");
  });
});

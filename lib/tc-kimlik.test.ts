import { describe, expect, it } from "vitest";
import { tcKimlikGecerli } from "./tc-kimlik";

describe("tcKimlikGecerli", () => {
  it("geçerli numara", () => {
    expect(tcKimlikGecerli("10000000146")).toBe(true);
  });
  it.each([["10000000147"], ["01234567890"], ["1234567890"], ["123456789012"], ["abcdefghijk"], [""], [null], [undefined]])(
    "%j geçersiz",
    (tc) => {
      expect(tcKimlikGecerli(tc as string | null | undefined)).toBe(false);
    }
  );
});

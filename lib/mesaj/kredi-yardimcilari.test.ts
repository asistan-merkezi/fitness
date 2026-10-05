import { describe, expect, it } from "vitest";
import { aliciMaskele, guvenliOdemeUrl } from "./kredi-yardimcilari";

describe("guvenliOdemeUrl", () => {
  it("https kabul, http/javascript/bozuk reddedilir", () => {
    expect(guvenliOdemeUrl("https://odeme.example.com/x?y=1")).toBe("https://odeme.example.com/x?y=1");
    expect(guvenliOdemeUrl("http://odeme.example.com/x")).toBeNull();
    expect(guvenliOdemeUrl("javascript:alert(1)")).toBeNull();
    expect(guvenliOdemeUrl("//evil.com")).toBeNull();
  });
  it("localhost için http serbest", () => {
    expect(guvenliOdemeUrl("http://localhost:3000/o")).not.toBeNull();
  });
});

describe("aliciMaskele", () => {
  it("telefon ve e-postayı maskeler", () => {
    expect(aliciMaskele("+905321234567")).toBe("+90 532 ••• •• 67");
    expect(aliciMaskele("ayse@ornek.com")).toBe("a•••@ornek.com");
  });
});

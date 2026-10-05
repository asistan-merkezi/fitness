import { describe, expect, it } from "vitest";
import { saglikDegerlendir } from "./saglik";

const SIMDI = Date.parse("2026-10-05T12:00:00Z");
const saatOnce = (s: number) => new Date(SIMDI - s * 3_600_000).toISOString();

describe("saglikDegerlendir", () => {
  it("her cron 26 saat içinde başarılıysa sağlıklı", () => {
    const r = saglikDegerlendir({ simdiMs: SIMDI, veritabani: true, kayitlar: [
      { ad: "audit-log-bolum-olustur", son_basarili: saatOnce(10), son_hata: null },
      { ad: "mesaj-gunluk", son_basarili: saatOnce(25), son_hata: null },
    ] });
    expect(r.ok).toBe(true);
  });
  it("hiç çalışmamış ya da günü kaçırmış cron alarm verir", () => {
    const r = saglikDegerlendir({ simdiMs: SIMDI, veritabani: true, kayitlar: [{ ad: "audit-log-bolum-olustur", son_basarili: saatOnce(30), son_hata: "bolum_olusturulamadi:2026-12" }] });
    expect(r.ok).toBe(false);
    expect(r.kontroller.find((k) => k.ad === "cron:audit-log-bolum-olustur")?.ayrinti).toMatch(/bolum_olusturulamadi/);
    expect(r.kontroller.find((k) => k.ad === "cron:mesaj-gunluk")?.ayrinti).toBe("hiç çalışmadı");
  });
  it("veritabanı erişilemezse sağlıksız", () => {
    expect(saglikDegerlendir({ simdiMs: SIMDI, veritabani: false, kayitlar: [] }).ok).toBe(false);
  });
});

describe("CRON_ISLERI", () => {
  it("vercel.json'daki cron listesiyle aynı (yeni cron sağlık kontrolüne eklenmeyi unutulmasın)", async () => {
    const { readFileSync } = await import("node:fs");
    const { CRON_ISLERI } = await import("./saglik");
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string }[] };
    expect(vercel.crons.map((c) => c.path.replace("/api/cron/", "")).sort()).toEqual([...CRON_ISLERI].sort());
  });
});

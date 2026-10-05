import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { merkezdenBakiyeCek, merkezdenKrediPaketleriCek, merkezeGonder } from "./merkez-client";

type Cagri = { url: string; method: string; headers: Record<string, string>; body: string };
const ANAHTAR = "amk_test";

function sahteFetch(yanitlar: Array<{ status: number; govde: unknown }>) {
  const cagrilar: Cagri[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    cagrilar.push({ url, method: String(init.method), headers: init.headers as Record<string, string>, body: String(init.body ?? "") });
    const y = yanitlar.shift();
    if (!y) throw new Error("beklenmeyen istek: " + url);
    return new Response(JSON.stringify(y.govde), { status: y.status });
  });
  vi.stubGlobal("fetch", fn);
  return cagrilar;
}

const girdi = { isletmeId: "isl-1", kanal: "sms" as const, aliciAdres: "905321112233", metin: "Merhaba", idempotencyKey: "fitness:k1", testMi: false, tetikleyiciKodu: "ders_hatirlatma" };

beforeEach(() => {
  vi.stubEnv("MESAJ_MERKEZ_BASE_URL", "https://merkez.test/");
  vi.stubEnv("MESAJ_MERKEZ_API_KEY", ANAHTAR);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("merkezeGonder (/api/v1 sözleşmesi)", () => {
  it("doğru uç, X-Api-Key, geçerli X-Imza ve gövde eşlemesi", async () => {
    const c = sahteFetch([{ status: 200, govde: { mesajIstekId: "m1", durum: "queued", kalanBakiye: 9, bakiyeVersiyonu: 4 } }]);
    const s = await merkezeGonder(girdi);
    expect(s).toEqual({ ulasildi: true, basarili: true, saglayiciMesajId: "m1", kalanBakiye: 9, bakiyeVersiyonu: 4 });
    expect(c[0].url).toBe("https://merkez.test/api/v1/mesaj/gonder");
    expect(c[0].headers["X-Api-Key"]).toBe(ANAHTAR);
    expect(c[0].headers["Idempotency-Key"]).toBe("fitness:k1");
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(c[0].headers["X-Imza"])!;
    expect(v1).toBe(createHmac("sha256", ANAHTAR).update(`${t}.${c[0].body}`).digest("hex"));
    expect(JSON.parse(c[0].body)).toEqual({ disKullaniciId: "isl-1", kanal: "sms", alici: "905321112233", mesajTipi: "hizmet", icerik: "Merhaba", kaynakBolum: "ders_hatirlatma" });
  });

  it("mail → eposta; ticari tetikleyici mesajTipi=ticari", async () => {
    const c = sahteFetch([{ status: 200, govde: { mesajIstekId: "m2", durum: "queued", kalanBakiye: 1, bakiyeVersiyonu: 2 } }]);
    await merkezeGonder({ ...girdi, kanal: "mail", aliciAdres: "a@b.com", tetikleyiciKodu: "musteri_dogum_gunu" });
    expect(JSON.parse(c[0].body)).toMatchObject({ kanal: "eposta", mesajTipi: "ticari" });
  });

  it("404 (tanınmayan işletme) → kullanıcı senkronu + aynı anahtarla tek yeniden deneme", async () => {
    const c = sahteFetch([
      { status: 404, govde: { hata: "Proje kullanıcısı bulunamadı." } },
      { status: 200, govde: { id: "pk1", disKullaniciId: "isl-1" } },
      { status: 202, govde: { mesajIstekId: "m3", durum: "askida", sebep: "yetersiz_kredi", kalanBakiye: 0, bakiyeVersiyonu: 1 } },
    ]);
    const s = await merkezeGonder(girdi);
    expect(c.map((x) => x.url)).toEqual([
      "https://merkez.test/api/v1/mesaj/gonder",
      "https://merkez.test/api/v1/kullanici/senkron",
      "https://merkez.test/api/v1/mesaj/gonder",
    ]);
    expect(c[2].headers["Idempotency-Key"]).toBe("fitness:k1");
    // Askıda: merkez kredi gelince kendisi gönderir — yerel kuyruk yeniden denememeli.
    expect(s).toMatchObject({ ulasildi: true, basarili: true, kalanBakiye: 0, bakiyeVersiyonu: 1 });
  });

  it("İYS reddi → kalıcı izin_yok, bakiye /kredi/bakiye'den", async () => {
    const c = sahteFetch([
      { status: 200, govde: { mesajIstekId: "m4", durum: "iys_rejected" } },
      { status: 200, govde: { bakiyeler: [{ kanal: "sms", bakiye: 7, bakiyeVersiyonu: 5 }] } },
    ]);
    const s = await merkezeGonder(girdi);
    expect(s).toEqual({ ulasildi: true, basarili: false, hata: "izin_yok", kalanBakiye: 7, bakiyeVersiyonu: 5 });
    expect(c[1].method).toBe("GET");
    expect(c[1].url).toBe("https://merkez.test/api/v1/kredi/bakiye?disKullaniciId=isl-1&kanal=sms");
  });

  it("bakiye okunamazsa versiyon -1 (yerel ayna ezilmez)", async () => {
    sahteFetch([
      { status: 422, govde: { hata: "WhatsApp gönderen kimliği bağlı değil." } },
      { status: 500, govde: {} },
    ]);
    expect(await merkezeGonder({ ...girdi, kanal: "whatsapp" })).toEqual({ ulasildi: true, basarili: false, hata: "izin_yok", kalanBakiye: 0, bakiyeVersiyonu: -1 });
  });

  it("429 / 503 / ağ hatası → geçici (ulasildi:false)", async () => {
    sahteFetch([{ status: 429, govde: { kod: "hiz_limiti" } }]);
    expect(await merkezeGonder(girdi)).toEqual({ ulasildi: false, hata: "rate_limit" });
    sahteFetch([{ status: 503, govde: { kod: "gonderim_durduruldu" } }]);
    expect(await merkezeGonder(girdi)).toEqual({ ulasildi: false, hata: "merkez_http_503" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    expect(await merkezeGonder(girdi)).toEqual({ ulasildi: false, hata: "ECONNRESET" });
  });

  it("yapılandırma yoksa istek atılmaz", async () => {
    vi.stubEnv("MESAJ_MERKEZ_API_KEY", "");
    const c = sahteFetch([]);
    expect(await merkezeGonder(girdi)).toEqual({ ulasildi: false, hata: "merkez_yapilandirilmadi" });
    expect(c).toHaveLength(0);
  });
});

describe("kredi uçları", () => {
  it("bakiye: cüzdan yoksa 0/0, merkez kullanıcıyı tanımıyorsa 0/0", async () => {
    sahteFetch([{ status: 200, govde: { bakiyeler: [] } }]);
    expect(await merkezdenBakiyeCek("isl-1", "mail")).toEqual({ ulasildi: true, bakiye: 0, bakiyeVersiyonu: 0 });
    sahteFetch([{ status: 404, govde: {} }]);
    expect(await merkezdenBakiyeCek("isl-1", "sms")).toEqual({ ulasildi: true, bakiye: 0, bakiyeVersiyonu: 0 });
  });

  it("paketler: geçersizler elenir, adete göre sıralanır", async () => {
    const c = sahteFetch([{ status: 200, govde: { paketler: [
      { paketId: "b", adet: 1000, fiyatKurus: 50000, paraBirimi: "TRY" },
      { paketId: "a", adet: 100, fiyatKurus: 7500, paraBirimi: "TRY" },
      { paketId: "x", adet: 0, fiyatKurus: 1, paraBirimi: "TRY" },
    ] } }]);
    const s = await merkezdenKrediPaketleriCek("isl-1", "sms");
    expect(c[0].url).toBe("https://merkez.test/api/v1/kredi/paketler?kanal=sms");
    expect(s.ulasildi && s.paketler.map((p) => p.paketId)).toEqual(["a", "b"]);
  });
});

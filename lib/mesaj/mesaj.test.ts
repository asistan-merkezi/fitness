import { describe, expect, it } from "vitest";
import { hataDegerlendir } from "./hata-kodlari";
import { bilinmeyenDegiskenleriBul, metindekiDegiskenler, sablonDoldur } from "./degisken-dogrula";
import { etkinKurallariOlustur } from "./kural-cozumle";
import { TETIKLEYICILER } from "./tetikleyiciler";

describe("tetikleyici kataloğu", () => {
  it("kodlar benzersiz; her varsayılan metin yalnız kendi geçerli değişkenlerini kullanır", () => {
    const kodlar = TETIKLEYICILER.map((t) => t.kod);
    expect(new Set(kodlar).size).toBe(kodlar.length);
    for (const t of TETIKLEYICILER) {
      expect(bilinmeyenDegiskenleriBul(t.varsayilanMesajMetni, t.gecerliDegiskenler), t.kod).toEqual([]);
    }
  });

  it("zamanlanmış tetikleyici varsayılan zamanlama taşır veya açıklaması vardır", () => {
    for (const t of TETIKLEYICILER.filter((x) => x.tetiklemeTipi === "zamanlanmis")) expect(t.zamanlamaAciklamasi, t.kod).toBeTruthy();
  });
});

describe("değişkenler ve şablon", () => {
  it("yer tutucuları bulur, bilinmeyeni ayırt eder", () => {
    expect(metindekiDegiskenler("Merhaba {{ad}}, {{ad}} ve {{paket}}")).toEqual(["ad", "paket"]);
    expect(bilinmeyenDegiskenleriBul("{{ad}} {{gizli}}", ["ad"])).toEqual(["gizli"]);
  });

  it("şablonu doldurur; değeri olmayan yer tutucu mesaja sızmaz", () => {
    expect(sablonDoldur("Merhaba {{ad}}, {{paket}} hazır.", { ad: "Ayşe", paket: "Aylık" })).toBe("Merhaba Ayşe, Aylık hazır.");
    expect(sablonDoldur("Merhaba {{ad}}, {{yok}} notu.", { ad: "Ayşe" })).toBe("Merhaba Ayşe, notu.");
  });
});

describe("kural çözümleme", () => {
  it("satırı olmayan tetikleyici pasif; satırı olan kendi ayarlarını taşır", () => {
    const kurallar = etkinKurallariOlustur([
      { id: "k1", tetikleyici_kodu: "uyelik_satis_ozet", aktif: true, sms_aktif: true, whatsapp_aktif: false, mail_aktif: false, mesaj_metni: "Merhaba", zamanlama_offset_dakika: null },
    ]);
    expect(kurallar.length).toBe(TETIKLEYICILER.length);
    const satis = kurallar.find((k) => k.tetikleyici_kodu === "uyelik_satis_ozet")!;
    expect(satis).toMatchObject({ id: "k1", aktif: true, sms_aktif: true, mesaj_metni: "Merhaba" });
    const baska = kurallar.find((k) => k.tetikleyici_kodu === "ders_iptal")!;
    expect(baska).toMatchObject({ id: null, aktif: false, sms_aktif: false, whatsapp_aktif: false, mail_aktif: false, mesaj_metni: "" });
  });

  it("zamanlanmış tetikleyicide ön değer kataloğun varsayılanıdır", () => {
    const k = etkinKurallariOlustur([]).find((x) => x.tetikleyici_kodu === "ders_hatirlatma")!;
    expect(k.zamanlama_offset_dakika).toBe(1440);
  });
});

describe("hata sınıflandırma", () => {
  it("kalıcı hatalar retry edilmez; bilinmeyen ve geçici hatalar edilir", () => {
    expect(hataDegerlendir("kredi_yetersiz")).toEqual({ kalici: true, kaliciDurum: "iptal" });
    expect(hataDegerlendir("gecersiz_alici")).toEqual({ kalici: true, kaliciDurum: "hata" });
    expect(hataDegerlendir("rate_limit").kalici).toBe(false);
    expect(hataDegerlendir("yeni_bir_kod").kalici).toBe(false);
    expect(hataDegerlendir(undefined).kalici).toBe(false);
  });
});

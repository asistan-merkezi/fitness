import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dondurSemasi,
  formVerisi,
  iadeSemasi,
  musteriRpcArgumanlari,
  musteriSemasi,
  odemeSemasi,
  paketSemasi,
  satisSemasi,
} from "./dogrulama";

const UUID = "11111111-1111-4111-8111-111111111111";
const temel = { ad_soyad: "  AYŞE   nur ", telefon: "0532 227 55 12", onay_kvkk_aydinlatma: "on" };

function ilkHata(sonuc: { success: boolean; error?: { issues: { message: string }[] } }) {
  return sonuc.success ? null : sonuc.error!.issues[0].message;
}

describe("formVerisi", () => {
  it("çoklu değerleri diziye, tekil değerleri metne çevirir; File yok sayılır", () => {
    const fd = new FormData();
    fd.append("a", "1");
    fd.append("b", "x");
    fd.append("b", "y");
    fd.append("f", new File(["x"], "x.txt"));
    expect(formVerisi(fd)).toEqual({ a: "1", b: ["x", "y"] });
  });
});

describe("musteriSemasi", () => {
  afterEach(() => vi.useRealTimers());

  it("ismi normalleştirir, telefonu +90 biçimine çevirir; açıklamaya dokunmaz", () => {
    const r = musteriSemasi.safeParse({ ...temel, not_metni: "  KENDİ yazdığı NOT  " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.ad_soyad).toBe("Ayşe Nur");
      expect(r.data.telefon).toBe("+905322275512");
      expect(r.data.not_metni).toBe("KENDİ yazdığı NOT"); // yalnız trim
    }
  });

  it("KVKK aydınlatma zorunlu", () => {
    expect(ilkHata(musteriSemasi.safeParse({ ad_soyad: "Ali Veli", telefon: "0532 227 55 12" }))).toMatch(/KVKK/);
  });

  it("geçersiz telefon / e-posta / TC / gelecek doğum tarihi reddedilir", () => {
    expect(ilkHata(musteriSemasi.safeParse({ ...temel, telefon: "123" }))).toMatch(/telefon/i);
    expect(ilkHata(musteriSemasi.safeParse({ ...temel, eposta: "yanlis" }))).toMatch(/e-posta/i);
    expect(ilkHata(musteriSemasi.safeParse({ ...temel, tc_kimlik_no: "12345678901" }))).toMatch(/T\.C\./);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
    expect(ilkHata(musteriSemasi.safeParse({ ...temel, dogum_tarihi: "2027-01-01" }))).toMatch(/geçmiş/);
  });

  it("18 yaş altı: veli ve veli onayı zorunlu; İstanbul gününe göre 18. gün", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T21:30:00Z")); // İstanbul: 1 Ekim 2026 00:30
    const kucuk = { ...temel, dogum_tarihi: "2010-05-05" };
    expect(ilkHata(musteriSemasi.safeParse(kucuk))).toMatch(/veli/i);
    const velili = { ...kucuk, veli_ad_soyad: "anne yılmaz", veli_telefon: "0533 111 22 33" };
    expect(ilkHata(musteriSemasi.safeParse(velili))).toMatch(/veli onayı/i);
    const tam = musteriSemasi.safeParse({ ...velili, onay_veli: "on" });
    expect(tam.success).toBe(true);
    if (tam.success) expect(tam.data.veli_ad_soyad).toBe("Anne Yılmaz");
    // bugün (İstanbul) 18 olan reşittir — UTC tarihiyle hesaplansaydı küçük sayılırdı
    expect(musteriSemasi.safeParse({ ...temel, dogum_tarihi: "2008-10-01" }).success).toBe(true);
  });

  it("sağlık bilgisi açık rıza olmadan reddedilir; rıza varsa risk bayrağı türetilir", () => {
    const veri = { ...temel, saglik_bayraklari: ["tansiyon", "sakatlik"], saglik_notu: "Diz" };
    expect(ilkHata(musteriSemasi.safeParse(veri))).toMatch(/açık rıza/);
    const r = musteriSemasi.safeParse({ ...veri, onay_acik_riza_saglik: "on" });
    expect(r.success).toBe(true);
    if (r.success) {
      const args = musteriRpcArgumanlari(r.data, "taslak-v1");
      expect(args.p_risk_bayraklari).toEqual(["saglik_riski", "sakatlik_riski"]);
      expect(args.p_hassas?.saglik_bayraklari).toEqual(["tansiyon", "sakatlik"]);
      expect(args.p_onamlar.map((o) => o.tur)).toEqual(["kvkk_aydinlatma", "acik_riza_saglik", "ticari_ileti"]);
      expect(args.p_onamlar.every((o) => o.metin_versiyonu === "taslak-v1")).toBe(true);
    }
  });

  it("tek seçili sağlık bayrağı (tek değer) dizi olarak kabul edilir", () => {
    const r = musteriSemasi.safeParse({ ...temel, saglik_bayraklari: "astim", onay_acik_riza_saglik: "on" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.saglik_bayraklari).toEqual(["astim"]);
  });

  it("acil durum kişisi ad ve telefonla birlikte", () => {
    expect(ilkHata(musteriSemasi.safeParse({ ...temel, acil_durum_ad_soyad: "Kişi" }))).toMatch(/birlikte/);
  });

  it("hassas veri yoksa p_hassas null; ticari ileti reddi de kaydedilir (verildi=false)", () => {
    const r = musteriSemasi.parse(temel);
    const args = musteriRpcArgumanlari(r, "v1");
    expect(args.p_hassas).toBeNull();
    expect(args.p_veli).toBeNull();
    expect(args.p_onamlar.find((o) => o.tur === "ticari_ileti")?.verildi).toBe(false);
  });
});

describe("paketSemasi", () => {
  const sure = { ad: "aylık üyelik", tur: "sure", sure_gun: "30", fiyat: "1.250,00" };

  it("süre paketi: TL -> kuruş, isim normalize", () => {
    const r = paketSemasi.safeParse(sure);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.ad).toBe("Aylık Üyelik");
      expect(r.data.fiyat).toBe(125_000);
      expect(r.data.kdv_orani).toBe(20);
      expect(r.data.dondurma_izni).toBe(false);
    }
  });

  it("tür tutarlılığı", () => {
    expect(ilkHata(paketSemasi.safeParse({ ...sure, sure_gun: undefined }))).toMatch(/gün sayısı/);
    expect(ilkHata(paketSemasi.safeParse({ ...sure, seans_sayisi: "5" }))).toMatch(/seans sayısı ve geçerlilik/);
    expect(ilkHata(paketSemasi.safeParse({ ad: "Seans", tur: "seans", fiyat: "100" }))).toMatch(/seans sayısı zorunlu/);
    expect(ilkHata(paketSemasi.safeParse({ ad: "Seans", tur: "seans", seans_sayisi: "5", sure_gun: "30", fiyat: "100" }))).toMatch(/süre girilmez/);
    expect(paketSemasi.safeParse({ ad: "Seans", tur: "seans", seans_sayisi: "10", gecerlilik_gun: "60", fiyat: "100" }).success).toBe(true);
  });

  it("dondurma kuralları", () => {
    expect(ilkHata(paketSemasi.safeParse({ ...sure, azami_dondurma_gun: "5" }))).toMatch(/izni kapalıyken/);
    expect(ilkHata(paketSemasi.safeParse({ ...sure, dondurma_izni: "on" }))).toMatch(/azami dondurma/);
    const r = paketSemasi.safeParse({ ...sure, dondurma_izni: "on", azami_dondurma_gun: "10", dondurma_ucret: "50" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dondurma_ucret).toBe(5_000);
  });

  it("geçersiz fiyat/KDV", () => {
    expect(ilkHata(paketSemasi.safeParse({ ...sure, fiyat: "abc" }))).toMatch(/fiyat/i);
    expect(ilkHata(paketSemasi.safeParse({ ...sure, kdv_orani: "150" }))).toMatch(/KDV/);
  });
});

describe("satış / ödeme / iade / dondurma şemaları", () => {
  it("satış: ödeme varsa yöntem zorunlu; TL -> kuruş", () => {
    const temelSatis = { musteri_id: UUID, paket_id: UUID, anahtar: UUID };
    expect(ilkHata(satisSemasi.safeParse({ ...temelSatis, odeme: "100" }))).toMatch(/yöntemi/);
    const r = satisSemasi.safeParse({ ...temelSatis, iskonto: "10,50", odeme: "100", odeme_yontemi: "nakit", baslangic: "2026-10-01" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.iskonto).toBe(1_050);
      expect(r.data.odeme).toBe(10_000);
      expect(r.data.baslangic).toBe("2026-10-01");
    }
    expect(satisSemasi.safeParse({ ...temelSatis, odeme_yontemi: "" }).success).toBe(true);
  });

  it("ödeme ve iade: tutar > 0, yöntem zorunlu, anahtar UUID", () => {
    expect(odemeSemasi.safeParse({ musteri_id: UUID, tutar: "0", yontem: "nakit", anahtar: UUID }).success).toBe(false);
    expect(odemeSemasi.safeParse({ musteri_id: UUID, tutar: "50", yontem: "bitcoin", anahtar: UUID }).success).toBe(false);
    expect(odemeSemasi.safeParse({ musteri_id: UUID, tutar: "50", yontem: "nakit", anahtar: "x" }).success).toBe(false);
    const r = odemeSemasi.safeParse({ musteri_id: UUID, tutar: "1.000,25", yontem: "havale", anahtar: UUID });
    expect(r.success && r.data.tutar).toBe(100_025);
    expect(iadeSemasi.safeParse({ musteri_id: UUID, iade_edilen_hareket_id: UUID, tutar: "10", yontem: "nakit", anahtar: UUID }).success).toBe(true);
    expect(iadeSemasi.safeParse({ musteri_id: UUID, tutar: "10", yontem: "nakit", anahtar: UUID }).success).toBe(false);
  });

  it("dondurma günü 1-365", () => {
    expect(dondurSemasi.safeParse({ uyelik_id: UUID, gun: "0" }).success).toBe(false);
    expect(dondurSemasi.safeParse({ uyelik_id: UUID, gun: "366" }).success).toBe(false);
    expect(dondurSemasi.safeParse({ uyelik_id: UUID, gun: "7" }).success).toBe(true);
  });
});

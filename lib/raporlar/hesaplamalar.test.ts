import { describe, expect, it } from "vitest";
import { dersDurumOzetiHesapla, finansOzetiCoz, gelirOzetiHesapla, giderKirilimiHesapla, gunlukDokumHesapla, toplamGider } from "./hesaplamalar";

describe("raporlar: saf hesaplar", () => {
  it("finans_ozet jsonb'i (string sayılar dahil) sayıya çevrilir; toplam gider = gider + personel hakediş", () => {
    const o = finansOzetiCoz({ gider_kurus: "5000", personel_hakedis_kurus: 12000, net_tahsilat_kurus: "30000" });
    expect(o.gider_kurus).toBe(5000);
    expect(toplamGider(o)).toBe(17000);
    expect(finansOzetiCoz(null)).toEqual({});
    expect(toplamGider(finansOzetiCoz(null))).toBe(0);
  });

  it("gelir detayı yönteme göre ayrılır, iade negatiflerden gelir, yalnız müşteri hareketleri sayılır", () => {
    const g = gelirOzetiHesapla([
      { kaynak: "musteri", yontem: "nakit", tutar_kurus: 10_000 },
      { kaynak: "musteri", yontem: "kredi_karti", tutar_kurus: 5_000 },
      { kaynak: "musteri", yontem: "havale", tutar_kurus: 2_000 },
      { kaynak: "musteri", yontem: null, tutar_kurus: 500 },
      { kaynak: "musteri", yontem: "nakit", tutar_kurus: -1_500 },
      { kaynak: "gider", yontem: "nakit", tutar_kurus: -9_999 },
      { kaynak: "manuel", yontem: "nakit", tutar_kurus: 7_000 },
    ]);
    expect(g).toEqual({ nakit: 10_000, krediKarti: 5_000, bankaHavalesi: 2_000, belirtilmemis: 500, iade: 1_500, netTahsilat: 16_000 });
  });

  it("gider kırılımı genel / kamusal / personel olarak toplanır", () => {
    const k = giderKirilimiHesapla(
      [
        { tur: "gider", tutar_kurus: 3_000 },
        { tur: "gider", tutar_kurus: 1_000 },
        { tur: "kamusal", tutar_kurus: 2_500 },
      ],
      8_000
    );
    expect(k).toEqual({ genel: 4_000, kamusal: 2_500, personel: 8_000, toplam: 14_500 });
  });

  it("ders durumu özeti: planlı/derste birlikte, iptal ve gelmedi birlikte", () => {
    const o = dersDurumOzetiHesapla([{ durum: "tamamlandi" }, { durum: "tamamlandi" }, { durum: "planlandi" }, { durum: "derste" }, { durum: "geldi" }, { durum: "ertelendi" }, { durum: "iptal" }, { durum: "gelmedi" }]);
    expect(o).toEqual({ tamamlanan: 2, planlanan: 3, ertelenen: 1, iptalVeGelmedi: 2 });
  });

  it("günlük döküm: dersler İstanbul gününe göre gruplanır, manuel kayıtlar dışarıda kalır, kalemler saate göre sıralanır", () => {
    // 2026-10-05 22:30Z = 06.10 01:30 İstanbul (ertesi gün); 07:00Z = 10:00 İstanbul.
    const adlar = new Map([["m1", "Ayşe"]]);
    const gunler = gunlukDokumHesapla(
      [
        { tarih: "2026-10-05", tutar_kurus: 10_000, kaynak: "musteri", aciklama: null, musteri_adi: "Ayşe" },
        { tarih: "2026-10-05", tutar_kurus: -2_000, kaynak: "gider", aciklama: "kira" },
        { tarih: "2026-10-05", tutar_kurus: -500, kaynak: "personel", aciklama: "Avans" },
        { tarih: "2026-10-05", tutar_kurus: 9_999, kaynak: "manuel", aciklama: "transfer" },
      ],
      [
        { id: "d1", musteri_id: "m1", baslangic: "2026-10-05T07:00:00Z", durum: "tamamlandi", ucret_kurus: 0, hak_dusuldu: true, borc_hareket_id: null },
        { id: "d2", musteri_id: "m1", baslangic: "2026-10-05T22:30:00Z", durum: "planlandi", ucret_kurus: 0, hak_dusuldu: false, borc_hareket_id: null },
      ],
      adlar
    );
    expect(gunler.map((g) => g.tarih)).toEqual(["2026-10-05", "2026-10-06"]);
    const g5 = gunler[0];
    expect(g5).toMatchObject({ gelir: 10_000, gider: 2_500, dersSayisi: 1 });
    expect(g5.kalemler[0]).toMatchObject({ tur: "ders", saat: "10:00", altBaslik: "Paketten düşüldü" }); // saatli kalem önce
    expect(g5.kalemler.some((k) => k.baslik === "Kira")).toBe(true);
    expect(g5.kalemler.length).toBe(4); // ders + tahsilat + gider + personel (manuel yok)
    expect(gunler[1].kalemler[0]).toMatchObject({ tur: "ders", saat: "01:30" });
  });
});

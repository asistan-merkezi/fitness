import { describe, expect, it } from "vitest";
import { bilinmeyenDegiskenleriBul } from "./degisken-dogrula";
import { kanalUygunlugu, manuelGonderilebilirTetikleyiciler, manuelMetniDoldur } from "./manuel-mesaj";

describe("elle mesaj", () => {
  it("personel ve bağlam isteyen şablonlar elenir", () => {
    const kodlar = manuelGonderilebilirTetikleyiciler().map((t) => t.kod);
    expect(kodlar).toContain("musteri_kayit_hosgeldin");
    expect(kodlar).not.toContain("uyelik_satis_ozet");
    expect(kodlar).not.toContain("odeme_makbuzu");
    expect(kodlar).not.toContain("izin_talebi_yoneticiye");
  });

  it("listedeki her şablon yalnız müşteri ve işletme adını kullanır", () => {
    for (const t of manuelGonderilebilirTetikleyiciler()) expect(bilinmeyenDegiskenleriBul(t.varsayilanMesajMetni, ["musteri_adi", "isletme_adi"]), t.kod).toEqual([]);
  });

  it("metni doldurur ve kanal uygunluğunu iletişim bilgisinden çıkarır", () => {
    expect(manuelMetniDoldur("Merhaba {{musteri_adi}} — {{isletme_adi}}", { musteri_adi: "Ayşe", isletme_adi: "Salon" })).toBe("Merhaba Ayşe — Salon");
    expect(kanalUygunlugu({ telefon: "05321234567", eposta: null })).toEqual({ sms: true, whatsapp: true, mail: false });
    expect(kanalUygunlugu({ telefon: " ", eposta: "a@b.co" })).toEqual({ sms: false, whatsapp: false, mail: true });
  });
});

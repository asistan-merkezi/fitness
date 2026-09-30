import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bugunuSabitle, hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

type DurumSonucu = { durum: string; yontem: string | null; kalan_hak: number | null; tutar_kurus: number | null };

// Sabit günler (İstanbul +03): 2026-10-05 10:00 = 07:00Z
const T = (saat: number, dakika = 0, gun = 5) => `2026-10-${String(gun).padStart(2, "0")}T${String(saat - 3).padStart(2, "0")}:${String(dakika).padStart(2, "0")}:00Z`;

describe("ders seansı: çakışma, durum akışı, ders hakkı / borç, yetki", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let muhasebeA: string;
  let antrenor1: string;
  let antrenor2: string;
  let adminB: string;
  let alan1: string;
  let alan2: string;
  let alanB: string;

  async function musteriOlustur(kullanici: string, ad: string) {
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ id: string }>(
        "SELECT public.musteri_olustur(p_ad_soyad => $1, p_telefon => '+905320000000', p_onamlar => '[{\"tur\":\"kvkk_aydinlatma\",\"verildi\":true,\"metin_versiyonu\":\"v1\"}]'::jsonb) AS id",
        [ad]
      );
      return r.rows[0].id;
    });
  }

  async function paket(tur: "sure" | "seans", o: { kapsam?: "giris" | "ders"; sure?: number; seans?: number; gecerlilik?: number; ad?: string }) {
    return kimlikle(db, adminA, async () => {
      const r = await db.query<{ id: string }>(
        "INSERT INTO public.uyelik_paketi (isletme_id, ad, tur, sure_gun, seans_sayisi, gecerlilik_gun, fiyat_kurus, kapsam) VALUES ($1,$2,$3,$4,$5,$6,10000,$7) RETURNING id",
        [isletmeA, o.ad ?? tur, tur, o.sure ?? null, o.seans ?? null, o.gecerlilik ?? null, o.kapsam ?? "giris"]
      );
      return r.rows[0].id;
    });
  }

  async function sat(m: string, p: string) {
    return kimlikle(db, resepsiyonA, async () => {
      const r = await db.query<{ id: string }>("SELECT public.uyelik_sat(p_musteri_id => $1, p_paket_id => $2) AS id", [m, p]);
      return r.rows[0].id;
    });
  }

  async function ders(kullanici: string, m: string, antrenor: string, alan: string, baslangic: string, sureDk = 60, ucret = 0, anahtar: string | null = null) {
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ id: string }>("SELECT public.ders_seansi_olustur($1,$2,$3,$4::timestamptz,$5,$6,NULL,$7) AS id", [m, antrenor, alan, baslangic, sureDk, ucret, anahtar]);
      return r.rows[0].id;
    });
  }

  async function durum(kullanici: string, id: string, hedef: string, gecikme: number | null = null): Promise<DurumSonucu> {
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ s: DurumSonucu }>("SELECT public.ders_seansi_durum($1,$2,$3) AS s", [id, hedef, gecikme]);
      return r.rows[0].s;
    });
  }

  async function kalan(uyelikId: string) {
    return (await db.query<{ kalan_hak: number }>("SELECT kalan_hak FROM public.uyelik WHERE id = $1", [uyelikId])).rows[0].kalan_hak;
  }

  async function borcSayisi(m: string) {
    return Number((await db.query<{ c: string }>("SELECT count(*) AS c FROM public.musteri_bakiye_hareket WHERE musteri_id = $1 AND tur = 'borc'", [m])).rows[0].c);
  }

  beforeAll(async () => {
    db = await yeniVeritabani();
    await bugunuSabitle(db, "2026-10-01");
    isletmeA = await isletmeOlustur(db, "Salon A");
    isletmeB = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin" });
    resepsiyonA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
    muhasebeA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "muhasebe" });
    antrenor1 = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor", adSoyad: "Ali Hoca" });
    antrenor2 = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor", adSoyad: "Veli Hoca" });
    adminB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "isletme_admin" });
    const a = await kimlikle(db, adminA, async () => (await db.query<{ id: string }[]>("INSERT INTO public.alan_studyo (isletme_id, ad) VALUES ($1,'Stüdyo 1'), ($1,'Stüdyo 2') RETURNING id", [isletmeA])).rows);
    alan1 = (a[0] as unknown as { id: string }).id;
    alan2 = (a[1] as unknown as { id: string }).id;
    alanB = await kimlikle(db, adminB, async () => (await db.query<{ id: string }>("INSERT INTO public.alan_studyo (isletme_id, ad) VALUES ($1,'Salon B Alanı') RETURNING id", [isletmeB])).rows[0].id);
  }, 120_000);

  describe("çakışma kontrolü", () => {
    let m1: string;
    let m2: string;
    let ilk: string;

    beforeAll(async () => {
      m1 = await musteriOlustur(resepsiyonA, "Müşteri Bir");
      m2 = await musteriOlustur(resepsiyonA, "Müşteri İki");
      ilk = await ders(resepsiyonA, m1, antrenor1, alan1, T(10));
    });

    it("aynı antrenör, aynı saatte iki derste olamaz", async () => {
      expect(await hataMesaji(() => ders(resepsiyonA, m2, antrenor1, alan2, T(10, 30)))).toMatch(/antrenor_dolu/);
    });

    it("aynı alan, aynı saatte iki derse verilemez", async () => {
      expect(await hataMesaji(() => ders(resepsiyonA, m2, antrenor2, alan1, T(10, 30)))).toMatch(/alan_dolu/);
    });

    it("aynı müşteri aynı saatte iki derste olamaz", async () => {
      expect(await hataMesaji(() => ders(resepsiyonA, m1, antrenor2, alan2, T(10, 15)))).toMatch(/musteri_dolu/);
    });

    it("art arda dersler (bitiş = başlangıç) çakışmaz", async () => {
      const id = await ders(resepsiyonA, m2, antrenor1, alan1, T(11));
      expect(id).toBeTruthy();
    });

    it("iptal edilen dersin yeri boşalır; geri alınırken dolmuşsa çakışma verir", async () => {
      await durum(resepsiyonA, ilk, "iptal");
      const yeni = await ders(resepsiyonA, m2, antrenor2, alan1, T(10));
      expect(yeni).toBeTruthy();
      expect(await hataMesaji(() => durum(resepsiyonA, ilk, "planlandi"))).toMatch(/alan_dolu/);
    });

    it("aynı anahtarla tekrar gönderim aynı dersi döndürür (çift kayıt yok)", async () => {
      const anahtar = "11111111-1111-4111-8111-111111111111";
      const bir = await ders(resepsiyonA, m1, antrenor2, alan2, T(14, 0, 6), 60, 0, anahtar);
      const iki = await ders(resepsiyonA, m1, antrenor2, alan2, T(14, 0, 6), 60, 0, anahtar);
      expect(iki).toBe(bir);
    });

    it("geçersiz süre, pasif/yanlış antrenör ve başka işletmenin alanı reddedilir", async () => {
      expect(await hataMesaji(() => ders(resepsiyonA, m1, antrenor1, alan1, T(16), 10))).toMatch(/sure_gecersiz/);
      expect(await hataMesaji(() => ders(resepsiyonA, m1, resepsiyonA, alan1, T(16)))).toMatch(/antrenor_bulunamadi/);
      expect(await hataMesaji(() => ders(resepsiyonA, m1, antrenor1, alanB, T(16)))).toMatch(/alan_bulunamadi/);
    });
  });

  describe("yetki ve izolasyon", () => {
    let m: string;
    let d1: string;
    let d2: string;

    beforeAll(async () => {
      m = await musteriOlustur(resepsiyonA, "Yetki Müşterisi");
      d1 = await ders(resepsiyonA, m, antrenor1, alan1, T(9, 0, 7));
      d2 = await ders(resepsiyonA, m, antrenor2, alan2, T(11, 0, 7));
    });

    it("muhasebe ve antrenör ders oluşturamaz", async () => {
      expect(await hataMesaji(() => ders(muhasebeA, m, antrenor1, alan1, T(15, 0, 7)))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => ders(antrenor1, m, antrenor1, alan1, T(15, 0, 7)))).toMatch(/yetki_yetersiz/);
    });

    it("antrenör yalnız kendi derslerini görür; resepsiyon hepsini; muhasebe hiçbirini; başka işletme hiçbirini", async () => {
      const say = async (k: string) =>
        kimlikle(db, k, async () => (await db.query<{ id: string }>("SELECT id FROM public.ders_seansi WHERE baslangic >= '2026-10-07T00:00:00Z' AND baslangic < '2026-10-08T00:00:00Z'")).rows.map((r) => r.id));
      expect(await say(antrenor1)).toEqual([d1]);
      expect(await say(antrenor2)).toEqual([d2]);
      expect((await say(resepsiyonA)).sort()).toEqual([d1, d2].sort());
      expect(await say(muhasebeA)).toEqual([]);
      expect(await say(adminB)).toEqual([]);
    });

    it("antrenör kendi dersini derste/tamamlandı yapar; başkasının dersine veya başka duruma dokunamaz", async () => {
      expect((await durum(antrenor1, d1, "derste")).durum).toBe("derste");
      expect((await durum(antrenor1, d1, "tamamlandi")).durum).toBe("tamamlandi");
      expect(await hataMesaji(() => durum(antrenor1, d2, "tamamlandi"))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => durum(antrenor1, d1, "geldi"))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => durum(muhasebeA, d1, "iptal"))).toMatch(/yetki_yetersiz/);
    });

    it("başka işletmenin yöneticisi dersi göremez/değiştiremez; tablolara doğrudan yazılamaz", async () => {
      expect(await hataMesaji(() => durum(adminB, d1, "iptal"))).toMatch(/ders_bulunamadi/);
      const hata = await hataMesaji(() => kimlikle(db, resepsiyonA, () => db.query("UPDATE public.ders_seansi SET durum = 'iptal' WHERE id = $1", [d2])));
      expect(hata).toMatch(/permission denied/i);
    });

    it("anonim rol fonksiyonları çalıştıramaz", async () => {
      const hata = await hataMesaji(async () => {
        await db.exec("SET ROLE anon");
        try {
          await db.query("SELECT public.ders_seansi_durum($1, 'iptal', NULL)", [d2]);
        } finally {
          await db.exec("RESET ROLE");
        }
      });
      expect(hata).toMatch(/permission denied/i);
    });
  });

  describe("erteleme", () => {
    it("yalnız planlandı/ertelendi dersler taşınır; çakışma ve süre kuralları geçerli", async () => {
      const m = await musteriOlustur(resepsiyonA, "Erteleme Müşterisi");
      const d = await ders(resepsiyonA, m, antrenor1, alan1, T(9, 0, 8));
      const engel = await ders(resepsiyonA, await musteriOlustur(resepsiyonA, "Engel Müşterisi"), antrenor1, alan2, T(13, 0, 8));

      await kimlikle(db, resepsiyonA, () => db.query("SELECT public.ders_seansi_tasi($1, $2::timestamptz)", [d, T(12, 0, 8)]));
      const satir = (await db.query<{ durum: string; baslangic: Date; bitis: Date }>("SELECT durum, baslangic, bitis FROM public.ders_seansi WHERE id = $1", [d])).rows[0];
      expect(satir.durum).toBe("ertelendi");
      expect(satir.bitis.getTime() - satir.baslangic.getTime()).toBe(3_600_000); // süre korunur

      expect(await hataMesaji(() => kimlikle(db, resepsiyonA, () => db.query("SELECT public.ders_seansi_tasi($1, $2::timestamptz)", [d, T(13, 30, 8)])))).toMatch(/antrenor_dolu/);

      await durum(resepsiyonA, d, "tamamlandi");
      expect(await hataMesaji(() => kimlikle(db, resepsiyonA, () => db.query("SELECT public.ders_seansi_tasi($1, $2::timestamptz)", [d, T(18, 0, 8)])))).toMatch(/ders_tasinamaz/);
      expect(engel).toBeTruthy();
    });
  });

  describe("ders hakkı ve cari borç", () => {
    it("ders paketinden FIFO hak düşer; gelmedi/iptal/planlandıya alınırsa hak geri verilir; tekrar işlenmez", async () => {
      const m = await musteriOlustur(resepsiyonA, "Paketli Müşteri");
      const pkt = await paket("seans", { kapsam: "ders", seans: 5, gecerlilik: 60, ad: "5 PT" });
      const uyelik = await sat(m, pkt);
      const d = await ders(resepsiyonA, m, antrenor1, alan1, T(9, 0, 9));

      const s1 = await durum(resepsiyonA, d, "geldi");
      expect(s1.yontem).toBe("hak");
      expect(await kalan(uyelik)).toBe(4);

      // Aynı dersi tekrar işaretlemek ikinci hak düşmez.
      expect((await durum(resepsiyonA, d, "tamamlandi")).yontem).toBe("zaten_islendi");
      expect(await kalan(uyelik)).toBe(4);

      // Yanlış işaretleme düzeltilir: hak geri gelir.
      expect((await durum(resepsiyonA, d, "gelmedi")).yontem).toBe("geri_verildi");
      expect(await kalan(uyelik)).toBe(5);
      expect((await durum(resepsiyonA, d, "geldi")).yontem).toBe("hak");
      expect(await kalan(uyelik)).toBe(4);
      expect(await borcSayisi(m)).toBe(1); // yalnız paket satışının borcu
    });

    it("birden çok ders paketinde bitişi yakın olan önce kullanılır", async () => {
      const m = await musteriOlustur(resepsiyonA, "Fifo Müşterisi");
      const uzun = await sat(m, await paket("seans", { kapsam: "ders", seans: 3, gecerlilik: 90, ad: "Uzun" }));
      const kisa = await sat(m, await paket("seans", { kapsam: "ders", seans: 3, gecerlilik: 10, ad: "Kısa" }));
      await durum(resepsiyonA, await ders(resepsiyonA, m, antrenor1, alan1, T(9, 0, 10)), "derste");
      expect(await kalan(kisa)).toBe(2);
      expect(await kalan(uzun)).toBe(3);
    });

    it("salon giriş paketi ders hakkını yemez; ders paketi de check-in hakkı açmaz/düşmez", async () => {
      const m = await musteriOlustur(resepsiyonA, "Kapsam Müşterisi");
      const girisPaketi = await sat(m, await paket("seans", { kapsam: "giris", seans: 5, gecerlilik: 60, ad: "Giriş 5" }));
      const dersPaketi = await sat(m, await paket("seans", { kapsam: "ders", seans: 5, gecerlilik: 60, ad: "Ders 5" }));

      await durum(resepsiyonA, await ders(resepsiyonA, m, antrenor1, alan1, T(9, 0, 11)), "geldi");
      expect(await kalan(dersPaketi)).toBe(4);
      expect(await kalan(girisPaketi)).toBe(5);

      const giris = await kimlikle(db, resepsiyonA, async () => (await db.query<{ s: { sonuc: string; uyelik_id?: string } }>("SELECT public.check_in($1) AS s", [m])).rows[0].s);
      expect(giris.sonuc).toBe("kabul");
      expect(giris.uyelik_id).toBe(girisPaketi);
      expect(await kalan(girisPaketi)).toBe(4);
      expect(await kalan(dersPaketi)).toBe(4);
    });

    it("yalnız ders paketi olan müşteri salona giremez (uyelik_yok)", async () => {
      const m = await musteriOlustur(resepsiyonA, "Yalnız Ders");
      await sat(m, await paket("seans", { kapsam: "ders", seans: 5, gecerlilik: 60, ad: "Ders 5b" }));
      const giris = await kimlikle(db, resepsiyonA, async () => (await db.query<{ s: { sonuc: string; red_nedeni?: string } }>("SELECT public.check_in($1) AS s", [m])).rows[0].s);
      expect(giris).toMatchObject({ sonuc: "red", red_nedeni: "uyelik_yok" });
    });

    it("paketi yoksa ders ücreti cariye BİR kez borç yazılır; borç işlenmiş ders geri alınamaz", async () => {
      const m = await musteriOlustur(resepsiyonA, "Borçlu Müşteri");
      const d = await ders(resepsiyonA, m, antrenor1, alan1, T(9, 0, 12), 60, 75_000);

      const s = await durum(resepsiyonA, d, "tamamlandi");
      expect(s).toMatchObject({ yontem: "borc", tutar_kurus: 75_000 });
      expect(await borcSayisi(m)).toBe(1);

      expect((await durum(resepsiyonA, d, "geldi")).yontem).toBe("zaten_islendi");
      expect(await borcSayisi(m)).toBe(1);

      expect(await hataMesaji(() => durum(resepsiyonA, d, "iptal"))).toMatch(/borc_islendi/);
      expect(await hataMesaji(() => durum(resepsiyonA, d, "gelmedi"))).toMatch(/borc_islendi/);
    });

    it("paketi ve ücreti yoksa ücretsiz işlenir (borç yazılmaz)", async () => {
      const m = await musteriOlustur(resepsiyonA, "Deneme Müşterisi");
      const s = await durum(resepsiyonA, await ders(resepsiyonA, m, antrenor1, alan1, T(9, 0, 13)), "geldi");
      expect(s.yontem).toBe("yok");
      expect(await borcSayisi(m)).toBe(0);
    });

    it("gecikmeli geldi için dakika zorunlu; dakika yalnız o durumda tutulur", async () => {
      const m = await musteriOlustur(resepsiyonA, "Geç Müşteri");
      const d = await ders(resepsiyonA, m, antrenor1, alan1, T(9, 0, 14));
      expect(await hataMesaji(() => durum(resepsiyonA, d, "gecikmeli_geldi"))).toMatch(/gecikme_gerekli/);
      await durum(resepsiyonA, d, "gecikmeli_geldi", 15);
      expect((await db.query<{ gecikme_dakika: number }>("SELECT gecikme_dakika FROM public.ders_seansi WHERE id = $1", [d])).rows[0].gecikme_dakika).toBe(15);
      await durum(resepsiyonA, d, "geldi");
      expect((await db.query<{ gecikme_dakika: number | null }>("SELECT gecikme_dakika FROM public.ders_seansi WHERE id = $1", [d])).rows[0].gecikme_dakika).toBeNull();
    });

    it("ders kapsamı yalnız seans paketlerinde olabilir", async () => {
      const hata = await hataMesaji(() => paket("sure", { kapsam: "ders", sure: 30, ad: "Süreli Ders" }));
      expect(hata).toMatch(/paket_kapsam_kurali/);
    });
  });
});

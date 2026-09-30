import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bugunuSabitle, hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

type Bakiye = { hak_gun: number; kullanilan_gun: number; bekleyen_gun: number; kalan_gun: number };

// İstanbul yerel saatini UTC ISO'ya çevirir (+03).
const Z = (tarih: string, saat: number, dk = 0) => {
  const [y, a, g] = tarih.split("-").map(Number);
  return new Date(Date.UTC(y, a - 1, g, saat - 3, dk)).toISOString();
};

describe("personel izin: iş günü, bakiye, talep-onay akışı, çakışma, ders atama", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let muhasebeA: string;
  let adminB: string;
  let antrenor: string;
  let antrenor2: string;
  let alan: string;
  let musteri: string;

  const is = (k: string, bas: string, bit: string) =>
    kimlikle(db, k, async () => (await db.query<{ n: number }>("SELECT public.izin_is_gunu_sayisi($1::date,$2::date) AS n", [bas, bit])).rows[0].n);
  const talep = (k: string, tip: string, bas: string, bit: string, gerekce: string | null = null) =>
    kimlikle(db, k, async () => (await db.query<{ id: string }>("SELECT public.izin_talep_olustur($1,$2::date,$3::date,$4) AS id", [tip, bas, bit, gerekce])).rows[0].id);
  const degerlendir = (k: string, id: string, onay: boolean, red: string | null = null) =>
    kimlikle(db, k, async () => (await db.query<{ n: number }>("SELECT public.izin_talep_degerlendir($1,$2,$3) AS n", [id, onay, red])).rows[0].n);
  const iptal = (k: string, id: string) => kimlikle(db, k, () => db.query("SELECT public.izin_talep_iptal($1)", [id]));
  const bakiye = (k: string, hedef: string | null = null) =>
    kimlikle(db, k, async () => (await db.query<Bakiye>("SELECT * FROM public.izin_bakiye($1)", [hedef])).rows[0]);
  const durum = async (id: string) => (await db.query<{ durum: string }>("SELECT durum FROM public.izin_talebi WHERE id = $1", [id])).rows[0].durum;

  async function dersOlustur(antrenorId: string, baslangic: string) {
    return kimlikle(db, resepsiyonA, async () => (await db.query<{ id: string }>("SELECT public.ders_seansi_olustur($1,$2,$3,$4::timestamptz,60,0,NULL,NULL) AS id", [musteri, antrenorId, alan, baslangic])).rows[0].id);
  }

  beforeAll(async () => {
    db = await yeniVeritabani();
    await bugunuSabitle(db, "2026-10-01"); // Perşembe
    isletmeA = await isletmeOlustur(db, "Salon A");
    isletmeB = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin" });
    resepsiyonA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
    muhasebeA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "muhasebe" });
    adminB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "isletme_admin" });
    antrenor = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor", adSoyad: "Ali Hoca" });
    antrenor2 = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor", adSoyad: "Veli Hoca" });
    alan = await kimlikle(db, adminA, async () => (await db.query<{ id: string }>("INSERT INTO public.alan_studyo (isletme_id, ad) VALUES ($1,'Stüdyo') RETURNING id", [isletmeA])).rows[0].id);
    musteri = await kimlikle(db, resepsiyonA, async () => {
      const r = await db.query<{ id: string }>(
        "SELECT public.musteri_olustur(p_ad_soyad => 'Ders Müşterisi', p_telefon => '+905320000000', p_onamlar => '[{\"tur\":\"kvkk_aydinlatma\",\"verildi\":true,\"metin_versiyonu\":\"v1\"}]'::jsonb) AS id"
      );
      return r.rows[0].id;
    });
  }, 120_000);

  describe("iş günü sayımı", () => {
    it("Pazar sayılmaz, Cumartesi sayılır; uçlar dahil", async () => {
      expect(await is(resepsiyonA, "2026-10-05", "2026-10-11")).toBe(6); // Pzt-Paz: Pazar hariç
      expect(await is(resepsiyonA, "2026-10-10", "2026-10-10")).toBe(1); // Cumartesi
      expect(await is(resepsiyonA, "2026-10-11", "2026-10-11")).toBe(0); // Pazar
    });

    it("resmi tatil (Cumhuriyet Bayramı, 29 Ekim) sayılmaz; işletmenin kendi tatili de sayılmaz", async () => {
      expect(await is(resepsiyonA, "2026-10-28", "2026-10-30")).toBe(2);
      await kimlikle(db, adminA, () => db.query("INSERT INTO public.resmi_tatil (isletme_id, tarih, ad) VALUES ($1, '2026-11-02', 'Salon Yıldönümü')", [isletmeA]));
      expect(await is(resepsiyonA, "2026-11-02", "2026-11-02")).toBe(0);
      expect(await is(adminB, "2026-11-02", "2026-11-02")).toBe(1); // başka işletmeyi etkilemez
    });

    it("ters ve aşırı geniş aralık reddedilir", async () => {
      expect(await hataMesaji(() => is(resepsiyonA, "2026-10-10", "2026-10-01"))).toMatch(/tarih_araligi_gecersiz/);
      expect(await hataMesaji(() => is(resepsiyonA, "2020-01-01", "2026-01-01"))).toMatch(/tarih_araligi_cok_uzun/);
    });

    it("işletme yöneticisi dışındakiler resmi tatil ekleyemez/silemez; genel tatiller silinemez", async () => {
      expect(await hataMesaji(() => kimlikle(db, resepsiyonA, () => db.query("INSERT INTO public.resmi_tatil (isletme_id, tarih, ad) VALUES ($1, '2026-12-01', 'X')", [isletmeA])))).toMatch(/row-level security|permission/i);
      const silinen = await kimlikle(db, adminA, async () => (await db.query("DELETE FROM public.resmi_tatil WHERE isletme_id IS NULL RETURNING id")).rows.length);
      expect(silinen).toBe(0);
    });
  });

  describe("bakiye", () => {
    it("işe giriş tarihi yoksa 14 gün; kıdeme göre hak; devir eklenir", async () => {
      expect((await bakiye(antrenor)).hak_gun).toBe(14);
      const profil = (k: string, giris: string | null, devir = 0) =>
        kimlikle(db, adminA, () =>
          db.query("INSERT INTO public.personel_profil (kullanici_id, isletme_id, ise_giris_tarihi, izin_devir_gun) VALUES ($1,$2,$3,$4) ON CONFLICT (kullanici_id) DO UPDATE SET ise_giris_tarihi = $3, izin_devir_gun = $4", [k, isletmeA, giris, devir])
        );
      await profil(antrenor, "2026-06-01"); // 4 ay: 1 yıldan az
      expect((await bakiye(antrenor)).hak_gun).toBe(0);
      await profil(antrenor, "2024-01-01"); // ~2,7 yıl
      expect((await bakiye(antrenor)).hak_gun).toBe(14);
      await profil(antrenor, "2019-01-01"); // ~7,8 yıl
      expect((await bakiye(antrenor)).hak_gun).toBe(20);
      await profil(antrenor, "2005-01-01"); // 20+ yıl
      expect((await bakiye(antrenor)).hak_gun).toBe(26);
      await profil(antrenor, "2024-01-01", 5);
      expect((await bakiye(antrenor)).hak_gun).toBe(19);
      await profil(antrenor, "2024-01-01", 0);
    });

    it("kişi kendi bakiyesini, yönetici herkesinkini görür; başkası göremez", async () => {
      expect(await hataMesaji(() => bakiye(resepsiyonA, antrenor))).toMatch(/yetki_yetersiz/);
      expect((await bakiye(adminA, antrenor)).hak_gun).toBe(14);
      expect(await hataMesaji(() => bakiye(adminB, antrenor))).toMatch(/personel_bulunamadi|yetki/);
    });
  });

  describe("talep, onay ve iptal akışı", () => {
    let t1: string;

    it("her rol kendi talebini açar; gün sayısı iş günüdür; bakiye beklemede düşer", async () => {
      t1 = await talep(antrenor, "yillik", "2026-10-05", "2026-10-09", "Dinlenme"); // 5 iş günü
      const r = (await db.query<{ gun_sayisi: number; durum: string }>("SELECT gun_sayisi, durum FROM public.izin_talebi WHERE id = $1", [t1])).rows[0];
      expect(r).toEqual({ gun_sayisi: 5, durum: "beklemede" });
      expect(await bakiye(antrenor)).toMatchObject({ hak_gun: 14, kullanilan_gun: 0, bekleyen_gun: 5, kalan_gun: 9 });
      expect(await talep(muhasebeA, "mazeret", "2026-10-02", "2026-10-02")).toBeTruthy();
    });

    it("çakışan talep, geçmiş yıllık izin, yetersiz bakiye ve yalnız Pazar günü reddedilir", async () => {
      expect(await hataMesaji(() => talep(antrenor, "mazeret", "2026-10-08", "2026-10-12"))).toMatch(/izin_cakisma/);
      expect(await hataMesaji(() => talep(antrenor, "yillik", "2026-09-28", "2026-09-29"))).toMatch(/gecmis_izin/);
      expect(await hataMesaji(() => talep(antrenor, "yillik", "2026-12-01", "2026-12-31"))).toMatch(/izin_bakiyesi_yetersiz/);
      expect(await hataMesaji(() => talep(antrenor, "mazeret", "2026-10-18", "2026-10-18"))).toMatch(/izin_gun_yok/);
      expect(await hataMesaji(() => talep(antrenor, "ucretsiz", "2026-10-20", "2026-10-21"))).toMatch(/izin_tipi_gecersiz/);
    });

    it("yalnız işletme yöneticisi değerlendirir; ret gerekçesi zorunlu", async () => {
      expect(await hataMesaji(() => degerlendir(resepsiyonA, t1, true))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => degerlendir(adminB, t1, true))).toMatch(/izin_bulunamadi|yetki/);
      expect(await hataMesaji(() => degerlendir(adminA, t1, false))).toMatch(/red_gerekce_gerekli/);
      expect(await hataMesaji(() => degerlendir(adminA, t1, false, "   "))).toMatch(/red_gerekce_gerekli/);
    });

    it("onay bakiyeyi kullanılana çevirir; aynı talep ikinci kez değerlendirilemez", async () => {
      await degerlendir(adminA, t1, true);
      expect(await durum(t1)).toBe("onaylandi");
      expect(await bakiye(antrenor)).toMatchObject({ kullanilan_gun: 5, bekleyen_gun: 0, kalan_gun: 9 });
      expect(await hataMesaji(() => degerlendir(adminA, t1, true))).toMatch(/izin_durumu_uygun_degil/);
    });

    it("ret sonrası tarih yeniden kullanılabilir; bakiye geri gelmez-düşmez", async () => {
      const r = await talep(antrenor2, "yillik", "2026-10-14", "2026-10-15");
      await degerlendir(adminA, r, false, "Yoğun dönem");
      expect(await durum(r)).toBe("reddedildi");
      expect((await bakiye(antrenor2)).kalan_gun).toBe(14);
      expect(await talep(antrenor2, "yillik", "2026-10-14", "2026-10-15")).toBeTruthy();
    });

    it("sahibi kendi bekleyen talebini iptal eder; başkası edemez; iptal bakiyeyi iade eder", async () => {
      const t = await talep(antrenor2, "yillik", "2026-11-09", "2026-11-10");
      expect(await hataMesaji(() => iptal(antrenor, t))).toMatch(/yetki_yetersiz/);
      const once = (await bakiye(antrenor2)).kalan_gun;
      await iptal(antrenor2, t);
      expect(await durum(t)).toBe("iptal");
      expect((await bakiye(antrenor2)).kalan_gun).toBe(once + 2);
    });

    it("onaylı izin başlamadıysa iptal edilebilir (yönetici de); başlamışsa edilemez", async () => {
      const gelecek = await talep(antrenor2, "mazeret", "2026-11-16", "2026-11-16");
      await degerlendir(adminA, gelecek, true);
      await iptal(adminA, gelecek);
      expect(await durum(gelecek)).toBe("iptal");

      // Bugün (1 Ekim) başlayan onaylı izin artık iptal edilemez.
      const basladi = await kimlikle(db, adminA, async () => (await db.query<{ id: string }>("SELECT public.izin_manuel_ekle($1,'mazeret','2026-10-01','2026-10-01','Acil') AS id", [antrenor])).rows[0].id);
      expect(await durum(basladi)).toBe("onaylandi");
      expect(await hataMesaji(() => iptal(adminA, basladi))).toMatch(/izin_durumu_uygun_degil/);
    });

    it("yönetici geçmişe dönük izin girebilir; resepsiyon giremez; manuel yıllık izin de bakiyeyi aşamaz", async () => {
      const id = await kimlikle(db, adminA, async () => (await db.query<{ id: string }>("SELECT public.izin_manuel_ekle($1,'rapor','2026-09-20','2026-09-22','Rapor') AS id", [resepsiyonA])).rows[0].id);
      expect(await durum(id)).toBe("onaylandi");
      const hata = (k: string, sql: string, arg: unknown[]) => hataMesaji(() => kimlikle(db, k, () => db.query(sql, arg)));
      expect(await hata(resepsiyonA, "SELECT public.izin_manuel_ekle($1,'rapor','2026-09-01','2026-09-02',NULL)", [muhasebeA])).toMatch(/yetki_yetersiz/);
      expect(await hata(adminA, "SELECT public.izin_manuel_ekle($1,'yillik','2026-12-01','2026-12-31',NULL)", [antrenor2])).toMatch(/izin_bakiyesi_yetersiz/);
      expect(await hata(adminA, "SELECT public.izin_manuel_ekle($1,'rapor','2026-09-01','2026-09-02',NULL)", [adminB])).toMatch(/personel_bulunamadi/);
    });
  });

  describe("ders atama ve görünürlük", () => {
    it("izinli antrenöre ders atanamaz ve taşınamaz; izin dışı günlerde atanır", async () => {
      // antrenör: 5-9 Ekim onaylı yıllık izin
      expect(await hataMesaji(() => dersOlustur(antrenor, Z("2026-10-06", 10)))).toMatch(/antrenor_izinli/);
      const d = await dersOlustur(antrenor, Z("2026-10-12", 10));
      expect(d).toBeTruthy();
      expect(await hataMesaji(() => kimlikle(db, resepsiyonA, () => db.query("SELECT public.ders_seansi_tasi($1,$2::timestamptz)", [d, Z("2026-10-07", 10)])))).toMatch(/antrenor_izinli/);
      // Başka antrenöre taşımak da kontrol edilir: izinli olana taşıma reddedilir.
      const d2 = await dersOlustur(antrenor2, Z("2026-10-13", 10));
      expect(await hataMesaji(() => kimlikle(db, resepsiyonA, () => db.query("SELECT public.ders_seansi_tasi($1,$2::timestamptz,NULL,$3)", [d2, Z("2026-10-08", 10), antrenor])))).toMatch(/antrenor_izinli/);
    });

    it("onay, izinle çakışan planlı ders sayısını döndürür", async () => {
      await dersOlustur(antrenor2, Z("2026-11-17", 10));
      await dersOlustur(antrenor2, Z("2026-11-17", 12));
      const t = await talep(antrenor2, "mazeret", "2026-11-17", "2026-11-17");
      expect(await degerlendir(adminA, t, true)).toBe(2);
    });

    it("izin talebini yalnız sahibi ve yönetici görür", async () => {
      const say = (k: string) => kimlikle(db, k, async () => (await db.query<{ kullanici_id: string }>("SELECT DISTINCT kullanici_id FROM public.izin_talebi")).rows.map((r) => r.kullanici_id));
      expect(await say(antrenor)).toEqual([antrenor]);
      expect(await say(resepsiyonA)).toEqual([resepsiyonA]);
      expect((await say(adminA)).length).toBeGreaterThanOrEqual(4);
      expect(await say(adminB)).toEqual([]);
    });

    it("tablolara doğrudan yazılamaz (yalnız fonksiyonlar)", async () => {
      const hata = await hataMesaji(() =>
        kimlikle(db, adminA, () => db.query("INSERT INTO public.izin_talebi (isletme_id, kullanici_id, tip, baslangic_tarihi, bitis_tarihi, gun_sayisi) VALUES ($1,$2,'mazeret','2027-01-04','2027-01-04',1)", [isletmeA, antrenor]))
      );
      expect(hata).toMatch(/permission denied/i);
    });
  });
});

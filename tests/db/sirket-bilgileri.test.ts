import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

const GECERLI_IBAN = "TR330006100519786457841326";

describe("şirket bilgileri ve banka hesapları", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let muhasebeA: string;
  let adminB: string;

  const guncelle = (k: string, isletme: string, sql: string, arg: unknown[] = []) =>
    kimlikle(db, k, async () => (await db.query(`UPDATE public.isletme SET ${sql} WHERE id = $1 RETURNING id`, [isletme, ...arg])).rows.length);
  const hesapEkle = (k: string, isletme: string, iban: string, ad = "Ziraat Bankası") =>
    kimlikle(db, k, () => db.query("INSERT INTO public.isletme_banka_hesabi (isletme_id, banka_adi, hesap_sahibi, iban) VALUES ($1,$2,'Salon A Ltd. Şti.',$3)", [isletme, ad, iban]));

  beforeAll(async () => {
    db = await yeniVeritabani();
    isletmeA = await isletmeOlustur(db, "Salon A");
    isletmeB = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin" });
    resepsiyonA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
    muhasebeA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "muhasebe" });
    adminB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "isletme_admin" });
  }, 120_000);

  describe("kurumsal bilgiler", () => {
    it("yalnız kendi işletmesinin yöneticisi günceller", async () => {
      expect(await guncelle(adminA, isletmeA, "unvan = 'Salon A Spor Hizmetleri Ltd. Şti.', il = 'İstanbul', ilce = 'Kadıköy'")).toBe(1);
      expect(await guncelle(resepsiyonA, isletmeA, "unvan = 'X'")).toBe(0);
      expect(await guncelle(muhasebeA, isletmeA, "unvan = 'X'")).toBe(0);
      expect(await guncelle(adminB, isletmeA, "unvan = 'X'")).toBe(0);
      expect((await db.query<{ unvan: string }>("SELECT unvan FROM public.isletme WHERE id = $1", [isletmeA])).rows[0].unvan).toBe("Salon A Spor Hizmetleri Ltd. Şti.");
    });

    it("vergi no 10-11 hane; telefon +90 ile 10 hane; e-posta biçimi doğrulanır", async () => {
      const hata = (sql: string) => hataMesaji(() => guncelle(adminA, isletmeA, sql));
      expect(await hata("vergi_no = '123'")).toMatch(/isletme_vergi_no_kurali/);
      expect(await hata("vergi_no = '12345678901234'")).toMatch(/isletme_vergi_no_kurali/);
      expect(await hata("telefon = '05321234567'")).toMatch(/isletme_telefon_kurali/);
      expect(await hata("whatsapp_no = '+9053212345'")).toMatch(/isletme_telefon_kurali/);
      expect(await hata("eposta = 'gecersiz'")).toMatch(/isletme_eposta_kurali/);
      expect(await guncelle(adminA, isletmeA, "vergi_no = '1234567890', telefon = '+905321234567', eposta = 'info@salon.com', yetkili_eposta = 'mudur@salon.com'")).toBe(1);
    });

    it("çalışma saati çifti birlikte dolu/boş olur; bitiş başlangıca eşit olamaz; kapalı gün boş bırakılır", async () => {
      const hata = (sql: string) => hataMesaji(() => guncelle(adminA, isletmeA, sql));
      expect(await hata("hafta_ici_baslangic = '08:00'")).toMatch(/isletme_saat_kurali/);
      expect(await hata("hafta_ici_baslangic = '08:00', hafta_ici_bitis = '08:00'")).toMatch(/isletme_saat_kurali/);
      expect(await guncelle(adminA, isletmeA, "hafta_ici_baslangic = '07:00', hafta_ici_bitis = '23:00', cumartesi_baslangic = '09:00', cumartesi_bitis = '20:00', pazar_baslangic = NULL, pazar_bitis = NULL")).toBe(1);
    });

    it("plan ve aktiflik yönetici tarafından değiştirilemez", async () => {
      expect(await hataMesaji(() => guncelle(adminA, isletmeA, "plan = 'buyuk'"))).toMatch(/yetki_yetersiz/);
    });

    it("audit_log yalnız alan adını tutar, değeri değil", async () => {
      const r = await db.query<{ degisen_alanlar: string[] }>("SELECT degisen_alanlar FROM public.audit_log WHERE tablo = 'isletme' AND degisen_alanlar @> ARRAY['vergi_no'] LIMIT 1");
      expect(r.rows.length).toBe(1);
      expect(JSON.stringify(r.rows[0])).not.toMatch(/1234567890/);
    });
  });

  describe("IBAN doğrulama", () => {
    const gecerli = async (iban: string) => (await db.query<{ g: boolean }>("SELECT public.iban_gecerli($1) AS g", [iban])).rows[0].g;

    it("geçerli IBAN (boşluklu/küçük harf dahil) kabul; bozuk sağlama, kısa, yabancı ülke ve boş reddedilir", async () => {
      expect(await gecerli(GECERLI_IBAN)).toBe(true);
      expect(await gecerli("tr33 0006 1005 1978 6457 8413 26")).toBe(true);
      expect(await gecerli("TR330006100519786457841327")).toBe(false); // sağlama hanesi bozuk
      expect(await gecerli("TR33000610051978645784132")).toBe(false); // 1 hane eksik
      expect(await gecerli("DE89370400440532013000")).toBe(false);
      expect(await gecerli("")).toBe(false);
    });
  });

  describe("banka hesapları", () => {
    it("yönetici ve muhasebe ekler; IBAN boşluksuz büyük harfle saklanır; aynı IBAN ikinci kez eklenemez", async () => {
      await hesapEkle(adminA, isletmeA, "tr33 0006 1005 1978 6457 8413 26");
      const r = await db.query<{ iban: string }>("SELECT iban FROM public.isletme_banka_hesabi WHERE isletme_id = $1", [isletmeA]);
      expect(r.rows[0].iban).toBe(GECERLI_IBAN);
      expect(await hataMesaji(() => hesapEkle(muhasebeA, isletmeA, GECERLI_IBAN))).toMatch(/duplicate|unique/i);
    });

    it("geçersiz IBAN reddedilir", async () => {
      expect(await hataMesaji(() => hesapEkle(adminA, isletmeA, "TR330006100519786457841327"))).toMatch(/check/i);
    });

    it("resepsiyon hesapları göremez/ekleyemez; başka işletme göremez; silme yetkisi yok", async () => {
      const say = (k: string) => kimlikle(db, k, async () => (await db.query("SELECT id FROM public.isletme_banka_hesabi")).rows.length);
      expect(await say(adminA)).toBe(1);
      expect(await say(muhasebeA)).toBe(1);
      expect(await say(resepsiyonA)).toBe(0);
      expect(await say(adminB)).toBe(0);
      expect(await hataMesaji(() => hesapEkle(resepsiyonA, isletmeA, "TR290006400000112345678901"))).toMatch(/row-level security/i);
      expect(await hataMesaji(() => hesapEkle(adminB, isletmeA, "TR290006400000112345678901"))).toMatch(/row-level security/i);
      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("DELETE FROM public.isletme_banka_hesabi")))).toMatch(/permission denied/i);
    });

    it("hesap pasife alınabilir (silinmez)", async () => {
      const n = await kimlikle(db, adminA, async () => (await db.query("UPDATE public.isletme_banka_hesabi SET aktif = false WHERE isletme_id = $1 RETURNING id", [isletmeA])).rows.length);
      expect(n).toBe(1);
    });
  });

  describe("araçlar", () => {
    const aracEkle = (k: string, isletme: string, plaka: string) =>
      kimlikle(db, k, () => db.query("INSERT INTO public.isletme_arac (isletme_id, marka, model, plaka) VALUES ($1,'Fiat','Doblo',$2)", [isletme, plaka]));

    it("yalnız yönetici ekler; plaka boşluksuz büyük harfle saklanır; aynı plaka ikinci kez eklenemez", async () => {
      await aracEkle(adminA, isletmeA, "34 abc 123");
      expect((await db.query<{ plaka: string }>("SELECT plaka FROM public.isletme_arac WHERE isletme_id = $1", [isletmeA])).rows[0].plaka).toBe("34ABC123");
      expect(await hataMesaji(() => aracEkle(adminA, isletmeA, "34ABC123"))).toMatch(/duplicate|unique/i);
      expect(await hataMesaji(() => aracEkle(muhasebeA, isletmeA, "06XYZ99"))).toMatch(/row-level security/i);
      expect(await hataMesaji(() => aracEkle(resepsiyonA, isletmeA, "06XYZ99"))).toMatch(/row-level security/i);
      expect(await hataMesaji(() => aracEkle(adminB, isletmeA, "06XYZ99"))).toMatch(/row-level security/i);
    });

    it("yönetici ve muhasebe görür; resepsiyon ve başka işletme görmez; silinemez, pasife alınır", async () => {
      const say = (k: string) => kimlikle(db, k, async () => (await db.query("SELECT id FROM public.isletme_arac")).rows.length);
      expect(await say(adminA)).toBe(1);
      expect(await say(muhasebeA)).toBe(1);
      expect(await say(resepsiyonA)).toBe(0);
      expect(await say(adminB)).toBe(0);
      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("DELETE FROM public.isletme_arac")))).toMatch(/permission denied/i);
      expect(await kimlikle(db, adminA, async () => (await db.query("UPDATE public.isletme_arac SET aktif = false WHERE isletme_id = $1 RETURNING id", [isletmeA])).rows.length)).toBe(1);
    });
  });
});

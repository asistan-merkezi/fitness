import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bugunuSabitle, hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

const GECERLI_TC = "10000000146";

describe("personel: kişisel bilgiler, belgeler, iş başvurusu, puantaj", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let muhasebeA: string;
  let adminB: string;
  let antrenor: string;
  let antrenor2: string;

  const rpc = <T = unknown>(k: string, sql: string, arg: unknown[] = []) => kimlikle(db, k, async () => (await db.query<T>(sql, arg)).rows);
  const say = (k: string, tablo: string) => kimlikle(db, k, async () => (await db.query(`SELECT 1 FROM public.${tablo}`)).rows.length);

  beforeAll(async () => {
    db = await yeniVeritabani();
    await bugunuSabitle(db, "2026-10-14");
    isletmeA = await isletmeOlustur(db, "Salon A");
    isletmeB = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin" });
    resepsiyonA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
    muhasebeA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "muhasebe" });
    adminB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "isletme_admin" });
    antrenor = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor", adSoyad: "Ali Hoca" });
    antrenor2 = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor", adSoyad: "Veli Hoca" });
  }, 120_000);

  describe("kişisel bilgiler", () => {
    const kaydet = (k: string, hedef: string, o: { tel?: string | null; dogum?: string | null; tc?: string | null; il?: string | null; acilAd?: string | null; acilTel?: string | null } = {}) =>
      rpc(k, "SELECT public.personel_kisisel_kaydet($1,$2,$3::date,$4,$5,'Kadıköy','Moda','Sk. 1',$6,$7)", [hedef, o.tel ?? null, o.dogum ?? null, o.tc ?? null, o.il ?? null, o.acilAd ?? null, o.acilTel ?? null]);

    it("yalnız yönetici yazar; T.C., tarih ve acil kişi (ad+telefon birlikte) doğrulanır", async () => {
      await kaydet(adminA, antrenor, { tel: "+905321112233", dogum: "1990-05-01", tc: GECERLI_TC, il: "İstanbul", acilAd: "Eş", acilTel: "+905320000001" });
      expect(await hataMesaji(() => kaydet(resepsiyonA, antrenor))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => kaydet(muhasebeA, antrenor))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => kaydet(adminB, antrenor))).toMatch(/personel_bulunamadi/);
      expect(await hataMesaji(() => kaydet(adminA, antrenor, { tc: "12345678901" }))).toMatch(/tc_gecersiz/);
      expect(await hataMesaji(() => kaydet(adminA, antrenor, { dogum: "2030-01-01" }))).toMatch(/dogum_tarihi_gecersiz/);
      expect(await hataMesaji(() => kaydet(adminA, antrenor, { acilAd: "Eş" }))).toMatch(/acil_kisi_eksik/);
      expect(await hataMesaji(() => kaydet(adminA, antrenor, { tel: "05321112233" }))).toMatch(/check/i);
    });

    it("kayıt tüm alanları değiştirir (boş alan temizler); doğrudan yazılamaz", async () => {
      await kaydet(adminA, antrenor, { il: "Ankara" });
      const s = (await db.query<{ il: string; tc_kimlik_no: string | null; telefon: string | null }>("SELECT il, tc_kimlik_no, telefon FROM public.personel_kisisel WHERE kullanici_id = $1", [antrenor])).rows[0];
      expect(s).toEqual({ il: "Ankara", tc_kimlik_no: null, telefon: null });
      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("UPDATE public.personel_kisisel SET il = 'X'")))).toMatch(/permission denied/i);
    });

    it("yönetici ve kişinin kendisi okur; muhasebe, resepsiyon, başka personel ve başka işletme GÖRMEZ (özel veri)", async () => {
      await kaydet(adminA, antrenor, { tc: GECERLI_TC });
      await kaydet(adminA, antrenor2, { tc: "10000000146".replace(/.$/, "6") });
      expect(await say(adminA, "personel_kisisel")).toBe(2);
      expect(await say(antrenor, "personel_kisisel")).toBe(1);
      expect(await say(muhasebeA, "personel_kisisel")).toBe(0);
      expect(await say(resepsiyonA, "personel_kisisel")).toBe(0);
      expect(await say(adminB, "personel_kisisel")).toBe(0);
    });

    it("yıllık izin hakkı: 50 yaş ve üzeri için en az 20 gün (kıdem kısa olsa da); doğum tarihi yoksa kıdem kuralı", async () => {
      await kimlikle(db, adminA, () => db.query("INSERT INTO public.personel_profil (kullanici_id, isletme_id, maas_kurus, ders_prim_kurus, ise_giris_tarihi) VALUES ($1,$2,0,0,'2024-01-01')", [antrenor, isletmeA]));
      const hak = async (kisi: string) => (await rpc<{ hak_gun: number }>(adminA, "SELECT hak_gun FROM public.izin_bakiye($1)", [kisi]))[0].hak_gun;
      await kaydet(adminA, antrenor, { dogum: "1990-05-01" });
      expect(await hak(antrenor)).toBe(14); // 2-3 yıl kıdem, 36 yaş
      await kaydet(adminA, antrenor, { dogum: "1970-05-01" });
      expect(await hak(antrenor)).toBe(20); // 56 yaş → en az 20
    });
  });

  describe("belgeler", () => {
    const ekle = (k: string, hedef: string, tur = "sertifika", ad = "PT Sertifikası", bitis: string | null = "2027-01-01") =>
      rpc<{ id: string }>(k, "SELECT public.personel_belge_ekle($1,$2,$3,'Spor Akademisi','A-1','2025-01-01'::date,$4::date,NULL) AS id", [hedef, tur, ad, bitis]).then((r) => r[0].id);

    it("yönetici ekler/kaldırır (silinmez, pasifleşir); tür, ad ve tarih sırası doğrulanır", async () => {
      const id = await ekle(adminA, antrenor);
      expect(await hataMesaji(() => ekle(resepsiyonA, antrenor))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => ekle(adminB, antrenor))).toMatch(/personel_bulunamadi/);
      expect(await hataMesaji(() => ekle(adminA, antrenor, "yok"))).toMatch(/check/i);
      expect(await hataMesaji(() => ekle(adminA, antrenor, "sertifika", "PT", "2024-01-01"))).toMatch(/belge_tarih_kurali|check/i);
      await rpc(adminA, "SELECT public.personel_belge_kaldir($1)", [id]);
      expect((await db.query<{ aktif: boolean }>("SELECT aktif FROM public.personel_belge WHERE id = $1", [id])).rows[0].aktif).toBe(false);
      expect(await hataMesaji(() => rpc(adminA, "SELECT public.personel_belge_kaldir($1)", [id]))).toMatch(/belge_bulunamadi/);
    });

    it("belge kayıtlarını yönetici ve kişinin kendisi görür; muhasebe ve başkası görmez", async () => {
      await ekle(adminA, antrenor2, "ilk_yardim", "İlk Yardım", null);
      expect(await say(adminA, "personel_belge")).toBeGreaterThanOrEqual(1);
      expect(await say(antrenor2, "personel_belge")).toBe(1);
      expect(await say(antrenor, "personel_belge")).toBe(1); // yalnız kendisininki (kaldırılmış olan dahil, aktif filtresi uygulamada)
      expect(await say(muhasebeA, "personel_belge")).toBe(0);
      expect(await say(adminB, "personel_belge")).toBe(0);
    });
  });

  describe("iş başvurusu", () => {
    const ekle = (isletme: string, telefon: string) =>
      db.query("INSERT INTO public.is_basvurusu (isletme_id, ad_soyad, telefon, kvkk_aydinlatma_verildi, metin_versiyonu) VALUES ($1,'Aday Kişi',$2,true,'v1')", [isletme, telefon]);
    const sonuc = (k: string, id: string, durum: string, kisi: string | null = null) => rpc(k, "SELECT public.is_basvurusu_sonuclandir($1,$2,$3,'not')", [id, durum, kisi]);

    it("aynı telefondan bekleyen tek başvuru olur; yalnız yönetici okur ve sonuçlandırır; doğrudan yazılamaz", async () => {
      await ekle(isletmeA, "+905330000001");
      await expect(ekle(isletmeA, "+905330000001")).rejects.toThrow(/duplicate|unique/i);
      await ekle(isletmeB, "+905330000001"); // başka işletme serbest
      expect(await say(adminA, "is_basvurusu")).toBe(1);
      expect(await say(resepsiyonA, "is_basvurusu")).toBe(0);
      expect(await say(muhasebeA, "is_basvurusu")).toBe(0);
      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("INSERT INTO public.is_basvurusu (isletme_id, ad_soyad, telefon, kvkk_aydinlatma_verildi, metin_versiyonu) VALUES ($1,'X Y','+905330000009',true,'v1')", [isletmeA])))).toMatch(/permission denied/i);

      const id = (await db.query<{ id: string }>("SELECT id FROM public.is_basvurusu WHERE isletme_id = $1", [isletmeA])).rows[0].id;
      expect(await hataMesaji(() => sonuc(resepsiyonA, id, "olumlu"))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => sonuc(adminB, id, "olumlu"))).toMatch(/basvuru_bulunamadi/);
      expect(await hataMesaji(() => sonuc(adminA, id, "beklemede"))).toMatch(/durum_gecersiz/);
      await sonuc(adminA, id, "olumlu", antrenor);
      const s = (await db.query<{ durum: string; kullanici_id: string }>("SELECT durum, kullanici_id FROM public.is_basvurusu WHERE id = $1", [id])).rows[0];
      expect(s).toEqual({ durum: "olumlu", kullanici_id: antrenor });
      expect(await hataMesaji(() => sonuc(adminA, id, "olumsuz"))).toMatch(/basvuru_bulunamadi/); // zaten sonuçlanmış
      await ekle(isletmeA, "+905330000001"); // sonuçlanınca aynı telefon yeniden başvurabilir
    });
  });

  describe("puantaj", () => {
    const kaydet = (k: string, kisi: string, tarih: string, durum = "geldi", fm = 0) =>
      rpc(k, "SELECT public.personel_puantaj_kaydet($1,$2::date,$3,'09:00'::time,'18:00'::time,$4,NULL)", [kisi, tarih, durum, fm]);

    it("yalnız yönetici yazar; aynı gün ikinci kayıt günceller; gelecek ve kayıtsız personel reddedilir", async () => {
      await kaydet(adminA, antrenor, "2026-10-12");
      await kaydet(adminA, antrenor, "2026-10-12", "yarim_gun", 30);
      const satirlar = (await db.query<{ durum: string; fazla_mesai_dk: number }>("SELECT durum, fazla_mesai_dk FROM public.personel_puantaj WHERE kullanici_id = $1 AND tarih = '2026-10-12'", [antrenor])).rows;
      expect(satirlar).toEqual([{ durum: "yarim_gun", fazla_mesai_dk: 30 }]);
      expect(await hataMesaji(() => kaydet(resepsiyonA, antrenor, "2026-10-12"))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => kaydet(muhasebeA, antrenor, "2026-10-12"))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => kaydet(adminA, antrenor, "2026-10-15"))).toMatch(/gelecek_tarih/);
      expect(await hataMesaji(() => kaydet(adminB, antrenor, "2026-10-12"))).toMatch(/personel_bulunamadi/);
      expect(await hataMesaji(() => kaydet(adminA, antrenor, "2026-10-12", "yok"))).toMatch(/check/i);
      expect(await hataMesaji(() => rpc(adminA, "SELECT public.personel_puantaj_kaydet($1,'2026-10-12'::date,'geldi','18:00'::time,'09:00'::time,0,NULL)", [antrenor]))).toMatch(/puantaj_saat_kurali|check/i);
    });

    it("onaylı izin gününe puantaj yazılamaz", async () => {
      const talep = await kimlikle(db, antrenor2, async () => (await db.query<{ id: string }>("SELECT public.izin_talep_olustur('mazeret','2026-10-14'::date,'2026-10-14'::date,NULL) AS id")).rows[0].id);
      await rpc(adminA, "SELECT public.izin_talep_degerlendir($1,true,NULL)", [talep]);
      expect(await hataMesaji(() => kaydet(adminA, antrenor2, "2026-10-14"))).toMatch(/puantaj_izinli_gun/);
    });

    it("yönetici, muhasebe ve kişinin kendisi okur; resepsiyon ve başka işletme görmez", async () => {
      expect(await say(adminA, "personel_puantaj")).toBeGreaterThanOrEqual(1);
      expect(await say(muhasebeA, "personel_puantaj")).toBeGreaterThanOrEqual(1);
      expect(await say(antrenor, "personel_puantaj")).toBe(1);
      expect(await say(antrenor2, "personel_puantaj")).toBe(0);
      expect(await say(resepsiyonA, "personel_puantaj")).toBe(0);
      expect(await say(adminB, "personel_puantaj")).toBe(0);
    });

    it("hakediş deftere yazılmış aya puantaj yazılamaz ve silinemez; açık aya silinebilir", async () => {
      await kaydet(adminA, antrenor, "2026-10-09");
      await rpc(adminA, "SELECT public.personel_puantaj_sil($1,'2026-10-09'::date)", [antrenor]);
      expect((await db.query("SELECT 1 FROM public.personel_puantaj WHERE kullanici_id = $1 AND tarih = '2026-10-09'", [antrenor])).rows.length).toBe(0);

      // Eylül hakedişi kapatılır (profil tanımlı: maaş > 0) → o aya puantaj yazılamaz/silinemez; Ekim hâlâ açık.
      await db.query("UPDATE public.personel_profil SET maas_kurus = 3000000 WHERE kullanici_id = $1", [antrenor]);
      await kaydet(adminA, antrenor, "2026-09-10"); // kapatmadan önce yazılabilir
      await rpc(adminA, "SELECT public.personel_donem_kapat('2026-09-01'::date)");
      expect(await hataMesaji(() => kaydet(adminA, antrenor, "2026-09-11"))).toMatch(/puantaj_donem_kapali/);
      expect(await hataMesaji(() => rpc(adminA, "SELECT public.personel_puantaj_sil($1,'2026-09-10'::date)", [antrenor]))).toMatch(/puantaj_donem_kapali/);
      await kaydet(adminA, antrenor, "2026-10-13"); // açık ay etkilenmez
    });
  });
});

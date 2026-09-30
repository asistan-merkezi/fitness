import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

describe("mesajlaşma: kurallar, kuyruk, kredi aynası, ticari izin", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let adminB: string;
  let superAdmin: string;

  const servis = async <T>(fn: () => Promise<T>): Promise<T> => {
    await db.exec("SET ROLE service_role");
    try {
      return await fn();
    } finally {
      await db.exec("RESET ROLE");
    }
  };
  const kuyruga = (anahtar: string, isletme = isletmeA, durum = "beklemede") =>
    servis(() =>
      db.query(
        "INSERT INTO public.mesaj_kuyrugu (isletme_id, tetikleyici_kodu, kanal, alici_tipi, alici_id, alici_adres, gonderilecek_metin, idempotency_anahtari, durum) VALUES ($1,'uyelik_satis_ozet','sms','musteri',gen_random_uuid(),'+905320000000','Merhaba',$2,$3)",
        [isletme, anahtar, durum]
      )
    );
  const bakiye = async (isletme: string, kanal: string) =>
    (await db.query<{ bakiye: number; merkez_bakiye_versiyonu: number | string }>("SELECT bakiye, merkez_bakiye_versiyonu FROM public.mesaj_kredi WHERE isletme_id = $1 AND kanal = $2", [isletme, kanal])).rows[0];

  beforeAll(async () => {
    db = await yeniVeritabani();
    isletmeA = await isletmeOlustur(db, "Salon A");
    isletmeB = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin" });
    resepsiyonA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
    adminB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "isletme_admin" });
    superAdmin = await kullaniciOlustur(db, { isletmeId: null, rol: "super_admin" });
  }, 120_000);

  describe("kurallar", () => {
    const ekle = (k: string, isletme: string, kod: string, metin = "Merhaba") =>
      kimlikle(db, k, () => db.query("INSERT INTO public.mesaj_kurali (isletme_id, tetikleyici_kodu, aktif, sms_aktif, mesaj_metni) VALUES ($1,$2,true,true,$3)", [isletme, kod, metin]));

    it("yalnız kendi işletmesinin yöneticisi yazar; aynı tetikleyici iki kez eklenemez", async () => {
      await ekle(adminA, isletmeA, "uyelik_satis_ozet");
      expect(await hataMesaji(() => ekle(adminA, isletmeA, "uyelik_satis_ozet"))).toMatch(/duplicate|unique/i);
      expect(await hataMesaji(() => ekle(resepsiyonA, isletmeA, "x1"))).toMatch(/row-level security/i);
      expect(await hataMesaji(() => ekle(adminB, isletmeA, "x2"))).toMatch(/row-level security/i);
    });

    it("yalnız yönetici okur; resepsiyon ve başka işletme göremez", async () => {
      const say = (k: string) => kimlikle(db, k, async () => (await db.query("SELECT id FROM public.mesaj_kurali")).rows.length);
      expect(await say(adminA)).toBe(1);
      expect(await say(resepsiyonA)).toBe(0);
      expect(await say(adminB)).toBe(0);
    });

    it("uzun metin ve geçersiz zamanlama reddedilir; kural güncellenir", async () => {
      expect(await hataMesaji(() => ekle(adminA, isletmeA, "uzun", "x".repeat(1001)))).toMatch(/check/i);
      const hata = await hataMesaji(() => kimlikle(db, adminA, () => db.query("UPDATE public.mesaj_kurali SET zamanlama_offset_dakika = -5 WHERE isletme_id = $1", [isletmeA])));
      expect(hata).toMatch(/check/i);
      const n = await kimlikle(db, adminA, async () => (await db.query("UPDATE public.mesaj_kurali SET mesaj_metni = 'Yeni metin', zamanlama_offset_dakika = 1440 WHERE isletme_id = $1 RETURNING id", [isletmeA])).rows.length);
      expect(n).toBe(1);
    });
  });

  describe("kuyruk", () => {
    it("yalnız service_role yazar; kullanıcılar doğrudan ekleyemez", async () => {
      await kuyruga("anahtar-1");
      const hata = await hataMesaji(() =>
        kimlikle(db, adminA, () =>
          db.query("INSERT INTO public.mesaj_kuyrugu (isletme_id, tetikleyici_kodu, kanal, alici_tipi, alici_id, alici_adres, gonderilecek_metin, idempotency_anahtari) VALUES ($1,'x','sms','musteri',gen_random_uuid(),'+90','m','a2')", [isletmeA])
        )
      );
      expect(hata).toMatch(/permission denied/i);
    });

    it("aynı idempotency anahtarı ikinci satır açmaz; geçersiz durum/kanal reddedilir", async () => {
      expect(await hataMesaji(() => kuyruga("anahtar-1"))).toMatch(/duplicate|unique/i);
      expect(await hataMesaji(() => kuyruga("anahtar-2", isletmeA, "kayip"))).toMatch(/check/i);
    });

    it("yalnız kendi işletmesinin yöneticisi okur", async () => {
      const say = (k: string) => kimlikle(db, k, async () => (await db.query("SELECT id FROM public.mesaj_kuyrugu")).rows.length);
      expect(await say(adminA)).toBe(1);
      expect(await say(resepsiyonA)).toBe(0);
      expect(await say(adminB)).toBe(0);
    });
  });

  describe("kredi aynası", () => {
    it("yükleme yalnız platform yöneticisinde; işletme yöneticisi kendi kredisini yazamaz", async () => {
      const yukle = (k: string, isletme: string, miktar: number, kanal = "sms") => kimlikle(db, k, () => db.query("SELECT public.mesaj_kredi_yukle($1,$2,$3,15000,'Paket')", [isletme, kanal, miktar]));
      expect(await hataMesaji(() => yukle(adminA, isletmeA, 500))).toMatch(/yetki_yetersiz/);
      await yukle(superAdmin, isletmeA, 500);
      await yukle(superAdmin, isletmeA, 250);
      expect((await bakiye(isletmeA, "sms")).bakiye).toBe(750);
      expect(await hataMesaji(() => yukle(superAdmin, isletmeA, 0))).toMatch(/miktar_gecersiz/);
      expect(await hataMesaji(() => yukle(superAdmin, isletmeA, 10, "fax"))).toMatch(/kanal_gecersiz/);
    });

    it("yükleme hareketi kaydedilir ve değiştirilemez/silinemez; yalnız yönetici görür", async () => {
      expect((await db.query("SELECT id FROM public.mesaj_kredi_hareket WHERE isletme_id = $1", [isletmeA])).rows.length).toBe(2);
      expect(await hataMesaji(() => db.query("UPDATE public.mesaj_kredi_hareket SET miktar = 1"))).toMatch(/defter_degismez/);
      expect(await hataMesaji(() => db.query("DELETE FROM public.mesaj_kredi_hareket"))).toMatch(/defter_degismez/);
      const say = (k: string) => kimlikle(db, k, async () => (await db.query("SELECT id FROM public.mesaj_kredi")).rows.length);
      expect(await say(adminA)).toBe(1);
      expect(await say(resepsiyonA)).toBe(0);
      expect(await say(adminB)).toBe(0);
    });

    it("merkez senkronu yalnız service_role; eski versiyon yenisini ezemez; ilk senkron satır açar", async () => {
      const senk = (isletme: string, bak: number, ver: number, kanal = "sms") => servis(() => db.query("SELECT public.mesaj_kredi_senkronla($1,$2,$3,$4)", [isletme, kanal, bak, ver]));
      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("SELECT public.mesaj_kredi_senkronla($1,'sms',999,5)", [isletmeA])))).toMatch(/permission denied/i);

      await senk(isletmeA, 700, 10);
      expect(await bakiye(isletmeA, "sms")).toMatchObject({ bakiye: 700, merkez_bakiye_versiyonu: 10 });
      await senk(isletmeA, 650, 12);
      expect((await bakiye(isletmeA, "sms")).bakiye).toBe(650);
      await senk(isletmeA, 9999, 11); // gecikmiş eski yanıt
      await senk(isletmeA, 9999, 12); // aynı versiyon da ezmez
      expect(await bakiye(isletmeA, "sms")).toMatchObject({ bakiye: 650, merkez_bakiye_versiyonu: 12 });

      await senk(isletmeB, 40, 1, "whatsapp");
      expect((await bakiye(isletmeB, "whatsapp")).bakiye).toBe(40);
    });

    it("negatif bakiye ve bozuk kanal senkronda reddedilir", async () => {
      const senk = (bak: number, kanal = "sms") => servis(() => db.query("SELECT public.mesaj_kredi_senkronla($1,$2,$3,99)", [isletmeA, kanal, bak]));
      expect(await hataMesaji(() => senk(-1))).toMatch(/senkron_degeri_gecersiz/);
      expect(await hataMesaji(() => senk(5, "fax"))).toMatch(/kanal_gecersiz/);
    });
  });

  describe("ticari ileti izni", () => {
    it("en son onam kaydı belirler; yalnız service_role sorgular", async () => {
      const musteri = await kimlikle(db, resepsiyonA, async () => {
        const r = await db.query<{ id: string }>(
          "SELECT public.musteri_olustur(p_ad_soyad => 'Onam Müşterisi', p_telefon => '+905320000000', p_onamlar => '[{\"tur\":\"kvkk_aydinlatma\",\"verildi\":true,\"metin_versiyonu\":\"v1\"}]'::jsonb) AS id"
        );
        return r.rows[0].id;
      });
      const izin = () => servis(async () => (await db.query<{ g: boolean }>("SELECT public.musteri_ticari_izin($1) AS g", [musteri])).rows[0].g);
      expect(await izin()).toBe(false); // hiç kayıt yok

      await db.query("INSERT INTO public.musteri_onam (musteri_id, isletme_id, tur, verildi, metin_versiyonu, created_at) VALUES ($1,$2,'ticari_ileti',true,'v1', now() - interval '2 day')", [musteri, isletmeA]);
      expect(await izin()).toBe(true);
      await db.query("INSERT INTO public.musteri_onam (musteri_id, isletme_id, tur, verildi, metin_versiyonu) VALUES ($1,$2,'ticari_ileti',false,'v1')", [musteri, isletmeA]);
      expect(await izin()).toBe(false); // izin geri çekildi

      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("SELECT public.musteri_ticari_izin($1)", [musteri])))).toMatch(/permission denied/i);
    });
  });
  describe("zamanlanmış tarama yardımcıları", () => {
    let m1: string;
    let m2: string;
    let m3: string;

    beforeAll(async () => {
      const yarat = (ad: string, dogum: string | null) =>
        kimlikle(db, resepsiyonA, async () => {
          const r = await db.query<{ id: string }>(
            "SELECT public.musteri_olustur(p_ad_soyad => $1, p_telefon => '+905320000001', p_dogum_tarihi => $2::date, p_onamlar => '[{\"tur\":\"kvkk_aydinlatma\",\"verildi\":true,\"metin_versiyonu\":\"v1\"}]'::jsonb) AS id",
            [ad, dogum]
          );
          return r.rows[0].id;
        });
      m1 = await yarat("Doğum Günü Bir", "1990-10-05");
      m2 = await yarat("Şubat Yirmidokuz", "1992-02-29");
      m3 = await yarat("Ara Müşteri", null);
    });

    const dogum = (tarih: string) => servis(async () => (await db.query<{ id: string }>("SELECT id FROM public.mesaj_dogum_gunu_musterileri($1,$2::date)", [isletmeA, tarih])).rows.map((r) => r.id));

    it("doğum günü ay/gün eşleşmesi; 29 Şubatlılar artık olmayan yılda 28 Şubat'ta", async () => {
      expect(await dogum("2026-10-05")).toEqual([m1]);
      expect(await dogum("2026-10-06")).toEqual([]);
      expect(await dogum("2026-02-28")).toEqual([m2]); // 2026 artık yıl değil
      expect(await dogum("2028-02-28")).toEqual([]); // 2028 artık yıl: 29'unda kutlanır
      expect(await dogum("2028-02-29")).toEqual([m2]);
      expect(m3).toBeTruthy();
    });

    it("özledik: son girişten TAM N gün sonra ve o günden beri giriş yoksa; yalnız service_role", async () => {
      const paket = await kimlikle(db, adminA, async () => (await db.query<{ id: string }>("INSERT INTO public.uyelik_paketi (isletme_id, ad, tur, sure_gun, fiyat_kurus) VALUES ($1,'Aylık','sure',30,10000) RETURNING id", [isletmeA])).rows[0].id);
      await kimlikle(db, resepsiyonA, () => db.query("SELECT public.uyelik_sat(p_musteri_id => $1, p_paket_id => $2)", [m1, paket]));
      await kimlikle(db, resepsiyonA, () => db.query("SELECT public.check_in($1)", [m1]));
      await db.query("UPDATE public.giris_kaydi SET giris_tarihi = DATE '2026-09-01' WHERE musteri_id = $1", [m1]);

      const ozledik = (bugun: string, gun: number) => servis(async () => (await db.query<{ id: string }>("SELECT id FROM public.mesaj_ozledik_musterileri($1,$2::date,$3)", [isletmeA, bugun, gun])).rows.map((r) => r.id));
      expect(await ozledik("2026-10-01", 30)).toEqual([m1]);
      expect(await ozledik("2026-10-02", 30)).toEqual([]); // 31. gün: tek hatırlatma
      expect(await ozledik("2026-09-30", 30)).toEqual([]);
      expect(await ozledik("2026-10-01", 7)).toEqual([]);

      // Sonradan giriş yaptıysa son giriş değişir; eski eşleşme düşer.
      await db.query("INSERT INTO public.giris_kaydi (isletme_id, musteri_id, uyelik_id, sonuc, giris_tarihi) SELECT isletme_id, musteri_id, uyelik_id, 'kabul', DATE '2026-09-20' FROM public.giris_kaydi WHERE musteri_id = $1 LIMIT 1", [m1]);
      expect(await ozledik("2026-10-01", 30)).toEqual([]);
      expect(await ozledik("2026-10-20", 30)).toEqual([m1]);

      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("SELECT * FROM public.mesaj_dogum_gunu_musterileri($1,'2026-10-05')", [isletmeA])))).toMatch(/permission denied/i);
    });
  });
});

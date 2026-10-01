import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bugunuSabitle, hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

type OzetSatiri = { hesap: string; banka_hesap_id: string | null; ad: string; acilis_kurus: number; giren_kurus: number; cikan_kurus: number; kapanis_kurus: number };

describe("finans: hesaplar, giderler, kasa-banka defteri, fatura, özet", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let muhasebeA: string;
  let antrenorA: string;
  let adminB: string;
  let banka1: string;
  let banka2: string;
  let bankaB: string;
  let musteri: string;
  let digerMusteri: string;
  let borcId: string;

  const rpc = <T = unknown>(k: string, sql: string, arg: unknown[] = []) => kimlikle(db, k, async () => (await db.query<T>(sql, arg)).rows);
  const hareket = (k: string, m: string, tur: string, tutar: number, yontem: string | null, banka: string | null = null, anahtar: string | null = null) =>
    kimlikle(db, k, () => db.query("SELECT public.hareket_ekle(p_musteri_id => $1, p_tur => $2, p_tutar_kurus => $3, p_yontem => $4, p_banka_hesap_id => $5, p_anahtar => $6)", [m, tur, tutar, yontem, banka, anahtar]));
  const gider = (k: string, o: { kat?: string; tutar?: number; odendi?: boolean; yontem?: string | null; banka?: string | null; vade?: string | null; anahtar?: string | null; tarih?: string | null } = {}) =>
    kimlikle(db, k, async () =>
      (
        await db.query<{ id: string }>(
          "SELECT public.gider_ekle(p_kategori => $1, p_tutar_kurus => $2, p_tarih => $3, p_odendi => $4, p_yontem => $5, p_banka_hesap_id => $6, p_vade => $7, p_anahtar => $8) AS id",
          [o.kat ?? "kira", o.tutar ?? 100_000, o.tarih ?? null, o.odendi ?? true, o.yontem === undefined ? "nakit" : o.yontem, o.banka ?? null, o.vade ?? null, o.anahtar ?? null]
        )
      ).rows[0].id
    );
  const ozet = async (k: string, bas: string, bit: string) => (await rpc<OzetSatiri>(k, "SELECT * FROM public.hesap_ozet($1::date,$2::date)", [bas, bit])).map((r) => ({ ...r, acilis_kurus: Number(r.acilis_kurus), giren_kurus: Number(r.giren_kurus), cikan_kurus: Number(r.cikan_kurus), kapanis_kurus: Number(r.kapanis_kurus) }));

  beforeAll(async () => {
    db = await yeniVeritabani();
    await bugunuSabitle(db, "2026-10-01");
    isletmeA = await isletmeOlustur(db, "Salon A");
    isletmeB = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin" });
    resepsiyonA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
    muhasebeA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "muhasebe" });
    antrenorA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor" });
    adminB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "isletme_admin" });

    await kimlikle(db, adminA, () => db.query("UPDATE public.isletme SET kasa_acilis_kurus = 100000 WHERE id = $1", [isletmeA]));
    const hesap = (k: string, isletme: string, ad: string, iban: string, acilis: number) =>
      kimlikle(db, k, async () => (await db.query<{ id: string }>("INSERT INTO public.isletme_banka_hesabi (isletme_id, banka_adi, hesap_sahibi, iban, acilis_bakiye_kurus) VALUES ($1,$2,'Salon Ltd. Şti.',$3,$4) RETURNING id", [isletme, ad, iban, acilis])).rows[0].id);
    banka1 = await hesap(adminA, isletmeA, "Ziraat Bankası", "TR330006100519786457841326", 500_000);
    banka2 = await hesap(adminA, isletmeA, "Garanti BBVA", "TR290006400000112345678901", 0);
    bankaB = await hesap(adminB, isletmeB, "İş Bankası", "TR330006100519786457841326", 0);

    const paket = await kimlikle(db, adminA, async () => (await db.query<{ id: string }>("INSERT INTO public.uyelik_paketi (isletme_id, ad, tur, sure_gun, fiyat_kurus) VALUES ($1,'Aylık','sure',30,10000) RETURNING id", [isletmeA])).rows[0].id);
    const yarat = (ad: string) =>
      kimlikle(db, resepsiyonA, async () => {
        const r = await db.query<{ id: string }>(
          "SELECT public.musteri_olustur(p_ad_soyad => $1, p_telefon => '+905320000000', p_onamlar => '[{\"tur\":\"kvkk_aydinlatma\",\"verildi\":true,\"metin_versiyonu\":\"v1\"}]'::jsonb) AS id",
          [ad]
        );
        return r.rows[0].id;
      });
    musteri = await yarat("Fatura Müşterisi");
    digerMusteri = await yarat("Diğer Müşteri");
    // Satış: 10.000 kuruş borç + 4.000 nakit ilk tahsilat.
    await kimlikle(db, resepsiyonA, () => db.query("SELECT public.uyelik_sat(p_musteri_id => $1, p_paket_id => $2, p_odeme_kurus => 4000, p_odeme_yontemi => 'nakit')", [musteri, paket]));
    borcId = (await db.query<{ id: string }>("SELECT id FROM public.musteri_bakiye_hareket WHERE musteri_id = $1 AND tur = 'borc'", [musteri])).rows[0].id;
  }, 120_000);

  describe("banka hesabı seçimi", () => {
    it("tahsilatta banka hesabı seçilebilir (resepsiyon dahil); hesap adı seçeneklerde görünür, IBAN görünmez", async () => {
      await hareket(resepsiyonA, musteri, "odeme", 3000, "havale", banka1);
      await hareket(resepsiyonA, musteri, "odeme", 2000, "kredi_karti", banka1);
      await hareket(muhasebeA, musteri, "odeme", 1000, "havale"); // hesap atanmamış

      const secenek = await rpc<{ id: string; ad: string }>(resepsiyonA, "SELECT * FROM public.banka_hesap_secenekleri()");
      expect(secenek.map((s) => s.id).sort()).toEqual([banka1, banka2].sort());
      expect(Object.keys(secenek[0]).sort()).toEqual(["ad", "id"]);
      expect(await hataMesaji(() => rpc(antrenorA, "SELECT * FROM public.banka_hesap_secenekleri()"))).toMatch(/yetki_yetersiz/);
    });

    it("nakit ödemeye hesap verilemez; başka işletmenin/pasif hesap reddedilir; aynı anahtar çift kayıt açmaz", async () => {
      expect(await hataMesaji(() => hareket(resepsiyonA, musteri, "odeme", 100, "nakit", banka1))).toMatch(/hareket_banka_kurali|check/i);
      expect(await hataMesaji(() => hareket(resepsiyonA, musteri, "odeme", 100, "havale", bankaB))).toMatch(/banka_hesabi_bulunamadi/);
      const anahtar = "33333333-3333-4333-8333-333333333333";
      const a = (await hareket(resepsiyonA, musteri, "odeme", 100, "havale", banka1, anahtar)).rows[0];
      const b = (await hareket(resepsiyonA, musteri, "odeme", 100, "havale", banka1, anahtar)).rows[0];
      expect(a).toEqual(b);
      // Bu iki 100'lük tek kayıt etkiyle hesap testlerine girer: aşağıdaki beklentilere +100 (banka1) dahildir.
    });

    it("pasif hesap seçilemez", async () => {
      await kimlikle(db, adminA, () => db.query("UPDATE public.isletme_banka_hesabi SET aktif = false WHERE id = $1", [banka2]));
      expect(await hataMesaji(() => hareket(resepsiyonA, musteri, "odeme", 100, "havale", banka2))).toMatch(/banka_hesabi_bulunamadi/);
      await kimlikle(db, adminA, () => db.query("UPDATE public.isletme_banka_hesabi SET aktif = true WHERE id = $1", [banka2]));
    });
  });

  describe("giderler", () => {
    it("ödenmiş gider yöntem ister; bekleyen gider yöntem taşımaz; geçersiz girdi reddedilir", async () => {
      await gider(adminA, { tutar: 150_000 / 100, yontem: "nakit" }); // 1.500 kuruş (nakit)
      await gider(muhasebeA, { kat: "elektrik", tutar: 2500, yontem: "havale", banka: banka1 });
      await gider(adminA, { kat: "vergi_sgk", tutar: 9000, odendi: false, yontem: null, vade: "2026-10-15" });

      expect(await hataMesaji(() => gider(adminA, { yontem: null }))).toMatch(/odeme_yontemi_gerekli/);
      expect(await hataMesaji(() => gider(adminA, { odendi: false, yontem: "nakit" }))).toMatch(/bekleyen_gider_yontem_olmaz/);
      expect(await hataMesaji(() => gider(adminA, { tutar: 0 }))).toMatch(/tutar_gecersiz/);
      expect(await hataMesaji(() => gider(adminA, { kat: "yok", tutar: 10 }))).toMatch(/check/i);
      expect(await hataMesaji(() => gider(adminA, { tarih: "2026-10-05", tutar: 10 }))).toMatch(/gelecek_tarih/);
      expect(await hataMesaji(() => gider(adminA, { yontem: "havale", banka: bankaB, tutar: 10 }))).toMatch(/banka_hesabi_bulunamadi/);
    });

    it("aynı anahtar çift gider açmaz; yalnız yönetici ve muhasebe ekler/okur", async () => {
      const anahtar = "44444444-4444-4444-8444-444444444444";
      const a = await gider(adminA, { tutar: 5, anahtar });
      expect(await gider(adminA, { tutar: 5, anahtar })).toBe(a);
      expect(await hataMesaji(() => gider(resepsiyonA, { tutar: 5 }))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => gider(antrenorA, { tutar: 5 }))).toMatch(/yetki_yetersiz/);
      const say = (k: string) => kimlikle(db, k, async () => (await db.query("SELECT id FROM public.gider")).rows.length);
      expect(await say(resepsiyonA)).toBe(0);
      expect(await say(adminB)).toBe(0);
      expect(await say(muhasebeA)).toBeGreaterThan(0);
    });

    it("bekleyen gider ödenir (hesaplara o zaman etki eder); ödenmiş tekrar ödenmez; iptal yalnız yöneticide ve gerekçeyle", async () => {
      const bekleyen = (await db.query<{ id: string }>("SELECT id FROM public.gider WHERE durum = 'bekliyor'")).rows[0].id;
      const ode = (k: string, yontem: string | null) => rpc(k, "SELECT public.gider_ode($1,$2)", [bekleyen, yontem]);
      expect(await hataMesaji(() => ode(muhasebeA, null))).toMatch(/odeme_yontemi_gerekli/);
      await ode(muhasebeA, "nakit"); // 9.000 nakit öder
      expect(await hataMesaji(() => ode(muhasebeA, "nakit"))).toMatch(/gider_durumu_uygun_degil/);

      expect(await hataMesaji(() => rpc(muhasebeA, "SELECT public.gider_iptal($1,'x')", [bekleyen]))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => rpc(adminA, "SELECT public.gider_iptal($1,'  ')", [bekleyen]))).toMatch(/iptal_nedeni_gerekli/);
      await rpc(adminA, "SELECT public.gider_iptal($1,'Mükerrer kayıt')", [bekleyen]);
      expect((await db.query<{ durum: string }>("SELECT durum FROM public.gider WHERE id = $1", [bekleyen])).rows[0].durum).toBe("iptal");
      expect(await hataMesaji(() => rpc(adminA, "SELECT public.gider_iptal($1,'tekrar')", [bekleyen]))).toMatch(/gider_durumu_uygun_degil/);
    });

    it("defter değişmez: tutar/kategori güncellenemez, silinemez, doğrudan yazılamaz", async () => {
      expect(await hataMesaji(() => db.query("UPDATE public.gider SET tutar_kurus = 1"))).toMatch(/defter_degismez/);
      expect(await hataMesaji(() => db.query("DELETE FROM public.gider"))).toMatch(/defter_degismez/);
      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("INSERT INTO public.gider (isletme_id, kategori, tutar_kurus, durum) VALUES ($1,'kira',5,'bekliyor')", [isletmeA])))).toMatch(/permission denied/i);
    });
  });

  describe("araçlı gider ve kamu ödemesi dönemi", () => {
    const kamu = (k: string, o: { tur?: string; kat: string; arac?: string | null; yil?: number | null; ay?: number | null }) =>
      kimlikle(db, k, async () =>
        (
          await db.query<{ id: string }>(
            "SELECT public.gider_ekle(p_kategori => $1, p_tutar_kurus => 5000, p_tur => $2, p_odendi => false, p_vade => '2026-10-20', p_arac_id => $3, p_donem_yil => $4, p_donem_ay => $5) AS id",
            [o.kat, o.tur ?? "kamusal", o.arac ?? null, o.yil ?? null, o.ay ?? null]
          )
        ).rows[0].id
      );

    it("kamu ödemesi dönem ister; araç yalnız araç kategorilerinde ve işletmenin aktif aracıyla seçilir; tür-kategori uyumu denetlenir", async () => {
      const arac = await kimlikle(db, adminA, async () => (await db.query<{ id: string }>("INSERT INTO public.isletme_arac (isletme_id, marka, model, plaka) VALUES ($1,'Fiat','Doblo','34KMU01') RETURNING id", [isletmeA])).rows[0].id);
      const pasif = await kimlikle(db, adminA, async () => (await db.query<{ id: string }>("INSERT INTO public.isletme_arac (isletme_id, marka, model, plaka, aktif) VALUES ($1,'Ford','Focus','34KMU02',false) RETURNING id", [isletmeA])).rows[0].id);
      const baskasi = await kimlikle(db, adminB, async () => (await db.query<{ id: string }>("INSERT INTO public.isletme_arac (isletme_id, marka, model, plaka) VALUES ($1,'Opel','Astra','06KMU03') RETURNING id", [isletmeB])).rows[0].id);

      const id = await kamu(muhasebeA, { kat: "arac_vergisi", arac, yil: 2026, ay: 9 });
      const satir = (await db.query<{ arac_id: string; donem_yil: number; donem_ay: number; tur: string }>("SELECT arac_id, donem_yil, donem_ay, tur FROM public.gider WHERE id = $1", [id])).rows[0];
      expect(satir).toMatchObject({ arac_id: arac, donem_yil: 2026, donem_ay: 9, tur: "kamusal" });

      expect(await hataMesaji(() => kamu(adminA, { kat: "kdv" }))).toMatch(/donem_gerekli/);
      expect(await hataMesaji(() => kamu(adminA, { kat: "kira", yil: 2026, ay: 9 }))).toMatch(/kategori_uygun_degil/);
      expect(await hataMesaji(() => kamu(adminA, { tur: "gider", kat: "kdv" }))).toMatch(/kategori_uygun_degil/);
      expect(await hataMesaji(() => kamu(adminA, { kat: "kdv", arac, yil: 2026, ay: 9 }))).toMatch(/gider_arac_kurali|check/i);
      expect(await hataMesaji(() => kamu(adminA, { kat: "trafik_cezasi", arac: pasif, yil: 2026, ay: 9 }))).toMatch(/arac_bulunamadi/);
      expect(await hataMesaji(() => kamu(adminA, { kat: "trafik_cezasi", arac: baskasi, yil: 2026, ay: 9 }))).toMatch(/arac_bulunamadi/);
      expect(await hataMesaji(() => kamu(adminA, { kat: "kdv", yil: 2026, ay: 13 }))).toMatch(/gider_donem_kurali|check/i);
      expect(await kamu(adminA, { tur: "gider", kat: "bakim_onarim", arac })).toBeTruthy();
    });

    it("araç ve dönem kaydedildikten sonra değiştirilemez", async () => {
      const id = await kamu(adminA, { kat: "kdv", yil: 2026, ay: 8 });
      expect(await hataMesaji(() => db.query("UPDATE public.gider SET donem_ay = 9 WHERE id = $1", [id]))).toMatch(/defter_degismez/);
    });
  });

  describe("personel ödemesi hesabı", () => {
    it("personel ödemesi hesap seçer; havale dışı yönteme hesap verilemez", async () => {
      const ode = (yontem: string, banka: string | null, tutar = 700) =>
        rpc(adminA, "SELECT public.personel_hesap_hareket_ekle($1,'odeme',$2,$3,NULL,NULL,$4)", [antrenorA, tutar, yontem, banka]);
      await ode("nakit", null); // kasadan 700
      expect(await hataMesaji(() => ode("nakit", banka1, 50))).toMatch(/banka_hesabi_bulunamadi/);
      expect(await hataMesaji(() => ode("havale", bankaB, 50))).toMatch(/banka_hesabi_bulunamadi/);
      await ode("havale", banka1, 300); // banka1'den 300
    });
  });

  describe("kasa-banka manuel defteri", () => {
    const ekle = (k: string, o: { tip: string; tutar: number; kasa?: boolean; banka?: string | null; hedefKasa?: boolean; hedefBanka?: string | null; anahtar?: string | null }) =>
      rpc(k, "SELECT public.kasa_banka_hareket_ekle($1,$2,$3,$4,$5,$6,NULL,NULL,NULL,$7)", [o.tip, o.tutar, o.kasa ?? false, o.banka ?? null, o.hedefKasa ?? false, o.hedefBanka ?? null, o.anahtar ?? null]);

    it("yalnız yönetici yazar; giren, çıkan ve transfer kaydedilir", async () => {
      expect(await hataMesaji(() => ekle(muhasebeA, { tip: "giren", tutar: 100, kasa: true }))).toMatch(/yetki_yetersiz/);
      await ekle(adminA, { tip: "giren", tutar: 10_000, kasa: true });
      await ekle(adminA, { tip: "cikan", tutar: 1000, banka: banka1 });
      await ekle(adminA, { tip: "transfer", tutar: 3000, kasa: true, hedefBanka: banka1 });
    });

    it("geçersiz kombinasyonlar reddedilir: hesap yok, kasa→kasa, aynı banka, yabancı hesap, sıfır tutar", async () => {
      expect(await hataMesaji(() => ekle(adminA, { tip: "giren", tutar: 100 }))).toMatch(/kbh_hesap_xor|check/i);
      expect(await hataMesaji(() => ekle(adminA, { tip: "transfer", tutar: 100, kasa: true, hedefKasa: true }))).toMatch(/kbh_farkli_hesap|check/i);
      expect(await hataMesaji(() => ekle(adminA, { tip: "transfer", tutar: 100, banka: banka1, hedefBanka: banka1 }))).toMatch(/kbh_farkli_banka|check/i);
      expect(await hataMesaji(() => ekle(adminA, { tip: "giren", tutar: 100, banka: bankaB }))).toMatch(/banka_hesabi_bulunamadi/);
      expect(await hataMesaji(() => ekle(adminA, { tip: "giren", tutar: 0, kasa: true }))).toMatch(/tutar_gecersiz/);
    });

    it("bankaya girişte gönderen banka ve IBAN saklanır (IBAN boşluksuz büyük harf); geçersiz IBAN reddedilir", async () => {
      const gonder = (k: string, banka: string, iban: string | null) =>
        rpc(k, "SELECT public.kasa_banka_hareket_ekle('giren', 700, false, $1, false, NULL, 'Ahmet Yılmaz', NULL, NULL, NULL, 'Garanti BBVA', $2) AS id", [banka, iban]);
      expect(await hataMesaji(() => gonder(adminB, bankaB, "TR330006100519786457841327"))).toMatch(/iban_gecersiz/);
      // B işletmesine yazılır: A işletmesinin bakiye beklentilerini etkilemez.
      const id = ((await gonder(adminB, bankaB, "tr33 0006 1005 1978 6457 8413 26")) as { id: string }[])[0].id;
      const satir = (await db.query<{ karsi_taraf_banka: string; karsi_taraf_iban: string }>("SELECT karsi_taraf_banka, karsi_taraf_iban FROM public.kasa_banka_hareket WHERE id = $1", [id])).rows[0];
      expect(satir).toEqual({ karsi_taraf_banka: "Garanti BBVA", karsi_taraf_iban: "TR330006100519786457841326" });
    });

    it("idempotent; değişmez; doğrudan yazılamaz", async () => {
      const anahtar = "55555555-5555-4555-8555-555555555555";
      const a = await ekle(adminA, { tip: "giren", tutar: 1, kasa: true, anahtar });
      const b = await ekle(adminA, { tip: "giren", tutar: 1, kasa: true, anahtar });
      expect(a).toEqual(b);
      // Bu 1 kuruşluk giriş kasa beklentisine dahildir.
      expect(await hataMesaji(() => db.query("UPDATE public.kasa_banka_hareket SET tutar_kurus = 5"))).toMatch(/defter_degismez/);
      expect(await hataMesaji(() => db.query("DELETE FROM public.kasa_banka_hareket"))).toMatch(/defter_degismez/);
      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("INSERT INTO public.kasa_banka_hareket (isletme_id, tip, kasa, tutar_kurus) VALUES ($1,'giren',true,5)", [isletmeA])))).toMatch(/permission denied/i);
    });
  });

  describe("hesap özeti", () => {
    it("dönem öncesi yalnız açılış bakiyesidir", async () => {
      const r = await ozet(muhasebeA, "2026-09-01", "2026-10-01");
      const kasa = r.find((x) => x.hesap === "kasa")!;
      const b1 = r.find((x) => x.banka_hesap_id === banka1)!;
      expect(kasa).toMatchObject({ acilis_kurus: 100_000, giren_kurus: 0, cikan_kurus: 0, kapanis_kurus: 100_000 });
      expect(b1).toMatchObject({ acilis_kurus: 500_000, kapanis_kurus: 500_000 });
    });

    it("kasa ve banka kapanışları tüm kaynaklardan doğru hesaplanır; atanmamış banka ayrı satırdır", async () => {
      const r = await ozet(muhasebeA, "2026-10-01", "2026-10-02");
      const kasa = r.find((x) => x.hesap === "kasa")!;
      const b1 = r.find((x) => x.banka_hesap_id === banka1)!;
      const b2 = r.find((x) => x.banka_hesap_id === banka2)!;
      const atanmamis = r.find((x) => x.hesap === "banka" && x.banka_hesap_id === null)!;

      // Kasa: 100.000 açılış + 4.000 tahsilat (nakit) − 1.500 gider − 5 (anahtar testi) − 700 personel + 10.000 + 1 giren − 3.000 transfer.
      // (Ödenip sonra iptal edilen 9.000'lik gider hesaplardan düşmüş olmalıdır.)
      expect(kasa.acilis_kurus).toBe(100_000);
      expect(kasa.kapanis_kurus).toBe(100_000 + 4000 - 1500 - 5 - 700 + 10_000 + 1 - 3000); // -5: anahtar testindeki 5 kuruşluk nakit gider
      // Banka1: 500.000 + 3.000 havale (+100 anahtarlı tahsilat) − 2.500 gider − 300 personel − 1.000 çıkan + 3.000 transfer girişi.
      // 2.000'lik KREDİ KARTI tahsilatı banka1 seçilmiş olsa da bankaya değil 'kart' hesabına yazılır (klinik düzeni).
      expect(b1.kapanis_kurus).toBe(500_000 + 3000 + 100 - 2500 - 300 - 1000 + 3000);
      expect(r.find((x) => x.hesap === "kart")).toMatchObject({ banka_hesap_id: null, acilis_kurus: 0, giren_kurus: 2000, cikan_kurus: 0, kapanis_kurus: 2000 });
      expect(b2.kapanis_kurus).toBe(0);
      expect(atanmamis).toMatchObject({ giren_kurus: 1000, cikan_kurus: 0, kapanis_kurus: 1000 });
      for (const s of r) expect(s.kapanis_kurus).toBe(s.acilis_kurus + s.giren_kurus - s.cikan_kurus);
    });

    it("yalnız yönetici ve muhasebe görür; resepsiyon hesap hareketlerini göremez; geçersiz aralık reddedilir", async () => {
      const resepsiyon = await ozet(resepsiyonA, "2026-10-01", "2026-10-02");
      expect(resepsiyon.find((x) => x.hesap === "kasa")!.giren_kurus).toBeLessThanOrEqual(5000); // yalnız kendi görebildiği müşteri tahsilatı
      expect((await ozet(adminB, "2026-10-01", "2026-10-02")).find((x) => x.hesap === "kasa")).toMatchObject({ acilis_kurus: 0, kapanis_kurus: 0 });
      expect(await hataMesaji(() => ozet(adminA, "2026-10-02", "2026-10-01"))).toMatch(/tarih_araligi_gecersiz/);
    });
  });

  describe("kategori iskonto oranları", () => {
    it("yönetici yazar; herkes (antrenör hariç işletme rolleri) okur; yüzde 0-100 olmalı", async () => {
      const yaz = (k: string, kat: string, yuzde: number) => kimlikle(db, k, () => db.query("INSERT INTO public.kategori_iskonto_orani (isletme_id, kategori, yuzde) VALUES ($1,$2,$3) ON CONFLICT (isletme_id, kategori) DO UPDATE SET yuzde = EXCLUDED.yuzde", [isletmeA, kat, yuzde]));
      await yaz(adminA, "gold", 10);
      await yaz(adminA, "vip", 15.5);
      expect(await hataMesaji(() => yaz(adminA, "platinum", 101))).toMatch(/check/i);
      expect(await hataMesaji(() => yaz(muhasebeA, "gold", 50))).toMatch(/row-level security/i);
      const oku = (k: string) => kimlikle(db, k, async () => (await db.query("SELECT kategori FROM public.kategori_iskonto_orani")).rows.length);
      expect(await oku(resepsiyonA)).toBe(2);
      expect(await oku(muhasebeA)).toBe(2);
      expect(await oku(antrenorA)).toBe(0);
      expect(await oku(adminB)).toBe(0);
    });
  });

  describe("fatura kuyruğu", () => {
    let fatura: string;

    it("faturalanmamış borçlar görünür; fatura KDV dahil tutardan ayrıştırılarak oluşur", async () => {
      const liste = await rpc<{ id: string; net_kurus: number }>(resepsiyonA, "SELECT id, net_kurus FROM public.faturalanmamis_borc WHERE musteri_id = $1", [musteri]);
      expect(liste.map((l) => l.id)).toEqual([borcId]);

      fatura = (await rpc<{ id: string }>(resepsiyonA, "SELECT public.fatura_olustur($1::uuid[]) AS id", [[borcId]]))[0].id;
      const f = (await db.query<{ durum: string; toplam_kurus: number; kdv_kurus: number }>("SELECT durum, toplam_kurus, kdv_kurus FROM public.fatura WHERE id = $1", [fatura])).rows[0];
      expect(f).toEqual({ durum: "bekliyor", toplam_kurus: 10_000, kdv_kurus: 1667 }); // 10.000 × 20/120 = 1.666,67 -> 1.667
      expect(await rpc(resepsiyonA, "SELECT id FROM public.faturalanmamis_borc WHERE musteri_id = $1", [musteri])).toEqual([]);
    });

    it("aynı borç iki faturada olamaz; ödeme satırı, boş liste ve yetkisiz rol reddedilir", async () => {
      expect(await hataMesaji(() => rpc(resepsiyonA, "SELECT public.fatura_olustur($1::uuid[])", [[borcId]]))).toMatch(/hareket_gecersiz|zaten_faturalanmis/);
      const odeme = (await db.query<{ id: string }>("SELECT id FROM public.musteri_bakiye_hareket WHERE musteri_id = $1 AND tur = 'odeme' LIMIT 1", [musteri])).rows[0].id;
      expect(await hataMesaji(() => rpc(resepsiyonA, "SELECT public.fatura_olustur($1::uuid[])", [[odeme]]))).toMatch(/hareket_gecersiz/);
      expect(await hataMesaji(() => rpc(resepsiyonA, "SELECT public.fatura_olustur($1::uuid[])", [[]]))).toMatch(/hareket_secilmedi/);
      expect(await hataMesaji(() => rpc(antrenorA, "SELECT public.fatura_olustur($1::uuid[])", [[borcId]]))).toMatch(/yetki_yetersiz/);
    });

    it("iptal kalemleri serbest bırakır; yalnız yönetici/muhasebe iptal eder; gerekçe zorunlu", async () => {
      expect(await hataMesaji(() => rpc(resepsiyonA, "SELECT public.fatura_iptal($1,'x')", [fatura]))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => rpc(muhasebeA, "SELECT public.fatura_iptal($1,' ')", [fatura]))).toMatch(/iptal_nedeni_gerekli/);
      await rpc(muhasebeA, "SELECT public.fatura_iptal($1,'Yanlış müşteri')", [fatura]);
      expect((await rpc<{ id: string }>(resepsiyonA, "SELECT id FROM public.faturalanmamis_borc WHERE musteri_id = $1", [musteri])).map((r) => r.id)).toEqual([borcId]);
      fatura = (await rpc<{ id: string }>(resepsiyonA, "SELECT public.fatura_olustur($1::uuid[]) AS id", [[borcId]]))[0].id; // yeniden faturalanabilir
    });

    it("entegrasyon sonucu yalnız service_role; kesilmiş fatura iptal edilemez", async () => {
      expect(await hataMesaji(() => rpc(adminA, "SELECT public.fatura_durum_ayarla($1,'kesildi','F-1')", [fatura]))).toMatch(/permission denied/i);
      await db.exec("SET ROLE service_role");
      try {
        await db.query("SELECT public.fatura_durum_ayarla($1,'kesildi','FTR-2026-0001','parasut-1')", [fatura]);
      } finally {
        await db.exec("RESET ROLE");
      }
      const f = (await db.query<{ durum: string; fatura_no: string }>("SELECT durum, fatura_no FROM public.fatura WHERE id = $1", [fatura])).rows[0];
      expect(f).toEqual({ durum: "kesildi", fatura_no: "FTR-2026-0001" });
      expect(await hataMesaji(() => rpc(muhasebeA, "SELECT public.fatura_iptal($1,'geç kaldı')", [fatura]))).toMatch(/fatura_durumu_uygun_degil/);
    });

    it("farklı müşterilerin borçları tek faturada birleştirilemez", async () => {
      const paket = (await db.query<{ id: string }>("SELECT id FROM public.uyelik_paketi LIMIT 1")).rows[0].id;
      await kimlikle(db, resepsiyonA, () => db.query("SELECT public.uyelik_sat(p_musteri_id => $1, p_paket_id => $2)", [digerMusteri, paket]));
      const digerBorc = (await db.query<{ id: string }>("SELECT id FROM public.musteri_bakiye_hareket WHERE musteri_id = $1 AND tur = 'borc'", [digerMusteri])).rows[0].id;
      expect(await hataMesaji(() => rpc(resepsiyonA, "SELECT public.fatura_olustur($1::uuid[])", [[borcId, digerBorc]]))).toMatch(/birden_fazla_musteri/);
    });
  });

  describe("finans özeti", () => {
    it("dönem toplamları kaynaklarla uyumlu; yalnız yönetici ve muhasebe", async () => {
      const r = (await rpc<{ o: Record<string, number> }>(muhasebeA, "SELECT public.finans_ozet('2026-10-01','2026-10-02') AS o"))[0].o;
      // Tahsilat: 4.000 (satış anı nakit) + 3.000 + 2.000 + 1.000 + 100 (anahtarlı)
      expect(r.tahsilat_kurus).toBe(10_100);
      expect(r.iade_kurus).toBe(0);
      expect(r.gider_kurus).toBe(1500 + 2500 + 5); // iptal edilen 9.000 sayılmaz; +5 anahtar testindeki gider
      expect(r.personel_odeme_kurus).toBe(1000);
      expect(r.nakit_sonuc_kurus).toBe(r.tahsilat_kurus - r.gider_kurus - r.personel_odeme_kurus);
      expect(await hataMesaji(() => rpc(resepsiyonA, "SELECT public.finans_ozet('2026-10-01','2026-10-02')"))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => rpc(adminA, "SELECT public.finans_ozet('2026-10-02','2026-10-01')"))).toMatch(/tarih_araligi_gecersiz/);
    });
  });
});

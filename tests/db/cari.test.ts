import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bugunuSabitle, hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, uuid, yeniVeritabani } from "./harness";

describe("cari: değişmez defter, bakiye, iade kuralları, kasa özeti", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let muhasebeA: string;
  let antrenorA: string;
  let adminB: string;
  let musteri: string;
  let musteri2: string;
  let musteriB: string;

  async function musteriOlustur(kullanici: string, ad: string) {
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ id: string }>(
        "SELECT public.musteri_olustur(p_ad_soyad => $1, p_telefon => '+905320000000', p_onamlar => '[{\"tur\":\"kvkk_aydinlatma\",\"verildi\":true,\"metin_versiyonu\":\"v1\"}]'::jsonb) AS id",
        [ad]
      );
      return r.rows[0].id;
    });
  }

  async function hareket(
    kullanici: string,
    m: string,
    tur: string,
    tutar: number,
    opsiyon: { iskonto?: number; yontem?: string | null; iade?: string | null; anahtar?: string | null } = {}
  ) {
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ id: string }>(
        "SELECT public.hareket_ekle(p_musteri_id => $1, p_tur => $2, p_tutar_kurus => $3, p_iskonto_kurus => $4, p_yontem => $5, p_iade_edilen_hareket_id => $6, p_anahtar => $7) AS id",
        [m, tur, tutar, opsiyon.iskonto ?? 0, opsiyon.yontem ?? null, opsiyon.iade ?? null, opsiyon.anahtar ?? null]
      );
      return r.rows[0].id;
    });
  }

  async function bakiye(kullanici: string, m: string): Promise<number> {
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ bakiye_kurus: string }>("SELECT bakiye_kurus FROM public.musteri_bakiye WHERE musteri_id = $1", [m]);
      return r.rows.length ? Number(r.rows[0].bakiye_kurus) : 0;
    });
  }

  beforeAll(async () => {
    db = await yeniVeritabani();
    await bugunuSabitle(db, "2026-09-30");
    isletmeA = await isletmeOlustur(db, "Salon A");
    isletmeB = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin" });
    resepsiyonA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
    muhasebeA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "muhasebe" });
    antrenorA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor" });
    adminB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "isletme_admin" });
    musteri = await musteriOlustur(resepsiyonA, "Cari Müşteri");
    musteri2 = await musteriOlustur(resepsiyonA, "İkinci Müşteri");
    musteriB = await musteriOlustur(adminB, "B Müşterisi");
  }, 120_000);

  it("bakiye: borç (iskontolu) eksi, ödeme artı, iade eksi", async () => {
    await hareket(resepsiyonA, musteri, "borc", 100_000, { iskonto: 10_000 });
    expect(await bakiye(muhasebeA, musteri)).toBe(-90_000);
    const odeme = await hareket(resepsiyonA, musteri, "odeme", 50_000, { yontem: "nakit" });
    expect(await bakiye(muhasebeA, musteri)).toBe(-40_000);
    await hareket(adminA, musteri, "iade", 5_000, { yontem: "nakit", iade: odeme });
    expect(await bakiye(muhasebeA, musteri)).toBe(-45_000);
  });

  it("kayıt kuralları: ödeme yöntemi, iskonto, tutar", async () => {
    expect(await hataMesaji(() => hareket(resepsiyonA, musteri, "odeme", 100, { yontem: null }))).toMatch(/hareket_yontem_kurali/);
    expect(await hataMesaji(() => hareket(resepsiyonA, musteri, "borc", 100, { yontem: "nakit" }))).toMatch(/hareket_yontem_kurali/);
    expect(await hataMesaji(() => hareket(resepsiyonA, musteri, "borc", 100, { iskonto: 200 }))).toMatch(/hareket_iskonto_kurali/);
    expect(await hataMesaji(() => hareket(resepsiyonA, musteri, "odeme", 0, { yontem: "nakit" }))).toMatch(/check/i);
    expect(await hataMesaji(() => hareket(resepsiyonA, musteri, "odeme", 100, { yontem: "bitcoin" }))).toMatch(/check/i);
  });

  it("iade: yalnız yönetici; ödemeye bağlı; toplam ödemeyi aşamaz; aynı müşteri", async () => {
    const odeme = await hareket(resepsiyonA, musteri2, "odeme", 10_000, { yontem: "kredi_karti" });
    const borc = await hareket(resepsiyonA, musteri2, "borc", 10_000);
    // resepsiyon iade yapamaz
    expect(await hataMesaji(() => hareket(resepsiyonA, musteri2, "iade", 1_000, { yontem: "nakit", iade: odeme }))).toMatch(/row-level security/);
    // iade bir ödemeye bağlı olmalı (borca değil, bağsız da değil)
    expect(await hataMesaji(() => hareket(adminA, musteri2, "iade", 1_000, { yontem: "nakit", iade: borc }))).toMatch(/iade_icin_odeme_gerekli/);
    expect(await hataMesaji(() => hareket(adminA, musteri2, "iade", 1_000, { yontem: "nakit" }))).toMatch(/iade_icin_odeme_gerekli/);
    // başka müşterinin ödemesine iade
    expect(await hataMesaji(() => hareket(adminA, musteri, "iade", 1_000, { yontem: "nakit", iade: odeme }))).toMatch(/iade_musteri_uyumsuz/);
    // kısmi iadeler toplamı ödemeyi aşamaz
    await hareket(adminA, musteri2, "iade", 6_000, { yontem: "kredi_karti", iade: odeme });
    await hareket(adminA, musteri2, "iade", 4_000, { yontem: "kredi_karti", iade: odeme });
    expect(await hataMesaji(() => hareket(adminA, musteri2, "iade", 1, { yontem: "kredi_karti", iade: odeme }))).toMatch(/iade_tutari_asildi/);
  });

  it("idempotency: aynı anahtar çift kayıt üretmez, aynı kaydı döndürür", async () => {
    const anahtar = uuid();
    const a = await hareket(resepsiyonA, musteri, "odeme", 7_000, { yontem: "nakit", anahtar });
    const b = await hareket(resepsiyonA, musteri, "odeme", 7_000, { yontem: "nakit", anahtar });
    expect(b).toBe(a);
    const r = await db.query<{ c: string }>("SELECT count(*) AS c FROM public.musteri_bakiye_hareket WHERE idempotency_anahtari = $1", [anahtar]);
    expect(Number(r.rows[0].c)).toBe(1);
  });

  it("defter değişmez: güncelleme/silme kimse için mümkün değil (superuser dahil)", async () => {
    const id = await hareket(resepsiyonA, musteri, "odeme", 1_234, { yontem: "nakit" });
    expect(await hataMesaji(() => db.query("UPDATE public.musteri_bakiye_hareket SET tutar_kurus = 1 WHERE id = $1", [id]))).toMatch(/defter_degismez/);
    expect(await hataMesaji(() => db.query("DELETE FROM public.musteri_bakiye_hareket WHERE id = $1", [id]))).toMatch(/defter_degismez/);
    const kullanici = await kimlikle(db, adminA, () =>
      hataMesaji(() => db.query("UPDATE public.musteri_bakiye_hareket SET tutar_kurus = 1 WHERE id = $1", [id]))
    );
    expect(kullanici).toMatch(/permission denied/);
    // Hareketi olan müşteri silinemez
    expect(await hataMesaji(() => db.query("DELETE FROM public.musteri WHERE id = $1", [musteri]))).toMatch(/foreign key|violates/i);
  });

  it("rol matrisi: antrenör göremez/yazamaz; muhasebe görür ve ödeme girebilir; kaydeden sahtelenemez", async () => {
    const antrenor = await kimlikle(db, antrenorA, () => db.query("SELECT * FROM public.musteri_bakiye_hareket"));
    expect(antrenor.rows).toHaveLength(0);
    expect(await hataMesaji(() => hareket(antrenorA, musteri, "odeme", 100, { yontem: "nakit" }))).toMatch(/row-level security/);
    const muhasebe = await kimlikle(db, muhasebeA, () => db.query("SELECT * FROM public.musteri_bakiye_hareket"));
    expect(muhasebe.rows.length).toBeGreaterThan(0);
    await hareket(muhasebeA, musteri, "odeme", 100, { yontem: "havale" });
    // kaydeden_kullanici_id başkası adına yazılamaz
    const sahte = await kimlikle(db, resepsiyonA, () =>
      hataMesaji(() =>
        db.query(
          "INSERT INTO public.musteri_bakiye_hareket (isletme_id, musteri_id, tur, tutar_kurus, odeme_yontemi, kaydeden_kullanici_id) VALUES ($1, $2, 'odeme', 100, 'nakit', $3)",
          [isletmeA, musteri, adminA]
        )
      )
    );
    expect(sahte).toMatch(/row-level security/);
  });

  it("tenant izolasyonu: başka işletmenin müşterisine hareket yazılamaz, görülemez", async () => {
    expect(await hataMesaji(() => hareket(adminA, musteriB, "odeme", 100, { yontem: "nakit" }))).not.toBeNull();
    await hareket(adminB, musteriB, "borc", 5_000);
    await hareket(adminB, musteriB, "odeme", 77_777, { yontem: "nakit" });
    const a = await kimlikle(db, adminA, () => db.query("SELECT * FROM public.musteri_bakiye WHERE musteri_id = $1", [musteriB]));
    expect(a.rows).toHaveLength(0);
    const kasa = await kimlikle(db, adminA, () => db.query("SELECT * FROM public.kasa_ozet('2000-01-01', '2100-01-01')"));
    expect(JSON.stringify(kasa.rows)).not.toContain("77777"); // B'nin tahsilatı A'nın kasasına sızmaz
  });

  it("kasa özeti: yönteme göre, [başlangıç, bitiş) İstanbul günü; iade net'ten düşer", async () => {
    const m = await musteriOlustur(adminA, "Kasa Müşterisi");
    await bugunuSabitle(db, "2026-10-01");
    const o1 = await hareket(adminA, m, "odeme", 20_000, { yontem: "nakit" });
    await hareket(adminA, m, "odeme", 30_000, { yontem: "kredi_karti" });
    await hareket(adminA, m, "iade", 5_000, { yontem: "nakit", iade: o1 });
    await bugunuSabitle(db, "2026-10-02");
    await hareket(adminA, m, "odeme", 99_000, { yontem: "nakit" });
    const r = await kimlikle(db, muhasebeA, () =>
      db.query<{ odeme_yontemi: string; tahsilat_kurus: string; iade_kurus: string; net_kurus: string }>(
        "SELECT * FROM public.kasa_ozet('2026-10-01', '2026-10-02')"
      )
    );
    const harita = Object.fromEntries(r.rows.map((x) => [x.odeme_yontemi, x]));
    expect(Number(harita.nakit.tahsilat_kurus)).toBe(20_000);
    expect(Number(harita.nakit.iade_kurus)).toBe(5_000);
    expect(Number(harita.nakit.net_kurus)).toBe(15_000);
    expect(Number(harita.kredi_karti.net_kurus)).toBe(30_000);
    // üst sınır dışlayıcı: 10-02 tahsilatı bu aralığa girmez
    expect(r.rows.reduce((t, x) => t + Number(x.tahsilat_kurus), 0)).toBe(50_000);
    await bugunuSabitle(db, "2026-09-30");
  });

  it("cari alacaklar: yalnız borçlu müşteriler; muhasebe adı görür, telefon görmez", async () => {
    const borclu = await musteriOlustur(adminA, "Borçlu Kişi");
    await hareket(adminA, borclu, "borc", 12_345);
    const r = await kimlikle(db, muhasebeA, () => db.query<Record<string, unknown>>("SELECT * FROM public.cari_alacak"));
    const satir = r.rows.find((x) => x.musteri_id === borclu);
    expect(satir).toBeDefined();
    expect(Number(satir!.borc_kurus)).toBe(12_345);
    expect(Object.keys(satir!).sort()).toEqual(["ad_soyad", "borc_kurus", "isletme_id", "musteri_id", "uye_no"]);
    expect(r.rows.every((x) => Number(x.borc_kurus) > 0)).toBe(true);
  });
});

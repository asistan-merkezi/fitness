import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bugunuSabitle, hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, uuid, yeniVeritabani } from "./harness";

describe("üyelik: paket, satış, dondurma, iptal, geçerli durum", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let muhasebeA: string;
  let antrenorA: string;
  let adminB: string;
  let musteri: string;
  let musteriB: string;
  let paketAy: string; // 30 gün, dondurma: 10 gün, ücret 5000
  let paketSeans: string; // 10 seans, 60 gün geçerli
  let paketDondurmasiz: string;

  async function musteriOlustur(kullanici: string, ad: string) {
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ id: string }>(
        "SELECT public.musteri_olustur(p_ad_soyad => $1, p_telefon => '+905320000000', p_onamlar => '[{\"tur\":\"kvkk_aydinlatma\",\"verildi\":true,\"metin_versiyonu\":\"v1\"}]'::jsonb) AS id",
        [ad]
      );
      return r.rows[0].id;
    });
  }

  async function paketOlustur(kullanici: string, isletme: string, alanlar: Record<string, unknown>) {
    const p = { ad: "Paket", tur: "sure", sure_gun: 30, seans_sayisi: null, gecerlilik_gun: null, fiyat_kurus: 100_000, dondurma_izni: false, azami_dondurma_gun: 0, dondurma_ucret_kurus: 0, satis_bitis_tarihi: null, ...alanlar };
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ id: string }>(
        "INSERT INTO public.uyelik_paketi (isletme_id, ad, tur, sure_gun, seans_sayisi, gecerlilik_gun, fiyat_kurus, dondurma_izni, azami_dondurma_gun, dondurma_ucret_kurus, satis_bitis_tarihi) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
        [isletme, p.ad, p.tur, p.sure_gun, p.seans_sayisi, p.gecerlilik_gun, p.fiyat_kurus, p.dondurma_izni, p.azami_dondurma_gun, p.dondurma_ucret_kurus, p.satis_bitis_tarihi]
      );
      return r.rows[0].id;
    });
  }

  async function sat(kullanici: string, m: string, paket: string, o: { baslangic?: string | null; iskonto?: number; odeme?: number; yontem?: string | null; anahtar?: string | null } = {}) {
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ id: string }>(
        "SELECT public.uyelik_sat(p_musteri_id => $1, p_paket_id => $2, p_baslangic => $3::date, p_iskonto_kurus => $4, p_odeme_kurus => $5, p_odeme_yontemi => $6, p_anahtar => $7) AS id",
        [m, paket, o.baslangic ?? null, o.iskonto ?? 0, o.odeme ?? 0, o.yontem ?? null, o.anahtar ?? null]
      );
      return r.rows[0].id;
    });
  }

  async function uyelik(id: string) {
    const r = await db.query<{ baslangic_tarihi: string; bitis_tarihi: string | null; kalan_hak: number | null; gecerli_durum: string }>(
      "SELECT to_char(baslangic_tarihi,'YYYY-MM-DD') AS baslangic_tarihi, to_char(bitis_tarihi,'YYYY-MM-DD') AS bitis_tarihi, kalan_hak, gecerli_durum FROM public.uyelik_gorunum WHERE id = $1",
      [id]
    );
    return r.rows[0];
  }

  async function bakiye(m: string): Promise<number> {
    const r = await db.query<{ b: string }>("SELECT coalesce(sum(CASE tur WHEN 'odeme' THEN tutar_kurus WHEN 'borc' THEN -(tutar_kurus - iskonto_kurus) ELSE -tutar_kurus END), 0) AS b FROM public.musteri_bakiye_hareket WHERE musteri_id = $1", [m]);
    return Number(r.rows[0].b);
  }

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
    musteri = await musteriOlustur(resepsiyonA, "Üye Bir");
    musteriB = await musteriOlustur(adminB, "B Üyesi");
    paketAy = await paketOlustur(adminA, isletmeA, { ad: "Aylık", tur: "sure", sure_gun: 30, fiyat_kurus: 100_000, dondurma_izni: true, azami_dondurma_gun: 10, dondurma_ucret_kurus: 5_000 });
    paketSeans = await paketOlustur(adminA, isletmeA, { ad: "10 Seans PT", tur: "seans", sure_gun: null, seans_sayisi: 10, gecerlilik_gun: 60, fiyat_kurus: 500_000 });
    paketDondurmasiz = await paketOlustur(adminA, isletmeA, { ad: "Haftalık", tur: "sure", sure_gun: 7, fiyat_kurus: 30_000 });
  }, 120_000);

  it("paket: yalnız yönetici oluşturur/günceller; tür kuralları DB'de zorlanır", async () => {
    expect(await hataMesaji(() => paketOlustur(resepsiyonA, isletmeA, { ad: "Hack" }))).toMatch(/row-level security/);
    expect(await hataMesaji(() => paketOlustur(adminA, isletmeA, { tur: "sure", sure_gun: null }))).toMatch(/paket_tur_kurali/);
    expect(await hataMesaji(() => paketOlustur(adminA, isletmeA, { tur: "seans", sure_gun: null, seans_sayisi: null }))).toMatch(/paket_tur_kurali/);
    expect(await hataMesaji(() => paketOlustur(adminA, isletmeA, { dondurma_izni: false, azami_dondurma_gun: 5 }))).toMatch(/paket_dondurma_kurali/);
    // tüm roller kendi işletmesinin paketlerini görür; başka işletmeninkini görmez
    const r = await kimlikle(db, antrenorA, () => db.query<{ isletme_id: string }>("SELECT isletme_id FROM public.uyelik_paketi"));
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((x) => x.isletme_id === isletmeA)).toBe(true);
    const b = await kimlikle(db, adminA, () => db.query("UPDATE public.uyelik_paketi SET ad = 'Hack' WHERE isletme_id = $1 RETURNING id", [isletmeB]));
    expect(b.rows).toHaveLength(0);
  });

  it("satış (süre): bitiş DAHİL, borç + tahsilat tek işlemde, bakiye doğru", async () => {
    const id = await sat(resepsiyonA, musteri, paketAy, { baslangic: "2026-10-01", iskonto: 10_000, odeme: 60_000, yontem: "nakit" });
    const u = await uyelik(id);
    expect(u.bitis_tarihi).toBe("2026-10-30"); // 1 Ekim + 30 gün - 1
    expect(u.kalan_hak).toBeNull();
    expect(u.gecerli_durum).toBe("aktif");
    expect(await bakiye(musteri)).toBe(-(100_000 - 10_000) + 60_000);
    const h = await db.query<{ tur: string; uyelik_id: string }>("SELECT tur, uyelik_id FROM public.musteri_bakiye_hareket WHERE uyelik_id = $1 ORDER BY tur", [id]);
    expect(h.rows.map((x) => x.tur)).toEqual(["borc", "odeme"]);
  });

  it("satış (seans): hak ve geçerlilik; başlangıç varsayılanı bugün (İstanbul)", async () => {
    const id = await sat(resepsiyonA, musteri, paketSeans);
    const u = await uyelik(id);
    expect(u.baslangic_tarihi).toBe("2026-10-01");
    expect(u.bitis_tarihi).toBe("2026-11-29"); // 60 gün
    expect(u.kalan_hak).toBe(10);
  });

  it("satış kuralları ve yetki", async () => {
    const baslangicBakiye = await bakiye(musteri);
    expect(await hataMesaji(() => sat(resepsiyonA, musteri, paketAy, { iskonto: 100_001 }))).toMatch(/iskonto_asildi/);
    expect(await hataMesaji(() => sat(resepsiyonA, musteri, paketAy, { odeme: 100_001, yontem: "nakit" }))).toMatch(/odeme_asildi/);
    expect(await hataMesaji(() => sat(resepsiyonA, musteri, paketAy, { odeme: 100, yontem: null }))).toMatch(/odeme_yontemi_gerekli/);
    expect(await hataMesaji(() => sat(resepsiyonA, musteri, paketAy, { baslangic: "2026-09-30" }))).toMatch(/gecmis_baslangic/);
    expect(await hataMesaji(() => sat(muhasebeA, musteri, paketAy))).toMatch(/yetki_yetersiz/);
    expect(await hataMesaji(() => sat(antrenorA, musteri, paketAy))).toMatch(/yetki_yetersiz/);
    // başka işletmenin müşterisi / paketi
    expect(await hataMesaji(() => sat(adminA, musteriB, paketAy))).toMatch(/musteri_bulunamadi/);
    expect(await hataMesaji(() => sat(adminB, musteriB, paketAy))).toMatch(/paket_bulunamadi/);
    // kapalı paket
    const kapali = await paketOlustur(adminA, isletmeA, { ad: "Kapalı", satis_bitis_tarihi: "2026-09-30" });
    expect(await hataMesaji(() => sat(resepsiyonA, musteri, kapali))).toMatch(/paket_satisa_kapali/);
    // kuralı ihlal eden satış defteri/üyelikleri kirletmez (atomiklik)
    expect(await bakiye(musteri)).toBe(baslangicBakiye);
  });

  it("idempotency: aynı satış anahtarı tek üyelik üretir", async () => {
    const m = await musteriOlustur(resepsiyonA, "Anahtarlı");
    const anahtar = uuid();
    const a = await sat(resepsiyonA, m, paketAy, { anahtar });
    const b = await sat(resepsiyonA, m, paketAy, { anahtar });
    expect(b).toBe(a);
    const r = await db.query<{ c: string }>("SELECT count(*) AS c FROM public.uyelik WHERE musteri_id = $1", [m]);
    expect(Number(r.rows[0].c)).toBe(1);
    expect(await bakiye(m)).toBe(-100_000);
  });

  it("kullanıcılar uyelik tablosuna doğrudan yazamaz (hak/tarih sahteciliği yok)", async () => {
    const id = await sat(resepsiyonA, musteri, paketSeans);
    for (const kim of [adminA, resepsiyonA]) {
      expect(await kimlikle(db, kim, () => hataMesaji(() => db.query("UPDATE public.uyelik SET kalan_hak = 999 WHERE id = $1", [id])))).toMatch(/permission denied/);
      expect(await kimlikle(db, kim, () => hataMesaji(() => db.query("UPDATE public.uyelik_dondurma SET iptal = true")))).toMatch(/permission denied/);
      expect(await kimlikle(db, kim, () => hataMesaji(() => db.query("INSERT INTO public.uyelik (isletme_id, musteri_id, paket_id, paket_adi, tur, baslangic_tarihi, bitis_tarihi, fiyat_kurus) VALUES ($1,$2,$3,'x','sure','2026-10-01','2026-10-31',0)", [isletmeA, musteri, paketAy])))).toMatch(/permission denied/);
    }
    expect(await kimlikle(db, adminA, () => hataMesaji(() => db.query("DELETE FROM public.uyelik WHERE id = $1", [id])))).toMatch(/permission denied/);
    // okuma: antrenör göremez, muhasebe görür
    expect((await kimlikle(db, antrenorA, () => db.query("SELECT * FROM public.uyelik_gorunum"))).rows).toHaveLength(0);
    expect((await kimlikle(db, muhasebeA, () => db.query("SELECT * FROM public.uyelik_gorunum"))).rows.length).toBeGreaterThan(0);
  });

  it("dondurma: limit, çakışma, ücret, durum ve bitiş uzaması", async () => {
    await bugunuSabitle(db, "2026-10-01");
    const m = await musteriOlustur(resepsiyonA, "Dondurucu");
    const id = await sat(resepsiyonA, m, paketAy, { baslangic: "2026-10-01" });
    // izin yok
    const dz = await sat(resepsiyonA, m, paketDondurmasiz);
    expect(await kimlikle(db, resepsiyonA, () => hataMesaji(() => db.query("SELECT public.uyelik_dondur($1, 3)", [dz])))).toMatch(/dondurma_izni_yok/);
    // limit
    expect(await kimlikle(db, resepsiyonA, () => hataMesaji(() => db.query("SELECT public.uyelik_dondur($1, 11)", [id])))).toMatch(/dondurma_limiti/);
    expect(await kimlikle(db, resepsiyonA, () => hataMesaji(() => db.query("SELECT public.uyelik_dondur($1, 0)", [id])))).toMatch(/dondurma_gun_gecersiz/);
    // 5 gün dondur: bugünden başlar, bitiş 5 gün uzar, ücret borç yazılır
    const once = await bakiye(m);
    await kimlikle(db, resepsiyonA, () => db.query("SELECT public.uyelik_dondur($1, 5)", [id]));
    const u = await uyelik(id);
    expect(u.bitis_tarihi).toBe("2026-11-04"); // 10-30 + 5
    expect(u.gecerli_durum).toBe("dondurulmus");
    expect(await bakiye(m)).toBe(once - 5_000);
    // aynı anda ikinci dondurma: üyelik artık aktif değil
    expect(await kimlikle(db, resepsiyonA, () => hataMesaji(() => db.query("SELECT public.uyelik_dondur($1, 2)", [id])))).toMatch(/dondurma_uygun_degil/);
    // dondurma bittikten sonra (6 Ekim) tekrar dondurulabilir; toplam limit 10: kalan 5
    await bugunuSabitle(db, "2026-10-06");
    expect((await uyelik(id)).gecerli_durum).toBe("aktif");
    expect(await kimlikle(db, resepsiyonA, () => hataMesaji(() => db.query("SELECT public.uyelik_dondur($1, 6)", [id])))).toMatch(/dondurma_limiti/);
    await kimlikle(db, resepsiyonA, () => db.query("SELECT public.uyelik_dondur($1, 5)", [id]));
    expect((await uyelik(id)).bitis_tarihi).toBe("2026-11-09");
    await bugunuSabitle(db, "2026-10-01");
  });

  it("dondurmayı erken bitir: kullanılmayan günler geri alınır; ilk gün bitirilirse iptal", async () => {
    const m = await musteriOlustur(resepsiyonA, "Erken Bitiren");
    const id = await sat(resepsiyonA, m, paketAy, { baslangic: "2026-10-01" });
    await kimlikle(db, resepsiyonA, () => db.query("SELECT public.uyelik_dondur($1, 10)", [id])); // 10-01..10-10, bitiş 11-09
    expect((await uyelik(id)).bitis_tarihi).toBe("2026-11-09");
    // aynı gün bitir: hiç kullanılmadı -> tam iade, dondurma iptal
    const iade0 = await kimlikle(db, resepsiyonA, () => db.query<{ n: number }>("SELECT public.uyelik_dondurmayi_bitir($1) AS n", [id]));
    expect(iade0.rows[0].n).toBe(10);
    expect((await uyelik(id)).bitis_tarihi).toBe("2026-10-30");
    expect((await uyelik(id)).gecerli_durum).toBe("aktif");
    // iptal edilen dondurma limiti tüketmez: yeniden 10 gün dondurulabilir
    await kimlikle(db, resepsiyonA, () => db.query("SELECT public.uyelik_dondur($1, 10)", [id]));
    // 4. gün erken bitir: 3 gün kullanıldı (10-01..10-03), 7 gün geri
    await bugunuSabitle(db, "2026-10-04");
    const iade = await kimlikle(db, resepsiyonA, () => db.query<{ n: number }>("SELECT public.uyelik_dondurmayi_bitir($1) AS n", [id]));
    expect(iade.rows[0].n).toBe(7);
    expect((await uyelik(id)).bitis_tarihi).toBe("2026-11-02"); // 10-30 + 3
    expect((await uyelik(id)).gecerli_durum).toBe("aktif");
    expect(await kimlikle(db, resepsiyonA, () => hataMesaji(() => db.query("SELECT public.uyelik_dondurmayi_bitir($1)", [id])))).toMatch(/aktif_dondurma_yok/);
    await bugunuSabitle(db, "2026-10-01");
  });

  it("geçerli durum tarihle değişir: beklemede → aktif → sona_erdi; seans bitince sona_erdi", async () => {
    const m = await musteriOlustur(resepsiyonA, "Takvimli");
    const id = await sat(resepsiyonA, m, paketAy, { baslangic: "2026-10-05" });
    expect((await uyelik(id)).gecerli_durum).toBe("beklemede");
    await bugunuSabitle(db, "2026-10-05");
    expect((await uyelik(id)).gecerli_durum).toBe("aktif");
    await bugunuSabitle(db, "2026-11-03"); // bitiş 11-03 DAHİL
    expect((await uyelik(id)).gecerli_durum).toBe("aktif");
    await bugunuSabitle(db, "2026-11-04");
    expect((await uyelik(id)).gecerli_durum).toBe("sona_erdi");
    await bugunuSabitle(db, "2026-10-01");
  });

  it("iptal: yalnız yönetici; iptal edilmiş üyelik dondurulamaz; başka işletme göremez", async () => {
    const m = await musteriOlustur(resepsiyonA, "İptal Edilen");
    const id = await sat(resepsiyonA, m, paketAy);
    expect(await kimlikle(db, resepsiyonA, () => hataMesaji(() => db.query("SELECT public.uyelik_iptal($1, 'x')", [id])))).toMatch(/yetki_yetersiz/);
    expect(await kimlikle(db, adminB, () => hataMesaji(() => db.query("SELECT public.uyelik_iptal($1, 'x')", [id])))).toMatch(/uyelik_bulunamadi/);
    await kimlikle(db, adminA, () => db.query("SELECT public.uyelik_iptal($1, 'Müşteri talebi')", [id]));
    expect((await uyelik(id)).gecerli_durum).toBe("iptal");
    expect(await kimlikle(db, resepsiyonA, () => hataMesaji(() => db.query("SELECT public.uyelik_dondur($1, 3)", [id])))).toMatch(/dondurma_uygun_degil/);
    expect(await kimlikle(db, adminB, () => hataMesaji(() => db.query("SELECT public.uyelik_dondur($1, 3)", [id])))).toMatch(/uyelik_bulunamadi/);
    // iptal para iadesi yapmaz: bakiye değişmedi (iade ayrı ve bilinçli)
    expect(await bakiye(m)).toBe(-100_000);
  });
});

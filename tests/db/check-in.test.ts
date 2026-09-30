import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bugunuSabitle, hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

type Sonuc = { sonuc: string; uyelik_id?: string; kalan_hak?: number | null; red_nedeni?: string; zaten_giris?: boolean; uyari?: boolean; giris_id?: string };

describe("check-in: giriş kaydı, FIFO, hak düşümü, red nedenleri, iptal", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let muhasebeA: string;
  let antrenorA: string;
  let adminB: string;
  let paketAy: string;
  let paketSeans: string;

  async function musteriOlustur(kullanici: string, ad: string) {
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ id: string }>(
        "SELECT public.musteri_olustur(p_ad_soyad => $1, p_telefon => '+905320000000', p_onamlar => '[{\"tur\":\"kvkk_aydinlatma\",\"verildi\":true,\"metin_versiyonu\":\"v1\"}]'::jsonb) AS id",
        [ad]
      );
      return r.rows[0].id;
    });
  }

  async function paket(kullanici: string, isletme: string, tur: "sure" | "seans", o: { sure?: number; seans?: number; gecerlilik?: number | null; ad?: string; dondurma?: boolean }) {
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ id: string }>(
        "INSERT INTO public.uyelik_paketi (isletme_id, ad, tur, sure_gun, seans_sayisi, gecerlilik_gun, fiyat_kurus, dondurma_izni, azami_dondurma_gun) VALUES ($1,$2,$3,$4,$5,$6,10000,$7,$8) RETURNING id",
        [isletme, o.ad ?? tur, tur, o.sure ?? null, o.seans ?? null, o.gecerlilik ?? null, o.dondurma ?? false, o.dondurma ? 10 : 0]
      );
      return r.rows[0].id;
    });
  }

  async function sat(kullanici: string, m: string, p: string, baslangic: string | null = null) {
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ id: string }>("SELECT public.uyelik_sat(p_musteri_id => $1, p_paket_id => $2, p_baslangic => $3::date) AS id", [m, p, baslangic]);
      return r.rows[0].id;
    });
  }

  async function giris(kullanici: string, m: string, kaynak = "resepsiyon"): Promise<Sonuc> {
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ s: Sonuc }>("SELECT public.check_in($1, $2) AS s", [m, kaynak]);
      return r.rows[0].s;
    });
  }

  async function kalan(id: string): Promise<number | null> {
    const r = await db.query<{ kalan_hak: number | null }>("SELECT kalan_hak FROM public.uyelik WHERE id = $1", [id]);
    return r.rows[0].kalan_hak;
  }

  async function bakiyeHareketSayisi(m: string): Promise<number> {
    const r = await db.query<{ c: string }>("SELECT count(*) AS c FROM public.musteri_bakiye_hareket WHERE musteri_id = $1", [m]);
    return Number(r.rows[0].c);
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
    paketAy = await paket(adminA, isletmeA, "sure", { sure: 30, ad: "Aylık", dondurma: true });
    paketSeans = await paket(adminA, isletmeA, "seans", { seans: 10, gecerlilik: 60, ad: "10 Seans" });
  }, 120_000);

  it("üyeliksiz müşteri reddedilir ve red kaydedilir", async () => {
    const m = await musteriOlustur(resepsiyonA, "Üyeliksiz");
    const r = await giris(resepsiyonA, m);
    expect(r).toMatchObject({ sonuc: "red", red_nedeni: "uyelik_yok" });
    const kayit = await db.query<{ sonuc: string; red_nedeni: string }>("SELECT sonuc, red_nedeni FROM public.giris_kaydi WHERE musteri_id = $1", [m]);
    expect(kayit.rows).toEqual([{ sonuc: "red", red_nedeni: "uyelik_yok" }]);
  });

  it("süre bazlı üyelik: kabul, bakiyeye DOKUNMAZ, aynı gün ikinci giriş aynı kaydı döndürür", async () => {
    const m = await musteriOlustur(resepsiyonA, "Süreli");
    await sat(resepsiyonA, m, paketAy);
    const hareketOnce = await bakiyeHareketSayisi(m);
    const a = await giris(resepsiyonA, m);
    expect(a).toMatchObject({ sonuc: "kabul", zaten_giris: false, kalan_hak: null });
    const b = await giris(resepsiyonA, m);
    expect(b).toMatchObject({ sonuc: "kabul", zaten_giris: true, giris_id: a.giris_id });
    expect(await bakiyeHareketSayisi(m)).toBe(hareketOnce);
    const k = await db.query<{ c: string }>("SELECT count(*) AS c FROM public.giris_kaydi WHERE musteri_id = $1 AND sonuc = 'kabul'", [m]);
    expect(Number(k.rows[0].c)).toBe(1);
  });

  it("seans bazlı: günde bir hak düşer; yeni günde tekrar düşer; hak bitince red", async () => {
    const m = await musteriOlustur(resepsiyonA, "Seanslı");
    const kucuk = await paket(adminA, isletmeA, "seans", { seans: 2, gecerlilik: 30, ad: "2 Seans" });
    const uy = await sat(resepsiyonA, m, kucuk);
    const g1 = await giris(resepsiyonA, m);
    expect(g1).toMatchObject({ sonuc: "kabul", kalan_hak: 1 });
    await giris(resepsiyonA, m); // aynı gün: düşmez
    expect(await kalan(uy)).toBe(1);
    await bugunuSabitle(db, "2026-10-02");
    expect(await giris(resepsiyonA, m)).toMatchObject({ sonuc: "kabul", kalan_hak: 0, uyari: true });
    await bugunuSabitle(db, "2026-10-03");
    expect(await giris(resepsiyonA, m)).toMatchObject({ sonuc: "red", red_nedeni: "hak_bitti" });
    await bugunuSabitle(db, "2026-10-01");
  });

  it("FIFO: bitişi yakın olan üyelik önce kullanılır; o bitince diğerine geçer", async () => {
    const m = await musteriOlustur(resepsiyonA, "İki Paketli");
    const uzun = await paket(adminA, isletmeA, "seans", { seans: 5, gecerlilik: 90, ad: "Uzun" });
    const kisa = await paket(adminA, isletmeA, "seans", { seans: 1, gecerlilik: 10, ad: "Kısa" });
    const uyUzun = await sat(resepsiyonA, m, uzun); // önce satıldı ama bitişi uzak
    const uyKisa = await sat(resepsiyonA, m, kisa); // bitişi yakın -> önce bu düşmeli
    expect((await giris(resepsiyonA, m)).uyelik_id).toBe(uyKisa);
    expect(await kalan(uyKisa)).toBe(0);
    await bugunuSabitle(db, "2026-10-02");
    const ikinci = await giris(resepsiyonA, m);
    expect(ikinci.uyelik_id).toBe(uyUzun);
    expect(await kalan(uyUzun)).toBe(4);
    await bugunuSabitle(db, "2026-10-01");
  });

  it("süresiz seans paketi (bitişsiz) sona bırakılır", async () => {
    const m = await musteriOlustur(resepsiyonA, "Süresiz");
    const suresiz = await paket(adminA, isletmeA, "seans", { seans: 5, gecerlilik: null, ad: "Süresiz" });
    const sureli = await paket(adminA, isletmeA, "seans", { seans: 5, gecerlilik: 30, ad: "Süreli" });
    const uySuresiz = await sat(resepsiyonA, m, suresiz);
    const uySureli = await sat(resepsiyonA, m, sureli);
    expect((await giris(resepsiyonA, m)).uyelik_id).toBe(uySureli);
    expect(await kalan(uySuresiz)).toBe(5);
  });

  it("red nedenleri: dondurulmuş, başlamamış, süresi dolmuş, pasif müşteri", async () => {
    const m = await musteriOlustur(resepsiyonA, "Redli");
    const uy = await sat(resepsiyonA, m, paketAy);
    await kimlikle(db, resepsiyonA, () => db.query("SELECT public.uyelik_dondur($1, 5)", [uy]));
    expect(await giris(resepsiyonA, m)).toMatchObject({ sonuc: "red", red_nedeni: "donduruldu" });
    // dondurma bitti (bugün 10-06): artık girebilir
    await bugunuSabitle(db, "2026-10-06");
    expect(await giris(resepsiyonA, m)).toMatchObject({ sonuc: "kabul" });
    // süresi dolmuş (bitiş 11-04 dahil; 11-05 red)
    await bugunuSabitle(db, "2026-11-05");
    expect(await giris(resepsiyonA, m)).toMatchObject({ sonuc: "red", red_nedeni: "suresi_doldu" });

    await bugunuSabitle(db, "2026-10-01");
    const gelecek = await musteriOlustur(resepsiyonA, "Gelecek Üye");
    await sat(resepsiyonA, gelecek, paketAy, "2026-10-10");
    expect(await giris(resepsiyonA, gelecek)).toMatchObject({ sonuc: "red", red_nedeni: "baslamadi" });

    const pasif = await musteriOlustur(resepsiyonA, "Pasif Üye");
    await sat(resepsiyonA, pasif, paketAy);
    await kimlikle(db, adminA, () => db.query("UPDATE public.musteri SET aktif = false WHERE id = $1", [pasif]));
    expect(await giris(resepsiyonA, pasif)).toMatchObject({ sonuc: "red", red_nedeni: "musteri_pasif" });
  });

  it("iptal edilmiş üyelik giriş sağlamaz", async () => {
    const m = await musteriOlustur(resepsiyonA, "İptalli");
    const uy = await sat(resepsiyonA, m, paketAy);
    await kimlikle(db, adminA, () => db.query("SELECT public.uyelik_iptal($1)", [uy]));
    expect(await giris(resepsiyonA, m)).toMatchObject({ sonuc: "red", red_nedeni: "uyelik_yok" });
  });

  it("uyarı: bitişe ≤ 7 gün veya kalan hak ≤ 2", async () => {
    const m = await musteriOlustur(resepsiyonA, "Uyarılı");
    await sat(resepsiyonA, m, paketAy, "2026-10-01"); // bitiş 10-30
    await bugunuSabitle(db, "2026-10-22"); // 8 gün kaldı
    expect((await giris(resepsiyonA, m)).uyari).toBe(false);
    await bugunuSabitle(db, "2026-10-23"); // 7 gün kaldı
    expect((await giris(resepsiyonA, m)).uyari).toBe(true);
    await bugunuSabitle(db, "2026-10-01");
  });

  it("check-in iptali: hak geri verilir, aynı gün yeniden giriş mümkün; ertesi gün iptal edilemez", async () => {
    const m = await musteriOlustur(resepsiyonA, "Yanlış Kişi");
    const uy = await sat(resepsiyonA, m, paketSeans);
    const g = await giris(resepsiyonA, m);
    expect(await kalan(uy)).toBe(9);
    await kimlikle(db, resepsiyonA, () => db.query("SELECT public.check_in_iptal($1)", [g.giris_id]));
    expect(await kalan(uy)).toBe(10);
    expect(await kimlikle(db, resepsiyonA, () => hataMesaji(() => db.query("SELECT public.check_in_iptal($1)", [g.giris_id])))).toMatch(/giris_bulunamadi/);
    const yeni = await giris(resepsiyonA, m);
    expect(yeni).toMatchObject({ sonuc: "kabul", zaten_giris: false, kalan_hak: 9 });
    await bugunuSabitle(db, "2026-10-02");
    expect(await kimlikle(db, resepsiyonA, () => hataMesaji(() => db.query("SELECT public.check_in_iptal($1)", [yeni.giris_id])))).toMatch(/giris_iptal_suresi_doldu/);
    await bugunuSabitle(db, "2026-10-01");
  });

  it("yetki ve tenant: muhasebe/antrenör giriş yapamaz; başka işletmenin müşterisi bulunamaz; tablo yazılamaz", async () => {
    const m = await musteriOlustur(resepsiyonA, "Yetkili Test");
    await sat(resepsiyonA, m, paketAy);
    expect(await hataMesaji(() => giris(muhasebeA, m))).toMatch(/yetki_yetersiz/);
    expect(await hataMesaji(() => giris(antrenorA, m))).toMatch(/yetki_yetersiz/);
    expect(await hataMesaji(() => giris(adminB, m))).toMatch(/musteri_bulunamadi/);
    expect(await kimlikle(db, resepsiyonA, () => hataMesaji(() => db.query("INSERT INTO public.giris_kaydi (isletme_id, musteri_id, sonuc, uyelik_id) VALUES ($1,$2,'kabul',gen_random_uuid())", [isletmeA, m])))).toMatch(/permission denied/);
    expect(await kimlikle(db, adminA, () => hataMesaji(() => db.query("UPDATE public.giris_kaydi SET sonuc = 'kabul'")))).toMatch(/permission denied/);
    // okuma: yalnız admin/resepsiyon ve yalnız kendi işletmesi
    expect((await kimlikle(db, antrenorA, () => db.query("SELECT * FROM public.giris_kaydi"))).rows).toHaveLength(0);
    expect((await kimlikle(db, muhasebeA, () => db.query("SELECT * FROM public.giris_kaydi"))).rows).toHaveLength(0);
    const b = await kimlikle(db, adminB, () => db.query("SELECT * FROM public.giris_kaydi"));
    expect(b.rows).toHaveLength(0);
  });

  it("eşzamanlı çift istek: tek kabul, tek hak düşümü", async () => {
    const m = await musteriOlustur(resepsiyonA, "Çift Tıklayan");
    const uy = await sat(resepsiyonA, m, paketSeans);
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${resepsiyonA}', false);`);
    const sonuclar = await Promise.all([
      db.query<{ s: Sonuc }>("SELECT public.check_in($1) AS s", [m]),
      db.query<{ s: Sonuc }>("SELECT public.check_in($1) AS s", [m]),
    ]);
    await db.exec("RESET ROLE");
    expect(sonuclar.every((r) => r.rows[0].s.sonuc === "kabul")).toBe(true);
    expect(await kalan(uy)).toBe(9);
    const k = await db.query<{ c: string }>("SELECT count(*) AS c FROM public.giris_kaydi WHERE musteri_id = $1 AND sonuc = 'kabul' AND NOT iptal", [m]);
    expect(Number(k.rows[0].c)).toBe(1);
  });
});

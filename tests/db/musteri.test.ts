import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bugunuSabitle, hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

// Geçerli örnek TC kimlik numarası (algoritma testi için): 10000000146
const GECERLI_TC = "10000000146";

describe("müşteri: KVKK kuralları, tenant izolasyonu, hassas veri erişimi, arama", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let muhasebeA: string;
  let antrenorA: string;
  let adminB: string;

  const onamKvkk = { tur: "kvkk_aydinlatma", verildi: true, metin_versiyonu: "v1" };

  async function olustur(kullanici: string, args: Record<string, unknown>) {
    const p = {
      ad_soyad: "Ayşe Nur", telefon: "+905322275512", eposta: null, dogum: null, hassas: null, veli: null,
      onamlar: [onamKvkk], ...args,
    };
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ id: string }>(
        "SELECT public.musteri_olustur(p_ad_soyad => $1, p_telefon => $2, p_eposta => $3, p_dogum_tarihi => $4::date, p_hassas => $5::jsonb, p_veli => $6::jsonb, p_onamlar => $7::jsonb) AS id",
        [p.ad_soyad, p.telefon, p.eposta, p.dogum, p.hassas ? JSON.stringify(p.hassas) : null, p.veli ? JSON.stringify(p.veli) : null, JSON.stringify(p.onamlar)]
      );
      return r.rows[0].id;
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
  }, 120_000);

  it("TC kimlik algoritması: geçerli kabul, geçersiz red", async () => {
    const r = await db.query<{ a: boolean; b: boolean; c: boolean }>(
      `SELECT public.tc_kimlik_gecerli('${GECERLI_TC}') AS a, public.tc_kimlik_gecerli('10000000147') AS b, public.tc_kimlik_gecerli('01234567890') AS c`
    );
    expect(r.rows[0]).toEqual({ a: true, b: false, c: false });
  });

  it("üye numarası işletme başına 1'den artar, işletmeler birbirinden bağımsız", async () => {
    const a1 = await olustur(resepsiyonA, { ad_soyad: "Ali Veli" });
    const a2 = await olustur(resepsiyonA, { ad_soyad: "Can Yılmaz" });
    const b1 = await olustur(adminB, { ad_soyad: "Zeynep Kaya" });
    const no = async (id: string) => (await db.query<{ uye_no: string }>("SELECT uye_no FROM public.musteri WHERE id = $1", [id])).rows[0].uye_no;
    expect(Number(await no(a1))).toBe(1);
    expect(Number(await no(a2))).toBe(2);
    expect(Number(await no(b1))).toBe(1);
  });

  it("istemci üye numarası veremez (ezilir) ve sonradan değiştiremez", async () => {
    const id = await kimlikle(db, resepsiyonA, async () => {
      const r = await db.query<{ id: string }>(
        "INSERT INTO public.musteri (isletme_id, uye_no, ad_soyad, telefon) VALUES ($1, 999, 'Elif Su', '+905320000001') RETURNING id",
        [isletmeA]
      );
      return r.rows[0].id;
    });
    const r = await db.query<{ uye_no: string }>("SELECT uye_no FROM public.musteri WHERE id = $1", [id]);
    expect(Number(r.rows[0].uye_no)).not.toBe(999);
    const hata = await kimlikle(db, resepsiyonA, () =>
      hataMesaji(() => db.query("UPDATE public.musteri SET uye_no = 5 WHERE id = $1", [id]))
    );
    expect(hata).toMatch(/degismez_alan/);
  });

  it("18 yaş altı: veli ve veli onayı zorunlu", async () => {
    const dogum = "2015-05-05";
    const h1 = await hataMesaji(() => olustur(resepsiyonA, { ad_soyad: "Küçük Sporcu", dogum }));
    expect(h1).toMatch(/veli_gerekli/);
    const veli = { ad_soyad: "Anne Yılmaz", telefon: "+905320000002", yakinlik: "anne" };
    const h2 = await hataMesaji(() => olustur(resepsiyonA, { ad_soyad: "Küçük Sporcu", dogum, veli }));
    expect(h2).toMatch(/veli_onayi_gerekli/);
    const id = await olustur(resepsiyonA, {
      ad_soyad: "Küçük Sporcu", dogum, veli,
      onamlar: [onamKvkk, { tur: "veli_onayi", verildi: true, metin_versiyonu: "v1", veren: "veli" }],
    });
    const v = await db.query("SELECT 1 FROM public.musteri_veli WHERE musteri_id = $1", [id]);
    expect(v.rows).toHaveLength(1);
  });

  it("18. yaş günü İstanbul gününe göre: bugün 18 olan reşittir", async () => {
    // bugun = 2026-09-30; doğum 2008-09-30 -> bugün 18 oldu -> veli gerekmez
    const id = await olustur(resepsiyonA, { ad_soyad: "Yeni Reşit", dogum: "2008-09-30" });
    expect(id).toBeTruthy();
    // doğum 2008-10-01 -> yarın 18 olacak -> hâlâ küçük
    const h = await hataMesaji(() => olustur(resepsiyonA, { ad_soyad: "Yarın Reşit", dogum: "2008-10-01" }));
    expect(h).toMatch(/veli_gerekli/);
  });

  it("sağlık verisi açık rıza olmadan kaydedilemez", async () => {
    const hassas = { tc_kimlik_no: GECERLI_TC, saglik_bayraklari: ["tansiyon"], saglik_notu: "Yüksek tansiyon" };
    const h = await hataMesaji(() => olustur(resepsiyonA, { ad_soyad: "Sağlık Riskli", hassas }));
    expect(h).toMatch(/saglik_riza_gerekli/);
    const id = await olustur(resepsiyonA, {
      ad_soyad: "Sağlık Riskli", hassas,
      onamlar: [onamKvkk, { tur: "acik_riza_saglik", verildi: true, metin_versiyonu: "v1" }],
    });
    expect(id).toBeTruthy();
  });

  it("atomiklik: hassas veri hatalıysa müşteri de oluşmaz", async () => {
    const once = await db.query<{ c: string }>("SELECT count(*) AS c FROM public.musteri");
    const h = await hataMesaji(() => olustur(resepsiyonA, { ad_soyad: "Hatalı Tc", hassas: { tc_kimlik_no: "12345678901" } }));
    expect(h).not.toBeNull();
    const sonra = await db.query<{ c: string }>("SELECT count(*) AS c FROM public.musteri");
    expect(sonra.rows[0].c).toBe(once.rows[0].c);
  });

  it("tenant izolasyonu: başka işletmenin müşterisi görünmez/değiştirilemez", async () => {
    const bId = await olustur(adminB, { ad_soyad: "Sadece B" });
    const a = await kimlikle(db, adminA, () => db.query<{ id: string }>("SELECT id FROM public.musteri WHERE id = $1", [bId]));
    expect(a.rows).toHaveLength(0);
    const u = await kimlikle(db, adminA, () => db.query("UPDATE public.musteri SET ad_soyad = 'Hack' WHERE id = $1 RETURNING id", [bId]));
    expect(u.rows).toHaveLength(0);
    // Başka işletme adına insert
    const h = await kimlikle(db, adminA, () =>
      hataMesaji(() => db.query("INSERT INTO public.musteri (isletme_id, ad_soyad, telefon) VALUES ($1, 'Sızma', '+905320000009')", [isletmeB]))
    );
    expect(h).toMatch(/row-level security/);
  });

  it("rol matrisi: muhasebe ve antrenör kişisel veriyi göremez; özet görünümünü görür", async () => {
    const tumMusteri = await db.query<{ c: string }>("SELECT count(*) AS c FROM public.musteri WHERE isletme_id = $1", [isletmeA]);
    expect(Number(tumMusteri.rows[0].c)).toBeGreaterThan(0);
    for (const kim of [muhasebeA, antrenorA]) {
      const m = await kimlikle(db, kim, () => db.query("SELECT * FROM public.musteri"));
      expect(m.rows).toHaveLength(0);
      const h = await kimlikle(db, kim, () => db.query("SELECT * FROM public.musteri_hassas"));
      expect(h.rows).toHaveLength(0);
      const ozet = await kimlikle(db, kim, () => db.query<Record<string, unknown>>("SELECT * FROM public.musteri_ozet"));
      expect(ozet.rows.length).toBe(Number(tumMusteri.rows[0].c));
      expect(Object.keys(ozet.rows[0]).sort()).toEqual(["ad_soyad", "aktif", "id", "isletme_id", "kategori", "uye_no"]);
    }
    // Başka işletme özeti sızdırmaz
    const ozetB = await kimlikle(db, adminB, () => db.query<{ isletme_id: string }>("SELECT isletme_id FROM public.musteri_ozet"));
    expect(ozetB.rows.every((r) => r.isletme_id === isletmeB)).toBe(true);
  });

  it("onam kaydı değiştirilemez/silinemez (ispat); müşteri silinemez", async () => {
    const id = await olustur(adminA, { ad_soyad: "Onam Testi" });
    const u = await kimlikle(db, adminA, () =>
      hataMesaji(() => db.query("UPDATE public.musteri_onam SET verildi = false WHERE musteri_id = $1", [id]))
    );
    expect(u).toMatch(/permission denied/);
    const dogrulama = await db.query<{ verildi: boolean }>("SELECT verildi FROM public.musteri_onam WHERE musteri_id = $1", [id]);
    expect(dogrulama.rows.every((r) => r.verildi === true)).toBe(true);
    const d = await kimlikle(db, adminA, () => hataMesaji(() => db.query("DELETE FROM public.musteri_onam WHERE musteri_id = $1", [id])));
    expect(d).toMatch(/permission denied/);
    const dm = await kimlikle(db, adminA, () => hataMesaji(() => db.query("DELETE FROM public.musteri WHERE id = $1", [id])));
    expect(dm).toMatch(/permission denied/);
  });

  it("arama: Türkçe büyük/küçük harf, telefon, üye no, LIKE kaçışı", async () => {
    await olustur(resepsiyonA, { ad_soyad: "İBRAHİM Işık", telefon: "+905551112233" });
    const ara = async (q: string) =>
      kimlikle(db, resepsiyonA, async () =>
        (await db.query<{ ad_soyad: string }>("SELECT ad_soyad FROM public.musteri_ara($1)", [q])).rows.map((r) => r.ad_soyad)
      );
    expect(await ara("ibrahim")).toContain("İBRAHİM Işık");
    expect(await ara("IŞIK")).toContain("İBRAHİM Işık");
    expect(await ara("555111")).toContain("İBRAHİM Işık");
    expect(await ara("%")).toEqual([]); // joker kaçırılır, her şeyi eşleştirmez
    expect(await ara("_")).toEqual([]);
    const b = await kimlikle(db, adminB, async () =>
      (await db.query("SELECT * FROM public.musteri_ara('ibrahim')")).rows
    );
    expect(b).toHaveLength(0); // başka işletme görmez
  });

  it("audit: müşteri değişikliğinde yalnız alan adları, kişisel değer yok", async () => {
    const id = await olustur(adminA, { ad_soyad: "Audit Kişisi" });
    await kimlikle(db, adminA, () => db.query("UPDATE public.musteri SET telefon = '+905329998877' WHERE id = $1", [id]));
    const r = await db.query<{ degisen_alanlar: string[] }>(
      "SELECT degisen_alanlar FROM public.audit_log WHERE tablo = 'musteri' AND kayit_id = $1 AND islem = 'UPDATE'",
      [id]
    );
    expect(r.rows[0].degisen_alanlar).toContain("telefon");
    const hepsi = await db.query<{ m: string }>("SELECT to_jsonb(a)::text AS m FROM public.audit_log a WHERE tablo LIKE 'musteri%'");
    const metin = hepsi.rows.map((x) => x.m).join(" ");
    expect(metin).not.toContain("905329998877");
    expect(metin).not.toContain(GECERLI_TC);
  });

  it("musteri_ozet görünümü üzerinden yazma RLS'i atlayamaz", async () => {
    const id = await olustur(adminA, { ad_soyad: "Görünüm Testi" });
    for (const kim of [muhasebeA, antrenorA, resepsiyonA, adminA]) {
      const u = await kimlikle(db, kim, () => hataMesaji(() => db.query("UPDATE public.musteri_ozet SET ad_soyad = 'Hack' WHERE id = $1", [id])));
      expect(u).toMatch(/permission denied/);
      const d = await kimlikle(db, kim, () => hataMesaji(() => db.query("DELETE FROM public.musteri_ozet WHERE id = $1", [id])));
      expect(d).toMatch(/permission denied/);
    }
    const r = await db.query<{ ad_soyad: string }>("SELECT ad_soyad FROM public.musteri WHERE id = $1", [id]);
    expect(r.rows[0].ad_soyad).toBe("Görünüm Testi");
  });

  it("audit_log bölümlerine doğrudan erişim kapalı (üst tablonun RLS'i atlanamaz)", async () => {
    const bolumler = await db.query<{ relname: string }>(
      "SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_class p ON p.oid = i.inhparent WHERE p.relname = 'audit_log'"
    );
    expect(bolumler.rows.length).toBeGreaterThanOrEqual(3);
    for (const { relname } of bolumler.rows) {
      const h = await kimlikle(db, adminA, () => hataMesaji(() => db.query(`SELECT * FROM public.${relname}`)));
      expect(h, relname).toMatch(/permission denied/);
    }
  });
});

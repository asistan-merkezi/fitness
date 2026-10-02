import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

describe("müşteri risk bayrakları", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let muhasebeA: string;
  let antrenorA: string;
  let adminB: string;
  let musteri: string;

  const ekle = (k: string, m: string, tip: string, seviye = "orta", aciklama: string | null = null) =>
    kimlikle(db, k, async () => (await db.query<{ id: string }>("SELECT public.risk_bayragi_ekle($1,$2,$3,$4) AS id", [m, tip, seviye, aciklama])).rows[0].id);
  const kaldir = (k: string, id: string) => kimlikle(db, k, () => db.query("SELECT public.risk_bayragi_kaldir($1)", [id]));
  const goren = (k: string) => kimlikle(db, k, async () => (await db.query("SELECT id FROM public.musteri_risk_bayragi")).rows.length);

  beforeAll(async () => {
    db = await yeniVeritabani();
    isletmeA = await isletmeOlustur(db, "Salon A");
    isletmeB = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin" });
    resepsiyonA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
    muhasebeA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "muhasebe" });
    antrenorA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor" });
    adminB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "isletme_admin" });
    musteri = await kimlikle(db, resepsiyonA, async () => {
      const r = await db.query<{ id: string }>("SELECT public.musteri_olustur(p_ad_soyad => 'Müşteri Bir', p_telefon => '+905320000000', p_onamlar => '[{\"tur\":\"kvkk_aydinlatma\",\"verildi\":true,\"metin_versiyonu\":\"v1\"}]'::jsonb) AS id");
      return r.rows[0].id;
    });
  }, 120_000);

  it("yönetici ve resepsiyon bayrak ekler; işletme müşteriden türetilir", async () => {
    const id = await ekle(resepsiyonA, musteri, "diyabet", "yuksek", "  İnsülin kullanıyor  ");
    const s = (await db.query<{ isletme_id: string; aciklama: string; aktif: boolean }>("SELECT isletme_id, aciklama, aktif FROM public.musteri_risk_bayragi WHERE id = $1", [id])).rows[0];
    expect(s).toEqual({ isletme_id: isletmeA, aciklama: "İnsülin kullanıyor", aktif: true });
    await ekle(adminA, musteri, "sakatlik", "dusuk");
  });

  it("aynı tipte aktif bayrak tekrar eklenmez; geçersiz tip/seviye reddedilir", async () => {
    expect(await hataMesaji(() => ekle(adminA, musteri, "diyabet"))).toMatch(/risk_zaten_var/);
    expect(await hataMesaji(() => ekle(adminA, musteri, "yok"))).toMatch(/check/i);
    expect(await hataMesaji(() => ekle(adminA, musteri, "astim", "kritik"))).toMatch(/check/i);
  });

  it("muhasebe ve antrenör ekleyemez ve göremez (özel nitelikli sağlık verisi); başka işletme göremez", async () => {
    expect(await hataMesaji(() => ekle(muhasebeA, musteri, "astim"))).toMatch(/yetki_yetersiz/);
    expect(await hataMesaji(() => ekle(antrenorA, musteri, "astim"))).toMatch(/yetki_yetersiz/);
    expect(await goren(adminA)).toBe(2);
    expect(await goren(resepsiyonA)).toBe(2);
    expect(await goren(muhasebeA)).toBe(0);
    expect(await goren(antrenorA)).toBe(0);
    expect(await goren(adminB)).toBe(0);
    expect(await hataMesaji(() => ekle(adminB, musteri, "astim"))).toMatch(/musteri_bulunamadi/);
  });

  it("kaldırma silmez: pasife alır, kim/ne zaman kayıtlı kalır; kaldırılan tip yeniden eklenebilir; çift kaldırma reddedilir", async () => {
    const id = (await db.query<{ id: string }>("SELECT id FROM public.musteri_risk_bayragi WHERE tip = 'diyabet'")).rows[0].id;
    await kaldir(resepsiyonA, id);
    const s = (await db.query<{ aktif: boolean; kaldirma_tarihi: string | null }>("SELECT aktif, kaldirma_tarihi FROM public.musteri_risk_bayragi WHERE id = $1", [id])).rows[0];
    expect(s.aktif).toBe(false);
    expect(s.kaldirma_tarihi).not.toBeNull();
    expect(await hataMesaji(() => kaldir(adminA, id))).toMatch(/risk_bulunamadi/);
    expect(await hataMesaji(() => kaldir(muhasebeA, id))).toMatch(/yetki_yetersiz/);
    expect(await ekle(adminA, musteri, "diyabet", "orta")).toBeTruthy();
  });

  it("doğrudan yazılamaz; başka işletmenin bayrağı kaldırılamaz", async () => {
    expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("INSERT INTO public.musteri_risk_bayragi (isletme_id, musteri_id, tip, seviye) VALUES ($1,$2,'alerji','orta')", [isletmeA, musteri])))).toMatch(/permission denied/i);
    const id = (await db.query<{ id: string }>("SELECT id FROM public.musteri_risk_bayragi WHERE aktif LIMIT 1")).rows[0].id;
    expect(await hataMesaji(() => kaldir(adminB, id))).toMatch(/risk_bulunamadi/);
  });
});

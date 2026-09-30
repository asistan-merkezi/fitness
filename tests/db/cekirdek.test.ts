import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

describe("çekirdek şema: tenant izolasyonu, rol koruması, audit", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let adminB: string;
  let resepsiyonA: string;
  let superAdmin: string;

  beforeAll(async () => {
    db = await yeniVeritabani();
    isletmeA = await isletmeOlustur(db, "Salon A");
    isletmeB = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin" });
    adminB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "isletme_admin" });
    resepsiyonA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
    superAdmin = await kullaniciOlustur(db, { isletmeId: null, rol: "super_admin" });
  }, 120_000);

  it("kullanıcı yalnız kendi işletmesini görür; super_admin hepsini", async () => {
    const a = await kimlikle(db, adminA, () => db.query<{ id: string }>("SELECT id FROM public.isletme"));
    expect(a.rows.map((r) => r.id)).toEqual([isletmeA]);
    const s = await kimlikle(db, superAdmin, () => db.query("SELECT id FROM public.isletme"));
    expect(s.rows).toHaveLength(2);
  });

  it("başka işletmenin kullanıcılarını göremez", async () => {
    const r = await kimlikle(db, adminA, () => db.query<{ id: string }>("SELECT id FROM public.kullanici"));
    const idler = r.rows.map((x) => x.id);
    expect(idler).toContain(resepsiyonA);
    expect(idler).not.toContain(adminB);
  });

  it("işletme adını yalnız kendi yöneticisi günceller", async () => {
    await kimlikle(db, adminA, () => db.query("UPDATE public.isletme SET ad = 'Salon A Yeni' WHERE id = $1", [isletmeA]));
    const r = await kimlikle(db, resepsiyonA, () =>
      db.query("UPDATE public.isletme SET ad = 'Hack' WHERE id = $1 RETURNING id", [isletmeA])
    );
    expect(r.rows).toHaveLength(0); // RLS: 0 satır etkilenir
    const b = await kimlikle(db, adminA, () =>
      db.query("UPDATE public.isletme SET ad = 'Hack' WHERE id = $1 RETURNING id", [isletmeB])
    );
    expect(b.rows).toHaveLength(0);
  });

  it("plan değişikliği yalnız super_admin'e açık", async () => {
    const hata = await kimlikle(db, adminA, () =>
      hataMesaji(() => db.query("UPDATE public.isletme SET plan = 'buyuk' WHERE id = $1", [isletmeA]))
    );
    expect(hata).toMatch(/yetki_yetersiz/);
    await kimlikle(db, superAdmin, () => db.query("UPDATE public.isletme SET plan = 'orta' WHERE id = $1", [isletmeA]));
  });

  it("yetki yükseltme ve tenant değiştirme engellenir", async () => {
    const h1 = await kimlikle(db, resepsiyonA, () =>
      hataMesaji(() => db.query("UPDATE public.kullanici SET rol = 'isletme_admin' WHERE id = $1", [resepsiyonA]))
    );
    expect(h1).toMatch(/yetki_yetersiz/);
    const h2 = await kimlikle(db, adminA, () =>
      hataMesaji(() => db.query("UPDATE public.kullanici SET rol = 'muhasebe' WHERE id = $1", [adminA]))
    );
    expect(h2).toMatch(/yetki_yetersiz/);
    const h3 = await kimlikle(db, adminA, () =>
      hataMesaji(() => db.query("UPDATE public.kullanici SET rol = 'super_admin' WHERE id = $1", [resepsiyonA]))
    );
    expect(h3).toMatch(/yetki_yetersiz/);
    const h4 = await kimlikle(db, adminA, () =>
      hataMesaji(() => db.query("UPDATE public.kullanici SET isletme_id = $1 WHERE id = $2", [isletmeB, resepsiyonA]))
    );
    expect(h4).toMatch(/isletme_degistirilemez/);
    // Yönetici kendi işletmesindeki personelin rolünü değiştirebilir
    await kimlikle(db, adminA, () => db.query("UPDATE public.kullanici SET rol = 'muhasebe' WHERE id = $1", [resepsiyonA]));
    await db.query("UPDATE public.kullanici SET rol = 'resepsiyon' WHERE id = $1", [resepsiyonA]);
  });

  it("kullanıcı satırı eklenemez (yalnız service_role)", async () => {
    const r = await kimlikle(db, adminA, () =>
      hataMesaji(() =>
        db.query(
          "INSERT INTO public.kullanici (id, isletme_id, ad_soyad, rol) VALUES (gen_random_uuid(), $1, 'Yeni Kişi', 'resepsiyon')",
          [isletmeA]
        )
      )
    );
    expect(r).not.toBeNull();
  });

  it("anon hiçbir şey göremez", async () => {
    await db.exec("SET ROLE anon");
    const hata = await hataMesaji(() => db.query("SELECT * FROM public.isletme"));
    await db.exec("RESET ROLE");
    expect(hata).toMatch(/permission denied/);
  });

  it("audit: değişen alan ADLARI kaydedilir, ham değer asla", async () => {
    await kimlikle(db, adminA, () => db.query("UPDATE public.isletme SET ad = 'Gizli Ad Değeri' WHERE id = $1", [isletmeA]));
    const r = await db.query<{ degisen_alanlar: string[] | null; tablo: string }>(
      "SELECT tablo, degisen_alanlar FROM public.audit_log WHERE tablo = 'isletme' AND isletme_id = $1 ORDER BY id DESC LIMIT 1",
      [isletmeA]
    );
    expect(r.rows[0].degisen_alanlar).toContain("ad");
    const tumu = await db.query<{ m: string }>("SELECT to_jsonb(a)::text AS m FROM public.audit_log a");
    expect(tumu.rows.map((x) => x.m).join(" ")).not.toContain("Gizli Ad Değeri");
  });

  it("audit_log: yalnız kendi işletmesinin yöneticisi okur; yazılamaz", async () => {
    const adminOkur = await kimlikle(db, adminA, () =>
      db.query<{ isletme_id: string }>("SELECT DISTINCT isletme_id FROM public.audit_log")
    );
    expect(adminOkur.rows.every((r) => r.isletme_id === isletmeA)).toBe(true);
    const resepsiyonOkur = await kimlikle(db, resepsiyonA, () => db.query("SELECT * FROM public.audit_log"));
    expect(resepsiyonOkur.rows).toHaveLength(0);
    const yaz = await kimlikle(db, adminA, () =>
      hataMesaji(() => db.query("INSERT INTO public.audit_log (tablo, islem) VALUES ('x', 'INSERT')"))
    );
    expect(yaz).not.toBeNull();
  });

  it("tr_normalize Türkçe harfleri sadeleştirir", async () => {
    const r = await db.query<{ n: string }>("SELECT public.tr_normalize('İBRAHİM Işıl ŞĞÜÖÇ') AS n");
    expect(r.rows[0].n).toBe("ibrahim isil sguoc");
  });
});

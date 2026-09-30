import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { hataMesaji, isletmeOlustur, kullaniciOlustur, yeniVeritabani } from "./harness";

describe("personel telefon girişi", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let resepsiyon: string;

  const cozum = async (telefon: string) =>
    (await db.query<{ e: string | null }>("SELECT public.personel_giris_epostasi($1) AS e", [telefon])).rows[0].e;

  beforeAll(async () => {
    db = await yeniVeritabani();
    isletmeA = await isletmeOlustur(db, "Salon A");
    isletmeB = await isletmeOlustur(db, "Salon B");
    resepsiyon = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon", telefon: "+90 532 111 22 33", eposta: "resepsiyon@a.test" });
    await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin", telefon: "0532 999 88 77", eposta: "admin@a.test" });
  });

  it("telefon farklı biçimlerde personelin e-postasına çözülür", async () => {
    expect(await cozum("0532 111 22 33")).toBe("resepsiyon@a.test");
    expect(await cozum("+905321112233")).toBe("resepsiyon@a.test");
    expect(await cozum("5321112233")).toBe("resepsiyon@a.test");
  });

  it("yönetici telefonla çözülmez (yalnız e-posta ile girer)", async () => {
    expect(await cozum("05329998877")).toBeNull();
  });

  it("boş veya kayıtsız telefon eşleşmez; pasif personel çözülmez", async () => {
    expect(await cozum("")).toBeNull();
    expect(await cozum("05000000000")).toBeNull();
    await db.query("UPDATE public.kullanici SET aktif = false WHERE id = $1", [resepsiyon]);
    expect(await cozum("05321112233")).toBeNull();
    await db.query("UPDATE public.kullanici SET aktif = true WHERE id = $1", [resepsiyon]);
  });

  it("aynı numara iki kullanıcıda olamaz (işletmeler arası dahil)", async () => {
    const hata = await hataMesaji(() => kullaniciOlustur(db, { isletmeId: isletmeB, rol: "antrenor", telefon: "0 (532) 111-22-33" }));
    expect(hata).toMatch(/idx_kullanici_telefon_normalize|unique/i);
  });

  it("yönetici dışı rol telefonsuz oluşturulamaz", async () => {
    const id = "00000000-0000-4000-8000-0000000000aa";
    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'x@test')", [id]);
    const hata = await hataMesaji(() =>
      db.query("INSERT INTO public.kullanici (id, isletme_id, ad_soyad, rol) VALUES ($1, $2, 'Ali Veli', 'antrenor')", [id, isletmeA])
    );
    expect(hata).toMatch(/kullanici_personel_telefon_zorunlu/);
  });

  it("RPC anon ve authenticated rollerine kapalı (e-posta sızmaz)", async () => {
    for (const rol of ["anon", "authenticated"]) {
      const hata = await hataMesaji(async () => {
        await db.exec(`SET ROLE ${rol}`);
        try {
          await db.query("SELECT public.personel_giris_epostasi('05321112233')");
        } finally {
          await db.exec("RESET ROLE");
        }
      });
      expect(hata).toMatch(/permission denied/i);
    }
  });
});

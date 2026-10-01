import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

describe("pozisyon kataloğu: tohumlama, yetki, personel bağı", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let muhasebeA: string;
  let adminB: string;

  async function pozisyonId(isletme: string, ad: string) {
    return (await db.query<{ id: string }>("SELECT id FROM public.pozisyonlar WHERE isletme_id = $1 AND ad = $2", [isletme, ad])).rows[0].id;
  }

  async function guncelle(kullanici: string, id: string, set: string) {
    return kimlikle(db, kullanici, async () => (await db.query(`UPDATE public.pozisyonlar SET ${set} WHERE id = $1 RETURNING id`, [id])).rows.length);
  }

  beforeAll(async () => {
    db = await yeniVeritabani();
    isletmeA = await isletmeOlustur(db, "Salon A");
    isletmeB = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin" });
    resepsiyonA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
    muhasebeA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "muhasebe" });
    adminB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "isletme_admin" });
  }, 120_000);

  describe("katalog ve tohumlama", () => {
    it("her yeni işletme 6 departmanda 20 pozisyonla gelir; hepsi pasif ve sistem erişimi kapalı", async () => {
      const r = (await db.query<{ adet: string; grup: string; aktif: number; erisim: number }>(
        "SELECT count(*) AS adet, count(DISTINCT grup) AS grup, count(*) FILTER (WHERE aktif)::int AS aktif, count(*) FILTER (WHERE sistem_erisimi)::int AS erisim FROM public.pozisyonlar WHERE isletme_id = $1",
        [isletmeA]
      )).rows[0];
      expect({ adet: Number(r.adet), grup: Number(r.grup), aktif: r.aktif, erisim: r.erisim }).toEqual({ adet: 20, grup: 6, aktif: 0, erisim: 0 });
    });

    it("mevcut işletmeler için tamamlama fonksiyonu tekrar çalıştırılınca çift kayıt üretmez", async () => {
      await db.query("SELECT public.isletme_pozisyonlari_olustur($1)", [isletmeA]);
      expect(Number((await db.query<{ c: string }>("SELECT count(*) AS c FROM public.pozisyonlar WHERE isletme_id = $1", [isletmeA])).rows[0].c)).toBe(20);
    });

    it("unvan-rol eşlemesi: sahip/müdür yönetici, ön büro resepsiyon, eğitmenler antrenör, muhasebe/finans muhasebe", async () => {
      const harita = new Map((await db.query<{ ad: string; varsayilan_rol: string }>("SELECT ad, varsayilan_rol FROM public.pozisyonlar WHERE isletme_id = $1", [isletmeA])).rows.map((r) => [r.ad, r.varsayilan_rol]));
      expect(harita.get("İşletme Sahibi")).toBe("isletme_admin");
      expect(harita.get("Resepsiyon Sorumlusu")).toBe("resepsiyon");
      expect(harita.get("Personal Trainer (Bireysel Fitness Eğitmeni)")).toBe("antrenor");
      expect(harita.get("Muhasebe Sorumlusu")).toBe("muhasebe");
    });

    it("yönetici kendi işletmesinin pozisyonlarını görür, başkasınınkini görmez", async () => {
      const a = await kimlikle(db, adminA, async () => (await db.query("SELECT id FROM public.pozisyonlar")).rows.length);
      const b = await kimlikle(db, adminB, async () => (await db.query("SELECT DISTINCT isletme_id FROM public.pozisyonlar")).rows);
      expect(a).toBe(20);
      expect(b).toEqual([{ isletme_id: isletmeB }]);
    });

    it("şablon kataloğu okunur ama uygulamadan değiştirilemez", async () => {
      expect(await kimlikle(db, adminA, async () => (await db.query("SELECT id FROM public.pozisyon_sablonlari")).rows.length)).toBe(20);
      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("INSERT INTO public.pozisyon_sablonlari (ad, grup) VALUES ('X', 'Y')")))).toMatch(/permission denied/);
      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("UPDATE public.pozisyon_sablonlari SET grup = 'Z'")))).toMatch(/permission denied/);
    });
  });

  describe("yetki", () => {
    it("işletme yöneticisi pozisyonu açar/kapatır; resepsiyon ve muhasebe değiştiremez", async () => {
      const id = await pozisyonId(isletmeA, "Resepsiyon Sorumlusu");
      expect(await guncelle(adminA, id, "aktif = true, sistem_erisimi = true")).toBe(1);
      expect(await guncelle(resepsiyonA, id, "aktif = false")).toBe(0);
      expect(await guncelle(muhasebeA, id, "aktif = false")).toBe(0);
      expect((await db.query<{ aktif: boolean }>("SELECT aktif FROM public.pozisyonlar WHERE id = $1", [id])).rows[0].aktif).toBe(true);
    });

    it("başka işletmenin yöneticisi pozisyonu değiştiremez", async () => {
      const id = await pozisyonId(isletmeA, "Finans Uzmanı");
      expect(await guncelle(adminB, id, "aktif = true")).toBe(0);
    });

    it("pozisyon silinemez", async () => {
      const id = await pozisyonId(isletmeA, "Finans Uzmanı");
      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("DELETE FROM public.pozisyonlar WHERE id = $1", [id])))).toMatch(/permission denied/);
    });

    it("işletme değiştirilemez", async () => {
      const id = await pozisyonId(isletmeA, "Finans Uzmanı");
      expect(await hataMesaji(() => guncelle(adminA, id, `isletme_id = '${isletmeB}'`))).toMatch(/isletme_degistirilemez|row-level security/);
    });

    it("özel pozisyonu yalnız yönetici ekler; aynı ad ikinci kez eklenemez", async () => {
      const ekle = (kullanici: string, ad: string) =>
        kimlikle(db, kullanici, () => db.query("INSERT INTO public.pozisyonlar (isletme_id, ad, grup, varsayilan_rol, ucret_tipi, puantaj_modu, ozel_mi) VALUES ($1, $2, 'Yönetim Departmanı', 'isletme_admin', 'aylik_maas', 'esnek', true)", [isletmeA, ad]));
      await ekle(adminA, "Franchise Koordinatörü");
      const ozel = (await db.query<{ aktif: boolean; sistem_erisimi: boolean; ozel_mi: boolean; sira: number }>("SELECT aktif, sistem_erisimi, ozel_mi, sira FROM public.pozisyonlar WHERE ad = 'Franchise Koordinatörü'")).rows[0];
      expect(ozel).toEqual({ aktif: false, sistem_erisimi: false, ozel_mi: true, sira: 999 });
      expect(await hataMesaji(() => ekle(adminA, "Franchise Koordinatörü"))).toMatch(/duplicate key|unique/);
      expect(await hataMesaji(() => ekle(resepsiyonA, "Başka Unvan"))).toMatch(/row-level security/);
    });

    it("başka işletme adına pozisyon eklenemez", async () => {
      const hata = await hataMesaji(() =>
        kimlikle(db, adminA, () => db.query("INSERT INTO public.pozisyonlar (isletme_id, ad, grup) VALUES ($1, 'Sızma Unvanı', 'Yönetim Departmanı')", [isletmeB]))
      );
      expect(hata).toMatch(/row-level security/);
    });
  });

  describe("personel bağı", () => {
    let aktifPoz: string;
    let pasifPoz: string;
    let antrenorPoz: string;
    let personel: string;

    beforeAll(async () => {
      aktifPoz = await pozisyonId(isletmeA, "Resepsiyon Sorumlusu"); // yukarıda açıldı (resepsiyon rolü)
      pasifPoz = await pozisyonId(isletmeA, "Ön Büro Elemanı");
      antrenorPoz = await pozisyonId(isletmeA, "Salon Saha Eğitmeni");
      await guncelle(adminA, antrenorPoz, "aktif = true, sistem_erisimi = true");
      personel = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
    });

    const ata = (kullanici: string, hedef: string, poz: string | null) =>
      kimlikle(db, kullanici, async () => (await db.query("UPDATE public.kullanici SET pozisyon_id = $2 WHERE id = $1 RETURNING id", [hedef, poz])).rows.length);

    it("pasif veya erişimsiz pozisyon atanamaz", async () => {
      expect(await hataMesaji(() => ata(adminA, personel, pasifPoz))).toMatch(/pozisyon_atanamaz/);
      const yalnizAktif = await pozisyonId(isletmeA, "Müşteri İlişkileri ve Satış Danışmanı");
      await guncelle(adminA, yalnizAktif, "aktif = true");
      expect(await hataMesaji(() => ata(adminA, personel, yalnizAktif))).toMatch(/pozisyon_atanamaz/);
    });

    it("rolü pozisyonun varsayılan rolüyle uyuşmayan kullanıcıya atanamaz", async () => {
      expect(await hataMesaji(() => ata(adminA, personel, antrenorPoz))).toMatch(/pozisyon_rol_uyumsuz/);
    });

    it("uyumlu, aktif, erişimli pozisyon atanır", async () => {
      expect(await ata(adminA, personel, aktifPoz)).toBe(1);
    });

    it("kişi kendi pozisyonunu değiştiremez; resepsiyon başkasınınkini değiştiremez", async () => {
      const kendi = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
      expect(await hataMesaji(() => ata(kendi, kendi, aktifPoz))).toMatch(/yetki_yetersiz/);
      // Resepsiyon başkasının satırını RLS gereği hiç güncelleyemez (0 satır).
      expect(await ata(resepsiyonA, personel, null)).toBe(0);
      // Kişi kendi pozisyonunu boşaltamaz.
      await db.query("UPDATE public.kullanici SET pozisyon_id = $2 WHERE id = $1", [kendi, aktifPoz]);
      expect(await hataMesaji(() => ata(kendi, kendi, null))).toMatch(/yetki_yetersiz/);
    });

    it("başka işletmenin pozisyonu atanamaz", async () => {
      const b = await pozisyonId(isletmeB, "Resepsiyon Sorumlusu");
      expect(await hataMesaji(() => ata(adminA, personel, b))).toMatch(/foreign key|pozisyon_bulunamadi|row-level/);
    });

    it("bağlı aktif personeli olan pozisyon pasife veya erişimsize alınamaz; personel pasifse alınabilir", async () => {
      expect(await hataMesaji(() => guncelle(adminA, aktifPoz, "aktif = false"))).toMatch(/pozisyon_personel_bagli/);
      expect(await hataMesaji(() => guncelle(adminA, aktifPoz, "sistem_erisimi = false"))).toMatch(/pozisyon_personel_bagli/);
      await db.query("UPDATE public.kullanici SET aktif = false WHERE pozisyon_id = $1", [aktifPoz]);
      expect(await guncelle(adminA, aktifPoz, "aktif = false")).toBe(1);
    });

    it("hesap açılışı (servis rolü) da aynı kuralları uygular", async () => {
      const poz = await pozisyonId(isletmeA, "Muhasebe Sorumlusu"); // pasif
      const ekle = (rol: string, p: string) =>
        db.query("INSERT INTO auth.users (id) VALUES (gen_random_uuid())").then(async () => {
          const { rows } = await db.query<{ id: string }>("SELECT id FROM auth.users ORDER BY ctid DESC LIMIT 1");
          return db.query("INSERT INTO public.kullanici (id, isletme_id, ad_soyad, rol, pozisyon_id) VALUES ($1, $2, 'Yeni Kişi', $3, $4)", [rows[0].id, isletmeA, rol, p]);
        });
      expect(await hataMesaji(() => ekle("muhasebe", poz))).toMatch(/pozisyon_atanamaz/);
      await guncelle(adminA, poz, "aktif = true, sistem_erisimi = true");
      expect(await hataMesaji(() => ekle("resepsiyon", poz))).toMatch(/pozisyon_rol_uyumsuz/);
      expect(await hataMesaji(() => ekle("muhasebe", poz))).toBeNull();
    });
  });
});

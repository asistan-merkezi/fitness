import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bugunuSabitle, hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

// 2026-10-05 10:00 İstanbul = 07:00Z
const T = (saat: number, gun = 5) => `2026-10-${String(gun).padStart(2, "0")}T${String(saat - 3).padStart(2, "0")}:00:00Z`;

describe("müşteri talep ve öneriler: ders talebi, yorum, yetki, tenant izolasyonu", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let muhasebeA: string;
  let antrenor1: string;
  let adminB: string;
  let alan1: string;
  let musteri: string;
  let derslerDersId: string;

  async function talep(kullanici: string, m: string, tarih = "2026-10-10", saat: string | null = "18:00", antrenor: string | null = null, not: string | null = null) {
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ id: string }>("SELECT public.ders_talebi_olustur($1, $2::date, $3::time, $4, $5) AS id", [m, tarih, saat, antrenor, not]);
      return r.rows[0].id;
    });
  }

  async function yanitla(kullanici: string, id: string, durum: string) {
    return kimlikle(db, kullanici, async () => {
      await db.query("SELECT public.ders_talebi_yanitla($1, $2)", [id, durum]);
    });
  }

  async function yorum(kullanici: string, dersId: string, tur = "ders_yorumu", puan = 5, metin = "Çok memnun kaldı") {
    return kimlikle(db, kullanici, async () => {
      const r = await db.query<{ id: string }>("SELECT public.musteri_yorum_ekle($1, $2, $3, $4) AS id", [dersId, tur, puan, metin]);
      return r.rows[0].id;
    });
  }

  async function ders(m: string, baslangic: string) {
    return kimlikle(db, resepsiyonA, async () => {
      const r = await db.query<{ id: string }>("SELECT public.ders_seansi_olustur($1,$2,$3,$4::timestamptz,60,0,NULL,NULL) AS id", [m, antrenor1, alan1, baslangic]);
      return r.rows[0].id;
    });
  }

  async function durum(id: string, hedef: string) {
    return kimlikle(db, resepsiyonA, async () => {
      await db.query("SELECT public.ders_seansi_durum($1,$2,NULL)", [id, hedef]);
    });
  }

  beforeAll(async () => {
    db = await yeniVeritabani();
    await bugunuSabitle(db, "2026-10-01");
    isletmeA = await isletmeOlustur(db, "Salon A");
    isletmeB = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin" });
    resepsiyonA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
    muhasebeA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "muhasebe" });
    antrenor1 = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor" });
    adminB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "isletme_admin" });
    alan1 = await kimlikle(db, adminA, async () => (await db.query<{ id: string }>("INSERT INTO public.alan_studyo (isletme_id, ad) VALUES ($1,'Stüdyo 1') RETURNING id", [isletmeA])).rows[0].id);
    musteri = await kimlikle(db, resepsiyonA, async () => {
      const r = await db.query<{ id: string }>("SELECT public.musteri_olustur(p_ad_soyad => 'Müşteri Bir', p_telefon => '+905320000000', p_onamlar => '[{\"tur\":\"kvkk_aydinlatma\",\"verildi\":true,\"metin_versiyonu\":\"v1\"}]'::jsonb) AS id");
      return r.rows[0].id;
    });
    derslerDersId = await ders(musteri, T(10));
  }, 120_000);

  describe("ders talebi", () => {
    it("resepsiyon talep açar; durum 'bekliyor', işletme ve müşteri bağlanır", async () => {
      const id = await talep(resepsiyonA, musteri, "2026-10-10", "18:00", antrenor1, "  Akşam olsun  ");
      const s = (await db.query<{ durum: string; isletme_id: string; musteri_id: string; not_metni: string; yanit_tarihi: string | null }>("SELECT * FROM public.musteri_ders_talebi WHERE id = $1", [id])).rows[0];
      expect(s).toMatchObject({ durum: "bekliyor", isletme_id: isletmeA, musteri_id: musteri, not_metni: "Akşam olsun", yanit_tarihi: null });
    });

    it("saat ve antrenör opsiyoneldir", async () => {
      expect(await talep(resepsiyonA, musteri, "2026-10-12", null, null, null)).toBeTruthy();
    });

    it("geçmiş tarih reddedilir; bugün kabul edilir", async () => {
      expect(await hataMesaji(() => talep(resepsiyonA, musteri, "2026-09-30"))).toMatch(/gecmis_tarih/);
      expect(await talep(resepsiyonA, musteri, "2026-10-01")).toBeTruthy();
    });

    it("başka işletmenin antrenörü veya müşteri dışı kimlik reddedilir", async () => {
      const antrenorB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "antrenor" });
      expect(await hataMesaji(() => talep(resepsiyonA, musteri, "2026-10-10", null, antrenorB))).toMatch(/antrenor_bulunamadi/);
      expect(await hataMesaji(() => talep(adminB, musteri))).toMatch(/musteri_bulunamadi/);
    });

    it("pasif müşteri için talep açılamaz", async () => {
      const pasif = await kimlikle(db, resepsiyonA, async () => {
        const r = await db.query<{ id: string }>("SELECT public.musteri_olustur(p_ad_soyad => 'Pasif Kişi', p_telefon => '+905320000001', p_onamlar => '[{\"tur\":\"kvkk_aydinlatma\",\"verildi\":true,\"metin_versiyonu\":\"v1\"}]'::jsonb) AS id");
        return r.rows[0].id;
      });
      await db.query("UPDATE public.musteri SET aktif = false WHERE id = $1", [pasif]);
      expect(await hataMesaji(() => talep(resepsiyonA, pasif))).toMatch(/musteri_bulunamadi/);
    });

    it("muhasebe ve antrenör talep açamaz / yanıtlayamaz", async () => {
      expect(await hataMesaji(() => talep(muhasebeA, musteri))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => talep(antrenor1, musteri))).toMatch(/yetki_yetersiz/);
      const id = await talep(resepsiyonA, musteri);
      expect(await hataMesaji(() => yanitla(muhasebeA, id, "reddedildi"))).toMatch(/yetki_yetersiz/);
    });

    it("yanıt: planlandı/reddedildi; ikinci kez yanıtlanamaz; geçersiz durum reddedilir", async () => {
      const id = await talep(resepsiyonA, musteri);
      expect(await hataMesaji(() => yanitla(resepsiyonA, id, "onaylandi"))).toMatch(/gecersiz_durum/);
      await yanitla(resepsiyonA, id, "planlandi");
      const s = (await db.query<{ durum: string; yanit_kullanici_id: string; yanit_tarihi: string | null }>("SELECT durum, yanit_kullanici_id, yanit_tarihi FROM public.musteri_ders_talebi WHERE id = $1", [id])).rows[0];
      expect(s.durum).toBe("planlandi");
      expect(s.yanit_kullanici_id).toBe(resepsiyonA);
      expect(s.yanit_tarihi).not.toBeNull();
      expect(await hataMesaji(() => yanitla(resepsiyonA, id, "reddedildi"))).toMatch(/talep_bulunamadi/);
    });

    it("başka işletmenin talebi yanıtlanamaz ve görülemez", async () => {
      const id = await talep(resepsiyonA, musteri);
      expect(await hataMesaji(() => yanitla(adminB, id, "reddedildi"))).toMatch(/talep_bulunamadi/);
      const gorulen = await kimlikle(db, adminB, async () => (await db.query("SELECT id FROM public.musteri_ders_talebi")).rows.length);
      expect(gorulen).toBe(0);
    });

    it("doğrudan yazma yolu yok (tablo yazma yetkisi verilmez)", async () => {
      const hata = await hataMesaji(() =>
        kimlikle(db, adminA, () => db.query("INSERT INTO public.musteri_ders_talebi (isletme_id, musteri_id, tercih_tarih) VALUES ($1, $2, '2026-10-10')", [isletmeA, musteri]))
      );
      expect(hata).toMatch(/permission denied/);
    });

    it("muhasebe talepleri okuyamaz; antrenör yalnız KENDİNE yönlendirilenleri okur, başkasınınkini ve yönlendirilmemişi görmez", async () => {
      expect(await kimlikle(db, muhasebeA, async () => (await db.query("SELECT id FROM public.musteri_ders_talebi")).rows.length)).toBe(0);
      const antrenor2 = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor" });
      const kendine = await talep(resepsiyonA, musteri, "2026-10-10", "18:00", antrenor2);
      await talep(resepsiyonA, musteri, "2026-10-10", null, null);
      const gorulen = await kimlikle(db, antrenor2, async () => (await db.query<{ id: string; antrenor_id: string }>("SELECT id, antrenor_id FROM public.musteri_ders_talebi")).rows);
      expect(gorulen.map((r) => r.id)).toEqual([kendine]);
      expect(gorulen.every((r) => r.antrenor_id === antrenor2)).toBe(true);
      // antrenor1'e yönlendirilmiş talepler antrenor2'ye görünmez; antrenor1 yalnız kendininkileri görür.
      const a1 = await kimlikle(db, antrenor1, async () => (await db.query<{ antrenor_id: string }>("SELECT antrenor_id FROM public.musteri_ders_talebi")).rows);
      expect(a1.length).toBeGreaterThan(0);
      expect(a1.every((r) => r.antrenor_id === antrenor1)).toBe(true);
    });
  });

  describe("antrenör / ders yorumu", () => {
    it("katılınmamış (planlandı) derse yorum yazılamaz", async () => {
      expect(await hataMesaji(() => yorum(resepsiyonA, derslerDersId))).toMatch(/yorum_icin_katilim_gerekli/);
    });

    it("katılınan derste yorum kaydedilir; müşteri ve işletme dersten türetilir", async () => {
      await durum(derslerDersId, "tamamlandi");
      const id = await yorum(resepsiyonA, derslerDersId, "antrenor_yorumu", 4, "  Hoca çok ilgiliydi  ");
      const s = (await db.query<{ musteri_id: string; isletme_id: string; puan: number; yorum: string; tur: string; olusturan_kullanici_id: string }>("SELECT * FROM public.musteri_yorum WHERE id = $1", [id])).rows[0];
      expect(s).toMatchObject({ musteri_id: musteri, isletme_id: isletmeA, puan: 4, yorum: "Hoca çok ilgiliydi", tur: "antrenor_yorumu", olusturan_kullanici_id: resepsiyonA });
    });

    it("puan 1-5, tür ve metin doğrulanır", async () => {
      expect(await hataMesaji(() => yorum(resepsiyonA, derslerDersId, "ders_yorumu", 0))).toMatch(/puan_gecersiz/);
      expect(await hataMesaji(() => yorum(resepsiyonA, derslerDersId, "ders_yorumu", 6))).toMatch(/puan_gecersiz/);
      expect(await hataMesaji(() => yorum(resepsiyonA, derslerDersId, "baska_tur", 3))).toMatch(/yorum_turu_gecersiz/);
      expect(await hataMesaji(() => yorum(resepsiyonA, derslerDersId, "ders_yorumu", 3, "   "))).toMatch(/yorum_gerekli/);
    });

    it("başka işletmenin dersine yorum yazılamaz; muhasebe/antrenör yazamaz", async () => {
      expect(await hataMesaji(() => yorum(adminB, derslerDersId))).toMatch(/ders_bulunamadi/);
      expect(await hataMesaji(() => yorum(muhasebeA, derslerDersId))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => yorum(antrenor1, derslerDersId))).toMatch(/yetki_yetersiz/);
    });

    it("yorumlar değiştirilemez ve silinemez; başka işletme göremez", async () => {
      const guncelle = await hataMesaji(() => kimlikle(db, adminA, () => db.query("UPDATE public.musteri_yorum SET puan = 1")));
      const sil = await hataMesaji(() => kimlikle(db, adminA, () => db.query("DELETE FROM public.musteri_yorum")));
      expect(guncelle).toMatch(/permission denied/);
      expect(sil).toMatch(/permission denied/);
      expect(await kimlikle(db, adminB, async () => (await db.query("SELECT id FROM public.musteri_yorum")).rows.length)).toBe(0);
      expect(await kimlikle(db, resepsiyonA, async () => (await db.query("SELECT id FROM public.musteri_yorum")).rows.length)).toBeGreaterThan(0);
    });
  });
});

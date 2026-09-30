import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bugunuSabitle, hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

type Hesap = {
  kullanici_id: string;
  calisilan_gun: number;
  toplam_gun: number;
  taban_kurus: string;
  ders_sayisi: number;
  prim_kurus: string;
  toplam_kurus: string;
  kapali: boolean;
};

// İstanbul yerel saatini UTC ISO'ya çevirir (+03): "2026-09-05", 10, 0 -> 2026-09-05T07:00:00Z
const Z = (tarih: string, saat: number, dk = 0) => {
  const [y, a, g] = tarih.split("-").map(Number);
  return new Date(Date.UTC(y, a - 1, g, saat - 3, dk)).toISOString();
};

describe("personel hakediş: profil, gün oranı, ders primi, dönem kapatma, defter, yetki", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let muhasebeA: string;
  let adminB: string;
  let antrenorTam: string; // tam ay
  let antrenorGiris: string; // 16 Eylül'de işe girdi
  let antrenorCikis: string; // 10 Eylül'de ayrıldı
  let alan: string;
  let musteri: string;

  const hesapla = (k: string, ay = "2026-09-01") =>
    kimlikle(db, k, async () => (await db.query<Hesap>("SELECT * FROM public.personel_hakedis_hesapla($1::date)", [ay])).rows);
  const satir = (rows: Hesap[], k: string) => rows.find((r) => r.kullanici_id === k);

  async function profil(k: string, o: { maas?: number; prim?: number; giris?: string | null; cikis?: string | null }) {
    return kimlikle(db, adminA, () =>
      db.query("INSERT INTO public.personel_profil (kullanici_id, isletme_id, maas_kurus, ders_prim_kurus, ise_giris_tarihi, isten_cikis_tarihi) VALUES ($1,$2,$3,$4,$5,$6)", [
        k,
        isletmeA,
        o.maas ?? 0,
        o.prim ?? 0,
        o.giris ?? null,
        o.cikis ?? null,
      ])
    );
  }

  async function tamamlananDers(antrenor: string, baslangic: string) {
    const id = await kimlikle(db, resepsiyonA, async () => {
      const r = await db.query<{ id: string }>("SELECT public.ders_seansi_olustur($1,$2,$3,$4::timestamptz,60,0,NULL,NULL) AS id", [musteri, antrenor, alan, baslangic]);
      return r.rows[0].id;
    });
    await kimlikle(db, resepsiyonA, () => db.query("SELECT public.ders_seansi_durum($1,'tamamlandi',NULL)", [id]));
    return id;
  }

  beforeAll(async () => {
    db = await yeniVeritabani();
    await bugunuSabitle(db, "2026-10-15");
    isletmeA = await isletmeOlustur(db, "Salon A");
    isletmeB = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin" });
    resepsiyonA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
    muhasebeA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "muhasebe" });
    adminB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "isletme_admin" });
    antrenorTam = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor", adSoyad: "Tam Ay" });
    antrenorGiris = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor", adSoyad: "Geç Giren" });
    antrenorCikis = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor", adSoyad: "Erken Çıkan" });

    alan = await kimlikle(db, adminA, async () => (await db.query<{ id: string }>("INSERT INTO public.alan_studyo (isletme_id, ad) VALUES ($1,'Stüdyo') RETURNING id", [isletmeA])).rows[0].id);
    musteri = await kimlikle(db, resepsiyonA, async () => {
      const r = await db.query<{ id: string }>(
        "SELECT public.musteri_olustur(p_ad_soyad => 'Ders Müşterisi', p_telefon => '+905320000000', p_onamlar => '[{\"tur\":\"kvkk_aydinlatma\",\"verildi\":true,\"metin_versiyonu\":\"v1\"}]'::jsonb) AS id"
      );
      return r.rows[0].id;
    });

    await profil(antrenorTam, { maas: 3_000_000, prim: 50_000 });
    await profil(antrenorGiris, { maas: 3_000_000, prim: 50_000, giris: "2026-09-16" });
    await profil(antrenorCikis, { maas: 3_000_000, prim: 50_000, cikis: "2026-09-10" });

    // Tam ay antrenörü: Eylül'de 3 + ay sonu gece dersi sayılır; Ağustos sonu gece dersi sayılmaz.
    await tamamlananDers(antrenorTam, Z("2026-09-05", 10));
    await tamamlananDers(antrenorTam, Z("2026-09-05", 11));
    await tamamlananDers(antrenorTam, Z("2026-09-05", 12));
    await tamamlananDers(antrenorTam, Z("2026-09-30", 23, 30)); // İstanbul 30 Eylül 23:30 -> Eylül
    await tamamlananDers(antrenorTam, Z("2026-08-31", 23, 30)); // İstanbul 31 Ağustos 23:30 -> Ağustos
    // Sayılmayanlar: planlı ve iptal.
    await kimlikle(db, resepsiyonA, () => db.query("SELECT public.ders_seansi_olustur($1,$2,$3,$4::timestamptz,60,0,NULL,NULL)", [musteri, antrenorTam, alan, Z("2026-09-06", 10)]));
    const iptal = await kimlikle(db, resepsiyonA, async () => (await db.query<{ id: string }>("SELECT public.ders_seansi_olustur($1,$2,$3,$4::timestamptz,60,0,NULL,NULL) AS id", [musteri, antrenorTam, alan, Z("2026-09-07", 10)])).rows[0].id);
    await kimlikle(db, resepsiyonA, () => db.query("SELECT public.ders_seansi_durum($1,'iptal',NULL)", [iptal]));

    // Geç giren: girişten önceki ders (15 Eylül) sayılmaz, sonraki (16 Eylül) sayılır.
    await tamamlananDers(antrenorGiris, Z("2026-09-15", 10));
    await tamamlananDers(antrenorGiris, Z("2026-09-16", 10));

    // Çıkan: çıkış günü (10 Eylül) DAHİL sayılır, sonrası sayılmaz.
    await tamamlananDers(antrenorCikis, Z("2026-09-09", 10));
    await tamamlananDers(antrenorCikis, Z("2026-09-10", 23, 0));
    await tamamlananDers(antrenorCikis, Z("2026-09-11", 10));
  }, 120_000);

  describe("hesap", () => {
    it("tam ay: sabit maaş + tamamlanan ders primi; ay sınırları İstanbul saatine göre", async () => {
      const r = satir(await hesapla(adminA), antrenorTam)!;
      expect(r).toMatchObject({ calisilan_gun: 30, toplam_gun: 30, ders_sayisi: 4, kapali: false });
      expect(Number(r.taban_kurus)).toBe(3_000_000);
      expect(Number(r.prim_kurus)).toBe(200_000);
      expect(Number(r.toplam_kurus)).toBe(3_200_000);
    });

    it("işe giriş ayın ortasındaysa maaş gün oranlı; girişten önceki ders sayılmaz", async () => {
      const r = satir(await hesapla(adminA), antrenorGiris)!;
      expect(r).toMatchObject({ calisilan_gun: 15, toplam_gun: 30, ders_sayisi: 1 });
      expect(Number(r.taban_kurus)).toBe(1_500_000);
      expect(Number(r.prim_kurus)).toBe(50_000);
    });

    it("işten çıkış günü dahil çalışılır; çıkıştan sonraki dersler hakedişe girmez", async () => {
      const r = satir(await hesapla(adminA), antrenorCikis)!;
      expect(r).toMatchObject({ calisilan_gun: 10, toplam_gun: 30, ders_sayisi: 2 });
      expect(Number(r.taban_kurus)).toBe(1_000_000);
      expect(Number(r.prim_kurus)).toBe(100_000);
    });

    it("henüz işe girmemiş personel o ay listede görünmez; Ağustos'ta yalnız ay sonu gece dersi sayılır", async () => {
      const agustos = await hesapla(adminA, "2026-08-01");
      expect(satir(agustos, antrenorGiris)).toBeUndefined(); // 16 Eylül'de girdi: Ağustos'ta çalışmadı ve dersi yok
      expect(satir(agustos, antrenorTam)).toMatchObject({ ders_sayisi: 1 });
      expect(satir(agustos, antrenorCikis)).toMatchObject({ ders_sayisi: 0, calisilan_gun: 31 });
    });

    it("muhasebe hesabı görür; resepsiyon göremez; başka işletme kendi personelini görür", async () => {
      expect((await hesapla(muhasebeA)).length).toBe(3);
      expect(await hataMesaji(() => hesapla(resepsiyonA))).toMatch(/yetki_yetersiz/);
      expect(await hesapla(adminB)).toEqual([]);
    });
  });

  describe("dönem kapatma ve defter", () => {
    it("devam eden veya gelecek dönem kapatılamaz; yalnız yönetici kapatır", async () => {
      const kapat = (k: string, ay: string) => kimlikle(db, k, async () => (await db.query<{ n: number }>("SELECT public.personel_donem_kapat($1::date) AS n", [ay])).rows[0].n);
      expect(await hataMesaji(() => kapat(adminA, "2026-10-01"))).toMatch(/donem_bitmedi/);
      expect(await hataMesaji(() => kapat(adminA, "2026-11-01"))).toMatch(/donem_bitmedi/);
      expect(await hataMesaji(() => kapat(muhasebeA, "2026-09-01"))).toMatch(/yetki_yetersiz/);
    });

    it("kapatma hakediş ve prim satırlarını yazar; tekrar çağrı çift kayıt üretmez; kapalı dönem değişmez", async () => {
      const kapat = () => kimlikle(db, adminA, async () => (await db.query<{ n: number }>("SELECT public.personel_donem_kapat('2026-09-15'::date) AS n")).rows[0].n);
      expect(await kapat()).toBe(6); // 3 personel × (hakediş + prim)
      expect(await kapat()).toBe(0);

      const satirlar = (await db.query<{ tur: string; c: string }>("SELECT tur, count(*) AS c FROM public.personel_hesap_hareket GROUP BY tur ORDER BY tur")).rows;
      expect(satirlar.map((x) => [x.tur, Number(x.c)])).toEqual([
        ["hakedis", 3],
        ["prim", 3],
      ]);

      // Kapanıştan sonra yeni bir Eylül dersi tamamlansa da kapalı tutar değişmez.
      await tamamlananDers(antrenorTam, Z("2026-09-20", 10));
      const r = satir(await hesapla(adminA), antrenorTam)!;
      expect(r.kapali).toBe(true);
      expect(Number(r.prim_kurus)).toBe(200_000);
      expect(Number(r.toplam_kurus)).toBe(3_200_000);
    });

    it("defter değişmez: güncelleme/silme reddedilir, kullanıcılar doğrudan yazamaz", async () => {
      expect(await hataMesaji(() => db.query("UPDATE public.personel_hesap_hareket SET tutar_kurus = 1"))).toMatch(/defter_degismez/);
      expect(await hataMesaji(() => db.query("DELETE FROM public.personel_hesap_hareket"))).toMatch(/defter_degismez/);
      const hata = await hataMesaji(() =>
        kimlikle(db, adminA, () => db.query("INSERT INTO public.personel_hesap_hareket (isletme_id, kullanici_id, tur, tutar_kurus, donem) VALUES ($1,$2,'hakedis',1,'2026-08-01')", [isletmeA, antrenorTam]))
      );
      expect(hata).toMatch(/permission denied/i);
    });

    it("ödeme ve avans bakiyeyi düşürür; aynı anahtar çift kayıt açmaz; geçersiz girdi reddedilir", async () => {
      const ekle = (k: string, tur: string, tutar: number, yontem: string | null, anahtar: string | null = null) =>
        kimlikle(db, k, async () => (await db.query<{ id: string }>("SELECT public.personel_hesap_hareket_ekle($1,$2,$3,$4,NULL,$5) AS id", [antrenorTam, tur, tutar, yontem, anahtar])).rows[0].id);
      const anahtar = "22222222-2222-4222-8222-222222222222";

      const a = await ekle(muhasebeA, "odeme", 1_000_000, "havale", anahtar);
      expect(await ekle(muhasebeA, "odeme", 1_000_000, "havale", anahtar)).toBe(a);
      await ekle(adminA, "avans", 200_000, "nakit");

      const bakiye = await kimlikle(db, adminA, async () => (await db.query<{ bakiye_kurus: string; hak_edilen_kurus: string; odenen_kurus: string }>("SELECT * FROM public.personel_bakiye WHERE kullanici_id = $1", [antrenorTam])).rows[0]);
      expect(Number(bakiye.hak_edilen_kurus)).toBe(3_200_000);
      expect(Number(bakiye.odenen_kurus)).toBe(1_200_000);
      expect(Number(bakiye.bakiye_kurus)).toBe(2_000_000);

      expect(await hataMesaji(() => ekle(adminA, "hakedis", 100, "nakit"))).toMatch(/hareket_turu_gecersiz/);
      expect(await hataMesaji(() => ekle(adminA, "odeme", 0, "nakit"))).toMatch(/tutar_gecersiz/);
      expect(await hataMesaji(() => ekle(adminA, "odeme", 100, null))).toMatch(/odeme_yontemi_gerekli/);
      expect(await hataMesaji(() => ekle(resepsiyonA, "odeme", 100, "nakit"))).toMatch(/yetki_yetersiz/);
    });
  });

  describe("görünürlük ve profil yetkisi", () => {
    it("personel yalnız KENDİ profilini ve defter satırlarını görür; başkasınınkini ve resepsiyon hiçbirini göremez", async () => {
      const profiller = (k: string) => kimlikle(db, k, async () => (await db.query<{ kullanici_id: string }>("SELECT kullanici_id FROM public.personel_profil")).rows.map((r) => r.kullanici_id));
      const defter = (k: string) => kimlikle(db, k, async () => (await db.query<{ kullanici_id: string }>("SELECT DISTINCT kullanici_id FROM public.personel_hesap_hareket")).rows.map((r) => r.kullanici_id));

      expect(await profiller(antrenorTam)).toEqual([antrenorTam]);
      expect(await defter(antrenorTam)).toEqual([antrenorTam]);
      expect(await defter(antrenorGiris)).toEqual([antrenorGiris]);
      expect(await profiller(resepsiyonA)).toEqual([]);
      expect(await defter(resepsiyonA)).toEqual([]);
      expect((await profiller(muhasebeA)).length).toBe(3);
      expect(await profiller(adminB)).toEqual([]);
    });

    it("yalnız işletme yöneticisi profil yazar; personel kendi maaşını değiştiremez", async () => {
      const guncelle = (k: string) => kimlikle(db, k, async () => (await db.query("UPDATE public.personel_profil SET maas_kurus = 9 WHERE kullanici_id = $1 RETURNING kullanici_id", [antrenorTam])).rows.length);
      expect(await guncelle(antrenorTam)).toBe(0);
      expect(await guncelle(muhasebeA)).toBe(0);
      expect(await guncelle(adminB)).toBe(0);
      expect(await guncelle(adminA)).toBe(1);
      await kimlikle(db, adminA, () => db.query("UPDATE public.personel_profil SET maas_kurus = 3000000 WHERE kullanici_id = $1", [antrenorTam]));
    });

    it("işten çıkış tarihi işe girişten önce olamaz; negatif maaş/prim reddedilir", async () => {
      const hata = (sql: string) => hataMesaji(() => kimlikle(db, adminA, () => db.query(sql, [antrenorTam])));
      expect(await hata("UPDATE public.personel_profil SET ise_giris_tarihi = '2026-09-10', isten_cikis_tarihi = '2026-09-01' WHERE kullanici_id = $1")).toMatch(/profil_tarih_kurali/);
      expect(await hata("UPDATE public.personel_profil SET maas_kurus = -1 WHERE kullanici_id = $1")).toMatch(/check/i);
    });

    it("audit_log maaş değerini değil, yalnız değişen alan adını tutar", async () => {
      const r = await db.query<{ degisen_alanlar: string[] }>("SELECT degisen_alanlar FROM public.audit_log WHERE tablo = 'personel_profil' AND islem = 'UPDATE' AND degisen_alanlar @> ARRAY['maas_kurus'] LIMIT 1");
      expect(r.rows.length).toBe(1);
      expect(JSON.stringify(r.rows[0])).not.toMatch(/3000000/);
    });
  });
});

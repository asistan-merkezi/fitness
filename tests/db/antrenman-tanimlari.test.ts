import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

describe("antrenman tanımları: kaydetme RPC'si, toplam süre, yetki ve izolasyon", () => {
  let db: PGlite;
  let isletmeA: string;
  let adminA: string;
  let antrenorA: string;
  let adminB: string;

  const kaydet = (kullanici: string, id: string | null, ad: string, adimlar: unknown[]) =>
    kimlikle(db, kullanici, async () => (await db.query<{ id: string }>("SELECT public.antrenman_tanimi_kaydet($1, $2, $3, $4::jsonb) AS id", [id, ad, null, JSON.stringify(adimlar)])).rows[0].id);

  const adimlari = (id: string) =>
    db.query<{ id: string; ad: string; sira: number; sure_dakika: number | null }>("SELECT id, ad, sira, sure_dakika FROM public.antrenman_program_sablonu_adimi WHERE sablon_id = $1 ORDER BY sira", [id]).then((r) => r.rows);
  const toplam = async (id: string) => (await db.query<{ sure_dakika: number | null }>("SELECT sure_dakika FROM public.antrenman_program_sablonu WHERE id = $1", [id])).rows[0].sure_dakika;

  beforeAll(async () => {
    db = await yeniVeritabani();
    isletmeA = await isletmeOlustur(db, "Salon A");
    const isletmeB = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin" });
    antrenorA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "antrenor" });
    adminB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "isletme_admin" });
  }, 120_000);

  it("oluşturur; adımlar sırayla yazılır, toplam süre adımların toplamıdır", async () => {
    const id = await kaydet(adminA, null, "Göğüs Günü", [
      { ad: "Bench Press", ekipman: "Bar", set_sayisi: "4", tekrar: "8-12", sure_dakika: "15" },
      { ad: "Şınav", sure_dakika: "10" },
      { ad: "Plank" },
    ]);
    const a = await adimlari(id);
    expect(a.map((x) => [x.ad, x.sira])).toEqual([["Bench Press", 1], ["Şınav", 2], ["Plank", 3]]);
    expect(await toplam(id)).toBe(25);
  });

  it("günceller: id'li adım değişir, id'siz eklenir, gönderilmeyen silinir; toplam yenilenir", async () => {
    const id = await kaydet(adminA, null, "Bacak Günü", [{ ad: "Squat", sure_dakika: "20" }, { ad: "Lunge", sure_dakika: "10" }]);
    const [squat] = await adimlari(id);
    await kaydet(adminA, id, "Bacak Günü Yeni", [{ id: squat.id, ad: "Squat", sure_dakika: "30" }, { ad: "Leg Press", sure_dakika: "5" }]);
    const a = await adimlari(id);
    expect(a.map((x) => x.ad)).toEqual(["Squat", "Leg Press"]);
    expect(a[0].id).toBe(squat.id);
    expect(await toplam(id)).toBe(35);
  });

  it("aynı ad ikinci kez açılamaz; boş adım listesi ve kısa ad reddedilir", async () => {
    await kaydet(adminA, null, "Tekil Antrenman", [{ ad: "Kürek" }]);
    expect(await hataMesaji(() => kaydet(adminA, null, "Tekil Antrenman", [{ ad: "Kürek" }]))).toMatch(/antrenman_adi_mevcut/);
    expect(await hataMesaji(() => kaydet(adminA, null, "Boş Antrenman", []))).toMatch(/adim_gerekli/);
    expect(await hataMesaji(() => kaydet(adminA, null, "X", [{ ad: "Kürek" }]))).toMatch(/adim_gecersiz/);
    expect(await hataMesaji(() => kaydet(adminA, null, "Kısa Adım", [{ ad: "K" }]))).toMatch(/adim_gecersiz/);
  });

  it("yalnız işletme yöneticisi yazar; antrenör okur ama RPC'yi ve doğrudan yazmayı yapamaz", async () => {
    expect(await hataMesaji(() => kaydet(antrenorA, null, "Yetkisiz", [{ ad: "Kürek" }]))).toMatch(/yetki_yetersiz/);
    const gorulen = await kimlikle(db, antrenorA, async () => (await db.query("SELECT id FROM public.antrenman_program_sablonu")).rows.length);
    expect(gorulen).toBeGreaterThan(0);
    expect(await hataMesaji(() => kimlikle(db, antrenorA, () => db.query("INSERT INTO public.antrenman_program_sablonu (isletme_id, ad) VALUES ($1, 'Doğrudan')", [isletmeA])))).toMatch(/permission denied|row-level security/);
    expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("UPDATE public.antrenman_program_sablonu SET sure_dakika = 999")))).toMatch(/permission denied/);
    expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("DELETE FROM public.antrenman_program_sablonu_adimi")))).toMatch(/permission denied/);
  });

  it("yönetici aktifliği doğrudan değiştirebilir", async () => {
    const id = await kaydet(adminA, null, "Pasif Olacak", [{ ad: "Kürek" }]);
    const n = await kimlikle(db, adminA, async () => (await db.query("UPDATE public.antrenman_program_sablonu SET aktif = false WHERE id = $1 RETURNING id", [id])).rows.length);
    expect(n).toBe(1);
  });

  it("başka işletme göremez ve güncelleyemez", async () => {
    const id = await kaydet(adminA, null, "Salon A Özel", [{ ad: "Kürek" }]);
    const b = await kimlikle(db, adminB, async () => (await db.query("SELECT id FROM public.antrenman_program_sablonu WHERE id = $1", [id])).rows.length);
    expect(b).toBe(0);
    expect(await hataMesaji(() => kaydet(adminB, id, "Çalındı", [{ ad: "Kürek" }]))).toMatch(/antrenman_bulunamadi/);
  });

  it("egzersiz kütüphanesi: yönetici ekler, aynı ad çakışır, antrenör ekleyemez, başka işletme görmez", async () => {
    await kimlikle(db, adminA, () => db.query("INSERT INTO public.egzersiz_kutuphanesi (isletme_id, ad, ekipman, sure_dakika) VALUES ($1, 'Bench Press', 'Bar', 15)", [isletmeA]));
    expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("INSERT INTO public.egzersiz_kutuphanesi (isletme_id, ad) VALUES ($1, 'Bench Press')", [isletmeA])))).toMatch(/unique|duplicate/);
    expect(await hataMesaji(() => kimlikle(db, antrenorA, () => db.query("INSERT INTO public.egzersiz_kutuphanesi (isletme_id, ad) VALUES ($1, 'Squat')", [isletmeA])))).toMatch(/row-level security/);
    expect(await kimlikle(db, adminB, async () => (await db.query("SELECT id FROM public.egzersiz_kutuphanesi")).rows.length)).toBe(0);
  });
});

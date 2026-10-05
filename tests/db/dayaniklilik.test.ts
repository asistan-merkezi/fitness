import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { bugunuSabitle, hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

describe("uzun vade dayanıklılık", () => {
  let db: PGlite;
  let isletme: string;
  let admin: string;
  let resepsiyon: string;

  beforeAll(async () => {
    db = await yeniVeritabani();
    isletme = await isletmeOlustur(db);
    admin = await kullaniciOlustur(db, { isletmeId: isletme, rol: "isletme_admin" });
    resepsiyon = await kullaniciOlustur(db, { isletmeId: isletme, rol: "resepsiyon" });
  }, 120_000);

  it("cron aksadıysa DEFAULT bölüme düşen satırlar, ay bölümü açılırken taşınır", async () => {
    await db.query(
      "INSERT INTO public.audit_log (isletme_id, tablo, islem, created_at) VALUES ($1, 'deneme', 'INSERT', '2031-03-15T10:00:00+03:00')",
      [isletme]
    );
    const once = await db.query<{ bolum: string }>("SELECT tableoid::regclass::text AS bolum FROM public.audit_log WHERE tablo = 'deneme'");
    expect(once.rows[0].bolum).toMatch(/audit_log_varsayilan/);

    const ad = await db.query<{ ad: string }>("SELECT public.audit_log_bolum_olustur(DATE '2031-03-01') AS ad");
    expect(ad.rows[0].ad).toBe("audit_log_y2031m03");

    const sonra = await db.query<{ bolum: string }>("SELECT tableoid::regclass::text AS bolum FROM public.audit_log WHERE tablo = 'deneme'");
    expect(sonra.rows).toHaveLength(1);
    expect(sonra.rows[0].bolum).toMatch(/audit_log_y2031m03/);

    // Yeni satırlar artık doğrudan bölüme gider; tekrar çağrı zararsızdır.
    await db.query("INSERT INTO public.audit_log (isletme_id, tablo, islem, created_at) VALUES ($1, 'deneme2', 'INSERT', '2031-03-20T10:00:00+03:00')", [isletme]);
    expect((await db.query<{ ad: string }>("SELECT public.audit_log_bolum_olustur(DATE '2031-03-01') AS ad")).rows[0].ad).toBe("audit_log_y2031m03");
  });

  it("kullanici: uygulamanın yazdığı kolonlar güncellenir, kimlik kolonları güncellenemez", async () => {
    await kimlikle(db, resepsiyon, () => db.query("UPDATE public.kullanici SET ad_soyad = 'Yeni Ad' WHERE id = $1", [resepsiyon]));
    await kimlikle(db, admin, () => db.query("UPDATE public.kullanici SET aktif = false WHERE id = $1", [resepsiyon]));
    const h = await kimlikle(db, admin, () =>
      hataMesaji(() => db.query("UPDATE public.kullanici SET created_at = now() - interval '1 year' WHERE id = $1", [resepsiyon]))
    );
    expect(h).toMatch(/permission denied/);
  });

  it("saklama süresi: yalnız sınırdan eski AY bölümleri kaldırılır; 12 aydan kısa süre reddedilir", async () => {
    await bugunuSabitle(db, "2033-06-15");
    for (const ay of ["2031-04-01", "2031-05-01", "2031-06-01", "2032-06-01"]) await db.query("SELECT public.audit_log_bolum_olustur($1::date)", [ay]);
    await db.query("INSERT INTO public.audit_log (isletme_id, tablo, islem, created_at) VALUES ($1, 'eski', 'INSERT', '2031-05-10T10:00:00+03:00')", [isletme]);

    expect(await hataMesaji(() => db.query("SELECT public.audit_log_eski_bolumleri_kaldir(6)"))).toMatch(/saklama_suresi_gecersiz/);

    // 24 ay: sınır ayı 2031-06 → 2031-03/04/05 gider, 2031-06 ve sonrası kalır.
    const r = await db.query<{ silinen: string[] }>("SELECT public.audit_log_eski_bolumleri_kaldir(24) AS silinen");
    expect(r.rows[0].silinen).toEqual(expect.arrayContaining(["audit_log_y2031m03", "audit_log_y2031m04", "audit_log_y2031m05"]));
    expect(r.rows[0].silinen).not.toContain("audit_log_y2031m06");
    const kalan = await db.query<{ ad: string | null }>("SELECT to_regclass('public.audit_log_y2031m06')::text AS ad");
    expect(kalan.rows[0].ad).toBe("audit_log_y2031m06");
    expect((await db.query("SELECT 1 FROM public.audit_log WHERE tablo = 'eski'")).rows).toHaveLength(0);
  });

  it("cron_calisma yalnız service_role içindir: panel kullanıcısı okuyamaz/yazamaz", async () => {
    await db.query("INSERT INTO public.cron_calisma (ad, son_basarili) VALUES ('mesaj-gunluk', now())");
    const h = await kimlikle(db, admin, () => hataMesaji(() => db.query("SELECT * FROM public.cron_calisma")));
    expect(h).toMatch(/permission denied/);
  });

  it("public şemasında RLS'i kapalı tablo YOK (yeni tablo eklenirken unutulmasın)", async () => {
    const r = await db.query<{ relname: string }>(
      "SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') AND NOT relrowsecurity ORDER BY 1"
    );
    expect(r.rows.map((x) => x.relname)).toEqual([]);
  });
});

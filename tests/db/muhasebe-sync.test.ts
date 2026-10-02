import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

describe("muhasebe sync (Paraşüt bilgileri)", () => {
  let db: PGlite;
  let adminA: string;
  let muhasebeA: string;
  let resepsiyonA: string;
  let adminB: string;

  const kaydet = (k: string, client: string, secret: string | null, company: string) =>
    kimlikle(db, k, async () => (await db.query<{ d: string }>("SELECT public.muhasebe_entegrasyonu_kaydet($1,$2,$3) AS d", [client, secret, company])).rows[0].d);
  const oku = (k: string) => kimlikle(db, k, async () => (await db.query<{ parasut_client_id: string; secret_tanimli: boolean; baglanti_durumu: string }>("SELECT parasut_client_id, secret_tanimli, baglanti_durumu FROM public.isletme_muhasebe_entegrasyonu")).rows);

  beforeAll(async () => {
    db = await yeniVeritabani();
    const a = await isletmeOlustur(db, "Salon A");
    const b = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: a, rol: "isletme_admin" });
    muhasebeA = await kullaniciOlustur(db, { isletmeId: a, rol: "muhasebe" });
    resepsiyonA = await kullaniciOlustur(db, { isletmeId: a, rol: "resepsiyon" });
    adminB = await kullaniciOlustur(db, { isletmeId: b, rol: "isletme_admin" });
  }, 120_000);

  it("yönetici kaydeder; üç bilgi tamamsa 'baglandi'", async () => {
    expect(await kaydet(adminA, " cid ", "gizli", " 123 ")).toBe("baglandi");
    expect(await oku(adminA)).toEqual([{ parasut_client_id: "cid", secret_tanimli: true, baglanti_durumu: "baglandi" }]);
  });

  it("secret boş bırakılırsa mevcut değer korunur", async () => {
    expect(await kaydet(adminA, "cid2", null, "123")).toBe("baglandi");
    const s = (await db.query<{ parasut_client_secret: string }>("SELECT parasut_client_secret FROM public.isletme_muhasebe_entegrasyonu")).rows[0];
    expect(s.parasut_client_secret).toBe("gizli");
  });

  it("client ve şirket ID zorunlu; secret hiç girilmediyse 'bekliyor'", async () => {
    expect(await hataMesaji(() => kaydet(adminA, "", "x", "1"))).toMatch(/muhasebe_bilgi_eksik/);
    expect(await kaydet(adminB, "c", null, "9")).toBe("bekliyor");
  });

  it("client secret authenticated rolüne okunamaz; doğrudan yazma yok", async () => {
    expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("SELECT parasut_client_secret FROM public.isletme_muhasebe_entegrasyonu")))).toMatch(/permission denied/i);
    expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("UPDATE public.isletme_muhasebe_entegrasyonu SET parasut_client_id = 'x'")))).toMatch(/permission denied/i);
  });

  it("muhasebe durumu görür ama yazamaz; resepsiyon göremez ve yazamaz; başka işletme görmez", async () => {
    expect((await oku(muhasebeA)).length).toBe(1);
    expect(await hataMesaji(() => kaydet(muhasebeA, "c", "s", "1"))).toMatch(/yetki_yetersiz/);
    expect(await oku(resepsiyonA)).toEqual([]);
    expect(await hataMesaji(() => kaydet(resepsiyonA, "c", "s", "1"))).toMatch(/yetki_yetersiz/);
    expect((await oku(adminB))[0].parasut_client_id).toBe("c");
  });
});

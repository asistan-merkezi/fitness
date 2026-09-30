import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { hataMesaji, isletmeOlustur, kimlikle, kullaniciOlustur, yeniVeritabani } from "./harness";

describe("QR kodları: kısa kod, ayar, hız sınırı, ön kayıt, anket", () => {
  let db: PGlite;
  let isletmeA: string;
  let isletmeB: string;
  let adminA: string;
  let resepsiyonA: string;
  let muhasebeA: string;
  let adminB: string;

  const servis = async <T>(fn: () => Promise<T>): Promise<T> => {
    await db.exec("SET ROLE service_role");
    try {
      return await fn();
    } finally {
      await db.exec("RESET ROLE");
    }
  };
  const kod = async (isletme: string) => (await db.query<{ qr_kisa_kod: string }>("SELECT qr_kisa_kod FROM public.isletme WHERE id = $1", [isletme])).rows[0].qr_kisa_kod;

  beforeAll(async () => {
    db = await yeniVeritabani();
    isletmeA = await isletmeOlustur(db, "Salon A");
    isletmeB = await isletmeOlustur(db, "Salon B");
    adminA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "isletme_admin" });
    resepsiyonA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "resepsiyon" });
    muhasebeA = await kullaniciOlustur(db, { isletmeId: isletmeA, rol: "muhasebe" });
    adminB = await kullaniciOlustur(db, { isletmeId: isletmeB, rol: "isletme_admin" });
  }, 120_000);

  describe("kısa kod", () => {
    it("her işletme 8 karakterlik, karışmayan alfabeden, benzersiz bir kod alır", async () => {
      const a = await kod(isletmeA);
      const b = await kod(isletmeB);
      expect(a).toMatch(/^[a-z2-9]{8}$/);
      expect(a).not.toMatch(/[01ilo]/);
      expect(a).not.toBe(b);
    });

    it("yönetici kodu doğrudan değiştiremez; yenileme fonksiyonu yalnız yöneticide ve yeni kod üretir", async () => {
      const once = await kod(isletmeA);
      const hata = await hataMesaji(() => kimlikle(db, adminA, () => db.query("UPDATE public.isletme SET qr_kisa_kod = 'abcdefgh' WHERE id = $1", [isletmeA])));
      expect(hata).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => kimlikle(db, resepsiyonA, () => db.query("SELECT public.qr_kisa_kod_yenile()")))).toMatch(/yetki_yetersiz/);

      const yeni = await kimlikle(db, adminA, async () => (await db.query<{ k: string }>("SELECT public.qr_kisa_kod_yenile() AS k")).rows[0].k);
      expect(yeni).not.toBe(once);
      expect(await kod(isletmeA)).toBe(yeni);
      expect(await kod(isletmeB)).not.toBe(yeni); // başka işletmeyi etkilemez
    });

    it("biçim bozuk kod reddedilir", async () => {
      expect(await hataMesaji(() => db.query("UPDATE public.isletme SET qr_kisa_kod = 'ABC' WHERE id = $1", [isletmeB]))).toMatch(/isletme_qr_kisa_kod_kurali/);
    });
  });

  describe("QR aç/kapa ayarı", () => {
    it("yalnız kendi işletmesinin yöneticisi okur/yazar", async () => {
      await kimlikle(db, adminA, () => db.query("INSERT INTO public.qr_kod_ayar (isletme_id, tip, aktif) VALUES ($1,'anket',false)", [isletmeA]));
      expect(await hataMesaji(() => kimlikle(db, resepsiyonA, () => db.query("INSERT INTO public.qr_kod_ayar (isletme_id, tip) VALUES ($1,'musteri_on_kayit')", [isletmeA])))).toMatch(/row-level security/i);
      expect(await hataMesaji(() => kimlikle(db, adminB, () => db.query("INSERT INTO public.qr_kod_ayar (isletme_id, tip) VALUES ($1,'musteri_on_kayit')", [isletmeA])))).toMatch(/row-level security/i);
      const say = (k: string) => kimlikle(db, k, async () => (await db.query("SELECT tip FROM public.qr_kod_ayar")).rows.length);
      expect(await say(adminA)).toBe(1);
      expect(await say(resepsiyonA)).toBe(0);
      expect(await say(adminB)).toBe(0);
    });

    it("geçersiz tip reddedilir", async () => {
      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("INSERT INTO public.qr_kod_ayar (isletme_id, tip) VALUES ($1,'bilinmeyen')", [isletmeA])))).toMatch(/check/i);
    });
  });

  describe("hız sınırı", () => {
    const kullan = (anahtar: string, limit: number, artir = true) =>
      servis(async () => (await db.query<{ ok: boolean }>("SELECT public.hiz_siniri_kullan($1,$2,600,$3) AS ok", [anahtar, limit, artir])).rows[0].ok);

    it("limit dolana kadar izin verir, sonra reddeder; okuma sayacı artırmaz; anahtarlar bağımsızdır", async () => {
      expect(await kullan("kayit:ip:a", 3)).toBe(true);
      expect(await kullan("kayit:ip:a", 3)).toBe(true);
      expect(await kullan("kayit:ip:a", 3)).toBe(true);
      expect(await kullan("kayit:ip:a", 3)).toBe(false);
      expect(await kullan("kayit:ip:a", 3, false)).toBe(false);
      expect(await kullan("kayit:ip:b", 3, false)).toBe(true);
      expect(await kullan("kayit:ip:b", 3, false)).toBe(true); // okumak tüketmez
    });

    it("yalnız service_role çağırır; geçersiz parametre reddedilir", async () => {
      for (const rol of ["anon", "authenticated"]) {
        const hata = await hataMesaji(async () => {
          await db.exec(`SET ROLE ${rol}`);
          try {
            await db.query("SELECT public.hiz_siniri_kullan('x', 5, 60, true)");
          } finally {
            await db.exec("RESET ROLE");
          }
        });
        expect(hata).toMatch(/permission denied/i);
      }
      expect(await hataMesaji(() => kullan("x", 0))).toMatch(/hiz_siniri_parametre_gecersiz/);
    });
  });

  describe("müşteri ön kaydı", () => {
    const ekle = (o: { ad?: string; tel?: string; kvkk?: boolean; dogum?: string | null; isletme?: string }) =>
      servis(() =>
        db.query<{ id: string }>("INSERT INTO public.musteri_on_kayit (isletme_id, ad_soyad, telefon, kvkk_aydinlatma_verildi, dogum_tarihi, metin_versiyonu) VALUES ($1,$2,$3,$4,$5,'v1') RETURNING id", [
          o.isletme ?? isletmeA,
          o.ad ?? "Ayşe Yılmaz",
          o.tel ?? "+905321112233",
          o.kvkk ?? true,
          o.dogum ?? null,
        ])
      );
    let kayit: string;

    it("KVKK aydınlatma olmadan ve bozuk telefonla kayıt alınmaz; kullanıcılar doğrudan yazamaz", async () => {
      kayit = (await ekle({})).rows[0].id;
      expect(await hataMesaji(() => ekle({ tel: "+905329990000", kvkk: false }))).toMatch(/check/i);
      expect(await hataMesaji(() => ekle({ tel: "05321112233" }))).toMatch(/check/i);
      expect(await hataMesaji(() => ekle({ ad: "A", tel: "+905329990001" }))).toMatch(/check/i);
      const hata = await hataMesaji(() => kimlikle(db, resepsiyonA, () => db.query("INSERT INTO public.musteri_on_kayit (isletme_id, ad_soyad, telefon, kvkk_aydinlatma_verildi, metin_versiyonu) VALUES ($1,'Ali Veli','+905329990002',true,'v1')", [isletmeA])));
      expect(hata).toMatch(/permission denied/i);
    });

    it("aynı telefondan ikinci bekleyen kayıt yığılmaz", async () => {
      expect(await hataMesaji(() => ekle({}))).toMatch(/uq_on_kayit_bekleyen|duplicate|unique/i);
    });

    it("yalnız yönetici ve resepsiyon görür", async () => {
      const say = (k: string) => kimlikle(db, k, async () => (await db.query("SELECT id FROM public.musteri_on_kayit")).rows.length);
      expect(await say(adminA)).toBe(1);
      expect(await say(resepsiyonA)).toBe(1);
      expect(await say(muhasebeA)).toBe(0);
      expect(await say(adminB)).toBe(0);
    });

    it("onaylama müşteriyi bağlar; reddetme nedenle kapatır; sonuçlanmış kayıt tekrar değişmez", async () => {
      const musteri = await kimlikle(db, resepsiyonA, async () => {
        const r = await db.query<{ id: string }>(
          "SELECT public.musteri_olustur(p_ad_soyad => 'Ayşe Yılmaz', p_telefon => '+905321112233', p_kayit_kanali => 'qr_self_servis', p_onamlar => '[{\"tur\":\"kvkk_aydinlatma\",\"verildi\":true,\"metin_versiyonu\":\"v1\"}]'::jsonb) AS id"
        );
        return r.rows[0].id;
      });
      const sonuclandir = (k: string, id: string, durum: string, m: string | null = null, neden: string | null = null) =>
        kimlikle(db, k, () => db.query("SELECT public.on_kayit_sonuclandir($1,$2,$3,$4)", [id, durum, m, neden]));

      expect(await hataMesaji(() => sonuclandir(muhasebeA, kayit, "onaylandi", musteri))).toMatch(/yetki_yetersiz/);
      expect(await hataMesaji(() => sonuclandir(adminB, kayit, "onaylandi", musteri))).toMatch(/on_kayit_bulunamadi|yetki/);
      expect(await hataMesaji(() => sonuclandir(resepsiyonA, kayit, "onaylandi", null))).toMatch(/musteri_bulunamadi/);
      expect(await hataMesaji(() => sonuclandir(resepsiyonA, kayit, "beklemede"))).toMatch(/durum_gecersiz/);

      await sonuclandir(resepsiyonA, kayit, "onaylandi", musteri);
      const r = (await db.query<{ durum: string; musteri_id: string }>("SELECT durum, musteri_id FROM public.musteri_on_kayit WHERE id = $1", [kayit])).rows[0];
      expect(r).toEqual({ durum: "onaylandi", musteri_id: musteri });
      expect(await hataMesaji(() => sonuclandir(resepsiyonA, kayit, "reddedildi", null, "x"))).toMatch(/on_kayit_sonuclanmis/);

      const ikinci = (await ekle({ tel: "+905329990003", ad: "Veli Kaya" })).rows[0].id;
      await sonuclandir(adminA, ikinci, "reddedildi", null, "Sahte kayıt");
      const red = (await db.query<{ durum: string; red_nedeni: string }>("SELECT durum, red_nedeni FROM public.musteri_on_kayit WHERE id = $1", [ikinci])).rows[0];
      expect(red).toEqual({ durum: "reddedildi", red_nedeni: "Sahte kayıt" });
    });

    it("onaylı kayıt yeni bekleyen kayıt açılmasına engel değildir; temizleme yalnız eski bekleyen/reddedilenleri siler", async () => {
      await ekle({ tel: "+905321112233" }); // öncekisi onaylandığı için yeni bekleyen açılabilir
      await db.query("UPDATE public.musteri_on_kayit SET created_at = now() - interval '40 days' WHERE durum = 'reddedildi'");
      await db.query("INSERT INTO public.musteri_on_kayit (isletme_id, ad_soyad, telefon, kvkk_aydinlatma_verildi, metin_versiyonu, created_at) VALUES ($1,'Eski Bekleyen','+905329990004',true,'v1', now() - interval '45 days')", [isletmeA]);

      const temizle = (gun: number) => servis(async () => (await db.query<{ n: number }>("SELECT public.on_kayit_temizle($1) AS n", [gun])).rows[0].n);
      expect(await temizle(30)).toBe(2); // 40 günlük reddedilen + 45 günlük bekleyen
      const kalan = (await db.query<{ durum: string }>("SELECT durum FROM public.musteri_on_kayit ORDER BY durum")).rows.map((r) => r.durum);
      expect(kalan).toEqual(["beklemede", "onaylandi"]); // onaylı kayıt (müşteriye bağlı) ve yeni bekleyen korunur
      expect(await hataMesaji(() => temizle(0))).toMatch(/gun_gecersiz/);
      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("SELECT public.on_kayit_temizle(30)")))).toMatch(/permission denied/i);
    });
  });

  describe("anket yanıtları", () => {
    const ekle = (puan: number, o: { oneri?: string; ad?: string | null; tel?: string | null } = {}) =>
      servis(() => db.query("INSERT INTO public.anket_yaniti (isletme_id, puan, oneri, ad_soyad, telefon) VALUES ($1,$2,$3,$4,$5)", [isletmeA, puan, o.oneri ?? null, o.ad ?? null, o.tel ?? null]));

    it("anonim yanıt mümkün; puan 1-5 olmalı; uzun öneri ve bozuk telefon reddedilir", async () => {
      await ekle(5);
      await ekle(3, { oneri: "Duş sayısı artırılmalı", ad: "Ayşe Yılmaz", tel: "+905321112233" });
      expect(await hataMesaji(() => ekle(0))).toMatch(/check/i);
      expect(await hataMesaji(() => ekle(6))).toMatch(/check/i);
      expect(await hataMesaji(() => ekle(4, { oneri: "x".repeat(1001) }))).toMatch(/check/i);
      expect(await hataMesaji(() => ekle(4, { tel: "0532" }))).toMatch(/check/i);
    });

    it("yalnız yönetici ve resepsiyon okur; kullanıcılar doğrudan yazamaz", async () => {
      const say = (k: string) => kimlikle(db, k, async () => (await db.query("SELECT id FROM public.anket_yaniti")).rows.length);
      expect(await say(adminA)).toBe(2);
      expect(await say(resepsiyonA)).toBe(2);
      expect(await say(muhasebeA)).toBe(0);
      expect(await say(adminB)).toBe(0);
      expect(await hataMesaji(() => kimlikle(db, adminA, () => db.query("INSERT INTO public.anket_yaniti (isletme_id, puan) VALUES ($1, 5)", [isletmeA])))).toMatch(/permission denied/i);
    });
  });
});

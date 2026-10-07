import { z } from "zod";
import { bugunIstanbulTarihi, toUTC } from "@/lib/datetime";
import { takvimTarihiGecerli } from "@/lib/donem";
import { MANUEL_HAREKET_TURLERI, ODEME_YONTEMLI_TURLER } from "@/lib/panel/personel-odeme";
import { ibanGecerli, ibanTemizle } from "@/lib/iban";
import { tlYaziKurusa } from "@/lib/para";
import { tcKimlikGecerli } from "@/lib/tc-kimlik";
import { isimNormalle, resitDegilMi, telefonE164 } from "@/lib/utils";

/**
 * Sunucu tarafı girdi doğrulaması (client doğrulaması yalnız UX'tir). İsim alanları `isimNormalle`
 * ile kaydedilir; açıklama/not alanlarına DOKUNULMAZ (skill: isim-bicimi). Para kuruş tamsayıdır.
 */

/** FormData -> düz nesne. Aynı anahtar birden çok kez varsa dizi; File yok sayılır. */
export function formVerisi(formData: FormData): Record<string, string | string[]> {
  const cikti: Record<string, string | string[]> = {};
  for (const anahtar of new Set(formData.keys())) {
    const degerler = formData.getAll(anahtar).filter((d): d is string => typeof d === "string");
    if (degerler.length === 0) continue;
    cikti[anahtar] = degerler.length === 1 ? degerler[0] : degerler;
  }
  return cikti;
}

const isimAlani = z.string().trim().min(2, "En az 2 karakter girin.").max(100, "En fazla 100 karakter.").transform(isimNormalle);
const isimOpsiyonel = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => (v ? isimNormalle(v) : null));
const metinOpsiyonel = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter.`)
    .optional()
    .transform((v) => (v ? v : null));
const telefonAlani = z
  .string()
  .trim()
  .refine((v) => telefonE164(v) !== null, "Geçerli bir telefon numarası girin (ör. 0532 123 45 67).")
  .transform((v) => telefonE164(v) as string);
const telefonOpsiyonel = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || telefonE164(v) !== null, "Geçerli bir telefon numarası girin.")
  .transform((v) => (v ? telefonE164(v) : null));
const epostaOpsiyonel = z
  .string()
  .trim()
  .max(254)
  .optional()
  .refine((v) => !v || z.email().safeParse(v).success, "Geçerli bir e-posta adresi girin.")
  .transform((v) => (v ? v : null));
const gunOpsiyonel = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || (takvimTarihiGecerli(v)), "Geçerli bir tarih girin.")
  .transform((v) => (v ? v : null));
/** Onay kutusu: işaretliyse "on"/"true" gelir, değilse alan hiç gelmez. */
const onay = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");
const tlTutar = (mesaj: string) =>
  z
    .string()
    .trim()
    .refine((v) => tlYaziKurusa(v) !== null, mesaj)
    .transform((v) => tlYaziKurusa(v) as number);
const tlOpsiyonel = (mesaj: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || tlYaziKurusa(v) !== null, mesaj)
    .transform((v) => (v ? (tlYaziKurusa(v) as number) : 0));
const tamSayi = (min: number, max: number, mesaj: string) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, mesaj)
    .transform(Number);
const tamSayiOpsiyonel = (min: number, max: number, mesaj: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), mesaj)
    .transform((v) => (v ? Number(v) : null));

export const YONTEMLER = ["nakit", "kredi_karti", "havale"] as const;
export const SAGLIK_BAYRAKLARI = ["kronik_rahatsizlik", "kalp_damar", "tansiyon", "sakatlik", "ortopedik", "hamilelik", "diyabet", "astim", "diger"] as const;
const yontem = z.enum(YONTEMLER, { error: "Ödeme yöntemi seçin." });
/** Seçime bağlı banka hesabı (boş gelirse undefined). */
const hesapIdOpsiyonel = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.uuid().optional());

function diziye(v: unknown): unknown[] {
  if (v === undefined || v === "") return [];
  return Array.isArray(v) ? v : [v];
}

// ---------------------------------------------------------------------------------------------------------
export const musteriSemasi = z
  .object({
    ad_soyad: isimAlani,
    telefon: telefonAlani,
    eposta: epostaOpsiyonel,
    dogum_tarihi: gunOpsiyonel,
    cinsiyet: z.enum(["kadin", "erkek", "belirtilmemis"]).default("belirtilmemis"),
    kategori: z.enum(["standart", "gold", "vip", "platinum"]).default("standart"),
    not_metni: metinOpsiyonel(1000),
    tc_kimlik_no: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || tcKimlikGecerli(v), "Geçerli bir T.C. kimlik numarası girin.")
      .transform((v) => (v ? v : null)),
    il: metinOpsiyonel(100),
    ilce: metinOpsiyonel(100),
    mahalle: metinOpsiyonel(150),
    adres_detay: metinOpsiyonel(500),
    acil_durum_ad_soyad: isimOpsiyonel,
    acil_durum_telefon: telefonOpsiyonel,
    saglik_bayraklari: z.preprocess(diziye, z.array(z.enum(SAGLIK_BAYRAKLARI))).default([]),
    saglik_notu: metinOpsiyonel(1000),
    veli_ad_soyad: isimOpsiyonel,
    veli_telefon: telefonOpsiyonel,
    veli_yakinlik: z.enum(["anne", "baba", "vasi", "diger"]).default("diger"),
    onay_kvkk_aydinlatma: onay,
    onay_acik_riza_saglik: onay,
    onay_ticari_ileti: onay,
    onay_taahhutname: onay,
    onay_veli: onay,
  })
  .superRefine((v, ctx) => {
    if (!v.onay_kvkk_aydinlatma) {
      ctx.addIssue({ code: "custom", path: ["onay_kvkk_aydinlatma"], message: "KVKK aydınlatma metni müşteriye okutulmalı/bildirilmelidir." });
    }
    if (v.dogum_tarihi) {
      if (v.dogum_tarihi > bugunIstanbulTarihi() || v.dogum_tarihi < "1900-01-01") {
        ctx.addIssue({ code: "custom", path: ["dogum_tarihi"], message: "Doğum tarihi geçerli bir geçmiş tarih olmalı." });
      } else if (resitDegilMi(v.dogum_tarihi)) {
        if (!v.veli_ad_soyad || !v.veli_telefon) {
          ctx.addIssue({ code: "custom", path: ["veli_ad_soyad"], message: "18 yaş altı müşteri için veli adı ve telefonu zorunludur." });
        }
        if (!v.onay_veli) {
          ctx.addIssue({ code: "custom", path: ["onay_veli"], message: "18 yaş altı müşteri için veli onayı zorunludur." });
        }
      }
    }
    if ((v.saglik_bayraklari.length > 0 || v.saglik_notu) && !v.onay_acik_riza_saglik) {
      ctx.addIssue({ code: "custom", path: ["onay_acik_riza_saglik"], message: "Sağlık bilgisi kaydetmek için açık rıza onayı gerekir." });
    }
    if (Boolean(v.acil_durum_ad_soyad) !== Boolean(v.acil_durum_telefon)) {
      ctx.addIssue({ code: "custom", path: ["acil_durum_ad_soyad"], message: "Acil durum kişisi için ad ve telefon birlikte girilmelidir." });
    }
  });

export type MusteriVerisi = z.infer<typeof musteriSemasi>;

/** `musteri_olustur` RPC argümanları (KVKK onamları metin sürümüyle kaydedilir). */
export function musteriRpcArgumanlari(v: MusteriVerisi, metinSurumu: string) {
  const risk: string[] = [];
  if (v.saglik_bayraklari.length > 0) risk.push("saglik_riski");
  if (v.saglik_bayraklari.includes("sakatlik") || v.saglik_bayraklari.includes("ortopedik")) risk.push("sakatlik_riski");

  const hassasVar = v.tc_kimlik_no || v.il || v.ilce || v.mahalle || v.adres_detay || v.acil_durum_ad_soyad || v.saglik_bayraklari.length > 0 || v.saglik_notu;
  const onamlar = [
    { tur: "kvkk_aydinlatma", verildi: true, metin_versiyonu: metinSurumu },
    ...(v.onay_acik_riza_saglik ? [{ tur: "acik_riza_saglik", verildi: true, metin_versiyonu: metinSurumu }] : []),
    { tur: "ticari_ileti", verildi: v.onay_ticari_ileti, metin_versiyonu: metinSurumu },
    ...(v.onay_taahhutname ? [{ tur: "taahhutname", verildi: true, metin_versiyonu: metinSurumu }] : []),
    ...(v.onay_veli ? [{ tur: "veli_onayi", verildi: true, metin_versiyonu: metinSurumu, veren: "veli" }] : []),
  ];

  return {
    p_ad_soyad: v.ad_soyad,
    p_telefon: v.telefon,
    p_eposta: v.eposta,
    p_dogum_tarihi: v.dogum_tarihi,
    p_cinsiyet: v.cinsiyet,
    p_kategori: v.kategori,
    p_kayit_kanali: "resepsiyon",
    p_risk_bayraklari: risk,
    p_not: v.not_metni,
    p_hassas: hassasVar
      ? {
          tc_kimlik_no: v.tc_kimlik_no,
          il: v.il,
          ilce: v.ilce,
          mahalle: v.mahalle,
          adres_detay: v.adres_detay,
          acil_durum_ad_soyad: v.acil_durum_ad_soyad,
          acil_durum_telefon: v.acil_durum_telefon,
          saglik_bayraklari: v.saglik_bayraklari,
          saglik_notu: v.saglik_notu,
        }
      : null,
    p_veli: v.veli_ad_soyad && v.veli_telefon ? { ad_soyad: v.veli_ad_soyad, telefon: v.veli_telefon, yakinlik: v.veli_yakinlik } : null,
    p_onamlar: onamlar,
  };
}

/** Müşterinin temel bilgilerini güncelleme (hassas veri ayrı akış). */
export const musteriGuncelleSemasi = z.object({
  musteri_id: z.uuid(),
  ad_soyad: isimAlani,
  telefon: telefonAlani,
  eposta: epostaOpsiyonel,
  kategori: z.enum(["standart", "gold", "vip", "platinum"]),
  not_metni: metinOpsiyonel(1000),
  aktif: onay,
});

// ---------------------------------------------------------------------------------------------------------
export const paketSemasi = z
  .object({
    ad: isimAlani,
    tur: z.enum(["sure", "seans"], { error: "Paket türü seçin." }),
    kapsam: z.enum(["giris", "ders"]).default("giris"),
    sure_gun: tamSayiOpsiyonel(1, 3650, "Süre 1-3650 gün olmalı."),
    seans_sayisi: tamSayiOpsiyonel(1, 1000, "Seans sayısı 1-1000 olmalı."),
    gecerlilik_gun: tamSayiOpsiyonel(1, 3650, "Geçerlilik 1-3650 gün olmalı."),
    fiyat: tlTutar("Geçerli bir fiyat girin (ör. 1.250,00)."),
    kdv_orani: tamSayi(0, 100, "KDV oranı 0-100 olmalı.").default(20),
    dondurma_izni: onay,
    azami_dondurma_gun: tamSayiOpsiyonel(0, 365, "Azami dondurma 0-365 gün olmalı."),
    dondurma_ucret: tlOpsiyonel("Geçerli bir dondurma ücreti girin."),
    satis_bitis_tarihi: gunOpsiyonel,
    aktif: onay,
  })
  .superRefine((v, ctx) => {
    if (v.tur === "sure" && !v.sure_gun) ctx.addIssue({ code: "custom", path: ["sure_gun"], message: "Süre bazlı pakette gün sayısı zorunlu." });
    if (v.tur === "sure" && (v.seans_sayisi || v.gecerlilik_gun)) {
      ctx.addIssue({ code: "custom", path: ["seans_sayisi"], message: "Süre bazlı pakette seans sayısı ve geçerlilik girilmez." });
    }
    if (v.kapsam === "ders" && v.tur !== "seans") ctx.addIssue({ code: "custom", path: ["kapsam"], message: "PT dersi kapsamı yalnız seans bazlı pakette olur." });
    if (v.tur === "seans" && !v.seans_sayisi) ctx.addIssue({ code: "custom", path: ["seans_sayisi"], message: "Seans bazlı pakette seans sayısı zorunlu." });
    if (v.tur === "seans" && v.sure_gun) ctx.addIssue({ code: "custom", path: ["sure_gun"], message: "Seans bazlı pakette süre girilmez (geçerlilik kullanın)." });
    if (!v.dondurma_izni && ((v.azami_dondurma_gun ?? 0) > 0 || v.dondurma_ucret > 0)) {
      ctx.addIssue({ code: "custom", path: ["dondurma_izni"], message: "Dondurma izni kapalıyken dondurma günü/ücreti girilemez." });
    }
    if (v.dondurma_izni && !(v.azami_dondurma_gun && v.azami_dondurma_gun > 0)) {
      ctx.addIssue({ code: "custom", path: ["azami_dondurma_gun"], message: "Dondurma izni açıkken azami dondurma günü girin." });
    }
  });

export type PaketVerisi = z.infer<typeof paketSemasi>;

// ---------------------------------------------------------------------------------------------------------
export const satisSemasi = z
  .object({
    musteri_id: z.uuid(),
    paket_id: z.uuid({ error: "Paket seçin." }),
    baslangic: gunOpsiyonel,
    iskonto: tlOpsiyonel("Geçerli bir iskonto girin."),
    odeme: tlOpsiyonel("Geçerli bir ödeme tutarı girin."),
    odeme_yontemi: z.enum(YONTEMLER).optional().or(z.literal("").transform(() => undefined)),
    anahtar: z.uuid(),
  })
  .superRefine((v, ctx) => {
    if (v.odeme > 0 && !v.odeme_yontemi) ctx.addIssue({ code: "custom", path: ["odeme_yontemi"], message: "Ödeme yöntemi seçin." });
  });

export const odemeSemasi = z.object({
  musteri_id: z.uuid(),
  tutar: tlTutar("Geçerli bir tutar girin.").refine((k) => k > 0, "Tutar sıfırdan büyük olmalı."),
  yontem,
  banka_hesap_id: hesapIdOpsiyonel,
  aciklama: metinOpsiyonel(300),
  anahtar: z.uuid(),
});

export const iadeSemasi = z.object({
  musteri_id: z.uuid(),
  iade_edilen_hareket_id: z.uuid({ error: "İade edilecek ödemeyi seçin." }),
  tutar: tlTutar("Geçerli bir tutar girin.").refine((k) => k > 0, "Tutar sıfırdan büyük olmalı."),
  yontem,
  banka_hesap_id: hesapIdOpsiyonel,
  aciklama: metinOpsiyonel(300),
  anahtar: z.uuid(),
});

export const dondurSemasi = z.object({
  uyelik_id: z.uuid(),
  gun: tamSayi(1, 365, "Dondurma günü 1-365 olmalı."),
});

export const uyelikIslemSemasi = z.object({
  uyelik_id: z.uuid(),
  neden: metinOpsiyonel(300),
});

export const girisSemasi = z.object({ musteri_id: z.uuid() });

// ---------------------------------------------------------------------------------------------------------
/** <input type="datetime-local"> değeri ("YYYY-MM-DDTHH:mm"), İstanbul saati kabul edilip UTC ISO'ya çevrilir. */
const dersZamani = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Geçerli bir tarih ve saat girin.")
  .refine((v) => takvimTarihiGecerli(v.slice(0, 10)) && Number(v.slice(11, 13)) < 24 && Number(v.slice(14, 16)) < 60, "Geçerli bir tarih ve saat girin.")
  .transform((v) => toUTC(v));
const uuidOpsiyonel = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.uuid().optional());

export const DERS_HEDEFLERI = ["planlandi", "geldi", "gecikmeli_geldi", "derste", "tamamlandi", "gelmedi", "iptal"] as const;

export const dersOlusturSemasi = z.object({
  musteri_id: z.uuid({ error: "Müşteri seçin." }),
  antrenor_id: z.uuid({ error: "Antrenör seçin." }),
  alan_id: z.uuid({ error: "Alan/stüdyo seçin." }),
  baslangic: dersZamani,
  sure: tamSayi(15, 480, "Süre 15-480 dakika olmalı."),
  ucret: tlOpsiyonel("Geçerli bir ücret girin."),
  not: metinOpsiyonel(300),
  anahtar: z.uuid(),
});

/** Periyodik ders: haftanın gün(ler)i + saat(ler)i; gunler_json = [{ gun: "0-6" (0=Pazar), saat: "HH:mm" }]. */
export const periyodikDersSemasi = z.object({
  musteri_id: z.uuid({ error: "Müşteri seçin." }),
  antrenor_id: z.uuid({ error: "Antrenör seçin." }),
  alan_id: z.uuid({ error: "Alan/stüdyo seçin." }),
  sure: tamSayi(15, 480, "Süre 15-480 dakika olmalı."),
  ucret: tlOpsiyonel("Geçerli bir ücret girin."),
  not: metinOpsiyonel(300),
  gunler: z
    .string()
    .transform((v) => {
      try {
        return JSON.parse(v) as unknown;
      } catch {
        return null;
      }
    })
    .pipe(
      z
        .array(z.object({ gun: z.string().regex(/^[0-6]$/), saat: z.string().regex(/^\d{2}:\d{2}$/) }))
        .min(1, "En az bir gün ve saat seçin.")
        .max(7, "En fazla 7 gün seçilebilir.")
    ),
});

export const dersDurumSemasi = z.object({
  ders_id: z.uuid(),
  hedef: z.enum(DERS_HEDEFLERI, { error: "Geçersiz durum." }),
  gecikme_dk: tamSayiOpsiyonel(1, 600, "Gecikme 1-600 dakika olmalı."),
});

export const dersTasiSemasi = z.object({
  ders_id: z.uuid(),
  baslangic: dersZamani,
  sure: tamSayiOpsiyonel(15, 480, "Süre 15-480 dakika olmalı."),
  antrenor_id: uuidOpsiyonel,
  alan_id: uuidOpsiyonel,
});

export const alanSemasi = z.object({
  alan_id: uuidOpsiyonel,
  ad: isimAlani,
  aktif: onay,
});

// ---------------------------------------------------------------------------------------------------------
/** Ekipman adı: boşsa null, doluysa 2-100 karakter (DB kısıtıyla aynı). */
const ekipmanOpsiyonel = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || (v.length >= 2 && v.length <= 100), "Ekipman adı 2-100 karakter olmalı.")
  .transform((v) => (v ? v : null));

export const egzersizSemasi = z.object({
  egzersiz_id: uuidOpsiyonel,
  ad: isimAlani,
  ekipman: ekipmanOpsiyonel,
  sure_dakika: tamSayiOpsiyonel(1, 480, "Süre 1-480 dakika olmalı."),
  aktif: onay,
});

const antrenmanAdimiSemasi = z.object({
  id: uuidOpsiyonel,
  ad: isimAlani,
  ekipman: ekipmanOpsiyonel,
  set_sayisi: tamSayiOpsiyonel(1, 50, "Set sayısı 1-50 olmalı."),
  tekrar: metinOpsiyonel(20),
  sure_dakika: tamSayiOpsiyonel(1, 480, "Süre 1-480 dakika olmalı."),
});

/** `adimlar`: form alanında JSON dizisi (adım listesi dinamik olduğundan tek gizli alan). */
export const antrenmanTanimiSemasi = z.object({
  antrenman_id: uuidOpsiyonel,
  ad: isimAlani,
  aciklama: metinOpsiyonel(500),
  adimlar: z
    .string()
    .transform((v, ctx) => {
      try {
        const ham: unknown = JSON.parse(v);
        return Array.isArray(ham) ? ham : [];
      } catch {
        ctx.addIssue({ code: "custom", message: "Adım listesi okunamadı." });
        return z.NEVER;
      }
    })
    .pipe(z.array(antrenmanAdimiSemasi).min(1, "En az bir hareket ekleyin.").max(50, "En fazla 50 hareket eklenebilir.")),
});

export const antrenmanAktifSemasi = z.object({ antrenman_id: z.uuid(), aktif: onay });

// ---------------------------------------------------------------------------------------------------------
export const personelProfilSemasi = z
  .object({
    kullanici_id: z.uuid(),
    maas: tlOpsiyonel("Geçerli bir maaş girin (ör. 30.000,00)."),
    ders_prim: tlOpsiyonel("Geçerli bir ders primi girin."),
    ise_giris_tarihi: gunOpsiyonel,
    isten_cikis_tarihi: gunOpsiyonel,
  })
  .superRefine((v, ctx) => {
    if (v.ise_giris_tarihi && v.isten_cikis_tarihi && v.isten_cikis_tarihi < v.ise_giris_tarihi) {
      ctx.addIssue({ code: "custom", path: ["isten_cikis_tarihi"], message: "İşten çıkış tarihi işe girişten önce olamaz." });
    }
  });

/** Dönem: "YYYY-MM". */
export const personelDonemSemasi = z.object({ ay: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Geçerli bir dönem seçin.") });

const hareketYontemi = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.enum(["nakit", "havale"], { error: "Ödeme yöntemi seçin." }).optional());
const hareketTarihi = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || (takvimTarihiGecerli(v)), "Geçerli bir tarih girin.")
  .transform((v) => (v ? v : undefined));
/** Kasa/bankadan para çıkan türlerde (ödeme, avans) yöntem zorunludur; prim/yol/yemek/mesai/kesinti'de sorulmaz. */
const yontemKurali = (v: { tur: string; yontem?: string }, ctx: z.RefinementCtx) => {
  if (ODEME_YONTEMLI_TURLER.includes(v.tur) && !v.yontem) ctx.addIssue({ code: "custom", path: ["yontem"], message: "Ödeme yöntemi seçin." });
};

export const personelHareketSemasi = z
  .object({
    kullanici_id: z.uuid(),
    tur: z.enum(MANUEL_HAREKET_TURLERI, { error: "Geçerli bir kategori seçin." }),
    tutar: tlTutar("Geçerli bir tutar girin.").refine((k) => k > 0, "Tutar sıfırdan büyük olmalı."),
    yontem: hareketYontemi,
    banka_hesap_id: hesapIdOpsiyonel,
    tarih: hareketTarihi,
    aciklama: metinOpsiyonel(300),
    anahtar: z.uuid(),
  })
  .superRefine(yontemKurali);

/** Toplu maaş ödemesi: her kalem (personel + kuruş tutar) aynı tarih/yöntemle ayrı deftere yazılır. */
export const personelTopluOdemeSemasi = z
  .object({
    tur: z.enum(MANUEL_HAREKET_TURLERI, { error: "Geçerli bir kategori seçin." }),
    yontem: hareketYontemi,
    banka_hesap_id: hesapIdOpsiyonel,
    tarih: hareketTarihi,
    aciklama: metinOpsiyonel(300),
    anahtar: z.uuid(),
    kalemler: z
      .string()
      .transform((v, ctx) => {
        try {
          return JSON.parse(v) as unknown;
        } catch {
          ctx.addIssue({ code: "custom", message: "Girdi hatalı." });
          return z.NEVER;
        }
      })
      .pipe(z.array(z.object({ kullanici_id: z.uuid(), tutar_kurus: z.number().int().positive().max(100_000_000_000) })).min(1, "En az bir personel seçin.").max(200)),
  })
  .superRefine(yontemKurali);

// ---------------------------------------------------------------------------------------------------------
const gunZorunlu = z
  .string()
  .trim()
  .refine((v) => takvimTarihiGecerli(v), "Geçerli bir tarih girin.");
export const IZIN_TIPLERI = ["yillik", "mazeret", "rapor"] as const;

export const izinTalepSemasi = z
  .object({
    tip: z.enum(IZIN_TIPLERI, { error: "İzin türü seçin." }),
    baslangic: gunZorunlu,
    bitis: gunZorunlu,
    gerekce: metinOpsiyonel(300),
  })
  .superRefine((v, ctx) => {
    if (v.bitis < v.baslangic) ctx.addIssue({ code: "custom", path: ["bitis"], message: "Bitiş tarihi başlangıçtan önce olamaz." });
  });

export const izinManuelSemasi = izinTalepSemasi.safeExtend({ kullanici_id: z.uuid({ error: "Personel seçin." }) });

export const izinDegerlendirSemasi = z.object({
  izin_id: z.uuid(),
  karar: z.enum(["onayla", "reddet"], { error: "Geçersiz karar." }),
  red_gerekce: metinOpsiyonel(300),
});

export const izinIptalSemasi = z.object({ izin_id: z.uuid() });

// ---------------------------------------------------------------------------------------------------------
const saatOpsiyonel = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Geçerli bir saat girin (SS:DD).")
  .transform((v) => (v ? v : null));
const vergiNoOpsiyonel = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\d{10,11}$/.test(v), "Vergi numarası 10 veya 11 haneli olmalı.")
  .transform((v) => (v ? v : null));

/** Şirket bilgileri formu. İsimler Title Case'e çevrilir; adres detayı ve açıklamalara dokunulmaz. */
export const sirketSemasi = z
  .object({
    ad: isimAlani,
    unvan: isimOpsiyonel,
    adres_il: metinOpsiyonel(60),
    adres_ilce: metinOpsiyonel(60),
    adres_mahalle: metinOpsiyonel(100),
    adres: metinOpsiyonel(300),
    vergi_dairesi: isimOpsiyonel,
    vergi_no: vergiNoOpsiyonel,
    telefon: telefonOpsiyonel,
    whatsapp_no: telefonOpsiyonel,
    eposta: epostaOpsiyonel,
    yetkili_kisi: isimOpsiyonel,
    yetkili_telefon: telefonOpsiyonel,
    yetkili_eposta: epostaOpsiyonel,
    hafta_ici_baslangic: saatOpsiyonel,
    hafta_ici_bitis: saatOpsiyonel,
    cumartesi_baslangic: saatOpsiyonel,
    cumartesi_bitis: saatOpsiyonel,
    pazar_baslangic: saatOpsiyonel,
    pazar_bitis: saatOpsiyonel,
  })
  .superRefine((v, ctx) => {
    const gunler: [string, string | null, string | null][] = [
      ["Hafta içi", v.hafta_ici_baslangic, v.hafta_ici_bitis],
      ["Cumartesi", v.cumartesi_baslangic, v.cumartesi_bitis],
      ["Pazar", v.pazar_baslangic, v.pazar_bitis],
    ];
    for (const [gun, bas, bit] of gunler) {
      if ((bas === null) !== (bit === null)) ctx.addIssue({ code: "custom", message: `${gun} için başlangıç ve bitiş saatini birlikte girin (kapalıysa ikisini de boş bırakın).` });
      else if (bas !== null && bas === bit) ctx.addIssue({ code: "custom", message: `${gun} için başlangıç ve bitiş saati aynı olamaz.` });
    }
  });

export const bankaHesabiSemasi = z.object({
  hesap_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.uuid().optional()),
  banka_adi: isimAlani,
  sube: isimOpsiyonel,
  hesap_sahibi: isimAlani,
  iban: z
    .string()
    .trim()
    .refine((v) => ibanGecerli(v), "Geçerli bir TR IBAN girin (TR ile başlayan 26 karakter)."),
  hesap_tipi: z.enum(["isletme", "sahis"]).default("isletme"),
  aktif: onay,
});

// ---------------------------------------------------------------------------------------------------------
export const MESAJ_KANALLARI = ["sms", "whatsapp", "mail"] as const;

/** Mesaj kuralı formu. Açıklama niteliğindeki metinlere (mesaj metni) isim biçimi UYGULANMAZ. */
export const mesajKuraliSemasi = z.object({
  tetikleyici_kodu: z.string().trim().min(1, "Tetikleyici bulunamadı.").max(80),
  aktif: onay,
  sms_aktif: onay,
  whatsapp_aktif: onay,
  mail_aktif: onay,
  mesaj_metni: z.string().trim().max(1000, "Mesaj metni en fazla 1000 karakter olabilir."),
  offset_deger: tamSayiOpsiyonel(0, 1000, "Zamanlama 0-1000 olmalı."),
  offset_birim: z.enum(["dakika", "saat", "gun"]).default("saat"),
});

export const mesajTestSemasi = z.object({
  tetikleyici_kodu: z.string().trim().min(1).max(80),
  kanal: z.enum(MESAJ_KANALLARI, { error: "Kanal seçin." }),
  adres: z.string().trim().min(3, "Alıcı adresi girin.").max(254),
});

// ---------------------------------------------------------------------------------------------------------
/** Herkese açık müşteri ön kayıt formu. 18 yaş altı başvuramaz (veli akışı panelde resepsiyonda yürür). `website`: bot tuzağı (boş olmalı). */
export const onKayitSemasi = z.object({
  ad_soyad: isimAlani,
  telefon: telefonAlani,
  eposta: epostaOpsiyonel,
  dogum_tarihi: z
    .string()
    .trim()
    .refine((v) => takvimTarihiGecerli(v), "Geçerli bir doğum tarihi girin.")
    .refine((v) => !resitDegilMi(v), "18 yaşından küçükler için kayıt resepsiyonda veli ile birlikte yapılır."),
  kvkk: onay.refine((v) => v, "Devam etmek için aydınlatma metnini okuduğunuzu onaylayın."),
  ticari: onay,
  website: z.string().optional(),
});

/** Herkese açık anket formu: ad ve telefon isteğe bağlıdır. */
export const anketSemasi = z.object({
  puan: tamSayi(1, 5, "Puan 1 ile 5 arasında olmalı."),
  oneri: metinOpsiyonel(1000),
  ad_soyad: isimOpsiyonel,
  telefon: telefonOpsiyonel,
  website: z.string().optional(),
});

export const qrAyarSemasi = z.object({
  tip: z.enum(["musteri_on_kayit", "anket", "puantaj_giris", "puantaj_cikis", "is_basvurusu"]),
  aktif: onay,
});

/** "12,5" / "12.5" / "12" -> 0-100 arası yüzde (iki ondalık). */
const yuzdeAlani = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v.replace(",", ".")) : 0))
  .refine((n) => Number.isFinite(n) && n >= 0 && n <= 100, "Yüzde 0 ile 100 arasında olmalı.")
  .transform((n) => Math.round(n * 100) / 100);

// ---------------------------------------------------------------------------------------------------------
const aracAdi = (mesaj: string) => z.string().trim().min(1, mesaj).max(50, "En fazla 50 karakter.").transform(isimNormalle);

export const aracSemasi = z.object({
  arac_id: hesapIdOpsiyonel,
  marka: aracAdi("Marka girin."),
  model: aracAdi("Model girin."),
  // Boşluksuz büyük harf: 34ABC123 (il kodu + 1-3 harf + 2-4 rakam).
  plaka: z
    .string()
    .trim()
    .transform((v) => v.replace(/s+/g, "").toUpperCase())
    .refine((v) => /^d{2}[A-Z]{1,3}d{2,4}$/.test(v), "Geçerli bir plaka girin (ör. 34 ABC 123)."),
  aktif: onay,
});

export const GIDER_KATEGORILERI = ["kira", "elektrik", "su", "dogalgaz", "internet_telefon", "bakim_onarim", "temizlik", "malzeme", "ekipman", "reklam", "sigorta", "vergi_sgk", "yazilim", "diger", "kdv", "stopaj", "sgk_primleri", "damga_vergisi", "emlak_vergisi", "arac_vergisi", "bagkur_primleri", "muhasebe_ucreti", "trafik_cezasi", "gec_odeme_faizi", "gecici_vergi", "kurumlar_vergisi"] as const;
const ARAC_KATEGORILERI: readonly string[] = ["bakim_onarim", "arac_vergisi", "trafik_cezasi"];
const GIDER_YONTEMLERI = ["nakit", "havale", "kredi_karti"] as const;

export const giderSemasi = z
  .object({
    tur: z.enum(["gider", "kamusal"]).default("gider"),
    kategori: z.enum(GIDER_KATEGORILERI, { error: "Kategori seçin." }),
    tutar: tlTutar("Geçerli bir tutar girin (ör. 1.250,00).").refine((k) => k > 0, "Tutar sıfırdan büyük olmalı."),
    kdv_orani: tamSayiOpsiyonel(0, 100, "KDV oranı 0-100 olmalı."),
    tarih: gunOpsiyonel,
    tedarikci: isimOpsiyonel,
    aciklama: metinOpsiyonel(300),
    belge_no: metinOpsiyonel(60),
    durum: z.enum(["odendi", "bekliyor"]).default("odendi"),
    vade: gunOpsiyonel,
    yontem: z.enum(GIDER_YONTEMLERI).optional().or(z.literal("").transform(() => undefined)),
    banka_hesap_id: hesapIdOpsiyonel,
    arac_id: hesapIdOpsiyonel,
    donem_yil: tamSayiOpsiyonel(2000, 2100, "Dönem yılı geçerli olmalı."),
    donem_ay: tamSayiOpsiyonel(1, 12, "Dönem ayı 1-12 olmalı."),
    anahtar: z.uuid(),
  })
  .superRefine((v, ctx) => {
    if (v.tur === "kamusal" && (!v.donem_yil || !v.donem_ay)) ctx.addIssue({ code: "custom", path: ["donem_ay"], message: "Kamu ödemesi için ait olduğu dönemi (ay ve yıl) seçin." });
    if (v.arac_id && !ARAC_KATEGORILERI.includes(v.kategori)) ctx.addIssue({ code: "custom", path: ["arac_id"], message: "Araç yalnız bakım/onarım, motorlu taşıtlar vergisi ve trafik cezasında seçilir." });
    if (v.durum === "odendi" && !v.yontem) ctx.addIssue({ code: "custom", path: ["yontem"], message: "Ödeme yöntemini seçin." });
    if (v.durum === "bekliyor" && !v.vade) ctx.addIssue({ code: "custom", path: ["vade"], message: "Bekleyen gider için vade tarihi girin." });
    if (v.banka_hesap_id && v.yontem !== "havale" && v.yontem !== "kredi_karti") ctx.addIssue({ code: "custom", path: ["banka_hesap_id"], message: "Banka hesabı yalnız havale veya kredi kartı ile seçilir." });
  });

export const giderOdeSemasi = z.object({
  gider_id: z.uuid(),
  yontem: z.enum(GIDER_YONTEMLERI, { error: "Ödeme yöntemini seçin." }),
  banka_hesap_id: hesapIdOpsiyonel,
});

export const giderIptalSemasi = z.object({ gider_id: z.uuid(), neden: z.string().trim().min(3, "İptal nedenini yazın.").max(300) });

/** Kasa/banka manuel hareketi. `hesap` ve `hedef`: "kasa" veya bir banka hesabının UUID'si. */
const hesapSecimi = z.string().trim().refine((v) => v === "kasa" || z.uuid().safeParse(v).success, "Hesap seçin.");
export const kasaBankaHareketSemasi = z
  .object({
    tip: z.enum(["giren", "cikan", "transfer"], { error: "Hareket türünü seçin." }),
    hesap: hesapSecimi,
    hedef: z.string().trim().optional(),
    tutar: tlTutar("Geçerli bir tutar girin.").refine((k) => k > 0, "Tutar sıfırdan büyük olmalı."),
    karsi_taraf: isimOpsiyonel,
    karsi_banka: isimOpsiyonel,
    karsi_iban: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || ibanGecerli(v), "Geçerli bir TR IBAN girin (TR ile başlayan 26 karakter).")
      .transform((v) => (v ? ibanTemizle(v) : null)),
    aciklama: metinOpsiyonel(300),
    tarih: gunOpsiyonel,
    anahtar: z.uuid(),
  })
  .superRefine((v, ctx) => {
    if (v.tip === "transfer") {
      if (!v.hedef || !(v.hedef === "kasa" || z.uuid().safeParse(v.hedef).success)) ctx.addIssue({ code: "custom", path: ["hedef"], message: "Hedef hesabı seçin." });
      else if (v.hedef === v.hesap) ctx.addIssue({ code: "custom", path: ["hedef"], message: "Kaynak ve hedef hesap aynı olamaz." });
    }
  });

/** İşaretli TL tutarı (kuruş): "-" ile eksi girilebilir; boş / yalnız "-" → 0. */
const isaretliTutar = z
  .string()
  .trim()
  .refine((v) => /^-?/.test(v) && (tlYaziKurusa(v.replace(/^-/, "")) !== null || v === "" || v === "-"), "Geçerli bir tutar girin.")
  .transform((v) => {
    if (v === "" || v === "-") return 0;
    const eksi = v.startsWith("-");
    const kurus = tlYaziKurusa(v.replace(/^-/, "")) ?? 0;
    return eksi ? -kurus : kurus;
  });

export const acilisBakiyeSemasi = z.object({
  hesap: hesapSecimi,
  tutar: isaretliTutar,
});

/** Kasa Kontrol: başlangıç tutarı (eksi olabilir) ve işaretli dengeleme bedeli (+ kasaya ekler, − kasadan düşer; sıfır olamaz). */
export const kasaBaslangicSemasi = z.object({ tutar: isaretliTutar });
export const kasaDengelemeSemasi = z.object({
  tutar: isaretliTutar.refine((k) => k !== 0, "Dengeleme bedeli sıfır olamaz (eksi değer kasadan düşer)."),
  aciklama: metinOpsiyonel(300),
  anahtar: z.uuid(),
});

export const iskontoOranlariSemasi = z.object({
  standart: yuzdeAlani,
  gold: yuzdeAlani,
  vip: yuzdeAlani,
  platinum: yuzdeAlani,
});

export const faturaOlusturSemasi = z.object({ hareket_idleri: z.array(z.uuid()).min(1, "En az bir borç satırı seçin.") });
export const faturaIptalSemasi = z.object({ fatura_id: z.uuid(), neden: z.string().trim().min(3, "İptal nedenini yazın.").max(300) });

/** İlk hata mesajını döndürür (form üstünde tek satır gösterim için). */
export function ilkHata(hata: z.ZodError): string {
  return hata.issues[0]?.message ?? "Girdi hatalı.";
}

// ---------------------------------------------------------------------------------------------------------
// Müşteri kartı > Talep ve Öneriler
export const TALEP_TURLERI = ["ders_talebi", "ders_iptali", "ders_ertele", "antrenor_yorumu", "ders_yorumu"] as const;

export const talepTuruSemasi = z.enum(TALEP_TURLERI, { error: "Bir talep türü seçin." });

export const dersTalebiSemasi = z.object({
  musteri_id: z.uuid(),
  tarih: z
    .string()
    .trim()
    .refine((v) => takvimTarihiGecerli(v), "Geçerli bir tercih tarihi girin."),
  saat: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Geçerli bir saat girin.")
    .transform((v) => (v ? v : null)),
  antrenor_id: uuidOpsiyonel,
  not: metinOpsiyonel(500),
});

export const talepDersSemasi = z.object({ musteri_id: z.uuid(), ders_id: z.uuid({ error: "Ders seçin." }) });

export const yorumSemasi = z.object({
  musteri_id: z.uuid(),
  tur: z.enum(["antrenor_yorumu", "ders_yorumu"]),
  ders_id: z.uuid({ error: "Ders seçin." }),
  puan: z.coerce.number({ error: "Bir puan seçin." }).int("Bir puan seçin.").min(1, "Bir puan seçin.").max(5, "Bir puan seçin."),
  yorum: z.string().trim().min(1, "Yorum metnini yazın.").max(1000, "Yorum en fazla 1000 karakter olabilir."),
});

export const talepYanitSemasi = z.object({
  musteri_id: z.uuid(),
  talep_id: z.uuid(),
  durum: z.enum(["planlandi", "reddedildi"], { error: "Geçersiz durum." }),
});

export const riskBayragiEkleSemasi = z.object({
  musteri_id: z.uuid(),
  tip: z.enum(["kalp_tansiyon", "diyabet", "astim", "alerji", "hamilelik", "epilepsi", "kalp_pili", "metal_implant", "sakatlik", "diger"], { error: "Risk türünü seçin." }),
  seviye: z.enum(["yuksek", "orta", "dusuk"], { error: "Risk seviyesini seçin." }),
  aciklama: metinOpsiyonel(200),
});

export const riskBayragiKaldirSemasi = z.object({ musteri_id: z.uuid(), risk_id: z.uuid() });

/** Fatura için eksik alıcı bilgisi tamamlama: yalnız doldurulan alanlar yazılır (boş alanlar var olan değeri ezmez). */
export const faturaBilgisiSemasi = z
  .object({
    musteri_id: z.uuid(),
    eposta: epostaOpsiyonel,
    tc_kimlik_no: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || tcKimlikGecerli(v), "Geçerli bir T.C. kimlik numarası girin.")
      .transform((v) => v || null),
    il: metinOpsiyonel(100),
    ilce: metinOpsiyonel(100),
    mahalle: metinOpsiyonel(150),
    adres_detay: metinOpsiyonel(500),
  })
  .refine((v) => v.eposta || v.tc_kimlik_no || v.il || v.ilce || v.mahalle || v.adres_detay, { message: "En az bir bilgiyi doldurun." });

/** Personel kartı > Kişisel bilgiler (yönetici). Boş alan "temizle" demektir. */
export const personelKisiselSemasi = z
  .object({
    kullanici_id: z.uuid(),
    telefon: telefonOpsiyonel,
    dogum_tarihi: gunOpsiyonel,
    tc_kimlik_no: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || tcKimlikGecerli(v), "Geçerli bir T.C. kimlik numarası girin.")
      .transform((v) => v || null),
    adres_il: metinOpsiyonel(100),
    adres_ilce: metinOpsiyonel(100),
    adres_mahalle: metinOpsiyonel(150),
    adres_detay: metinOpsiyonel(500),
    acil_durum_ad_soyad: isimOpsiyonel,
    acil_durum_telefon: telefonOpsiyonel,
    dogum_yeri: metinOpsiyonel(100),
    cinsiyet: z
      .string()
      .optional()
      .transform((v) => v || null)
      .pipe(z.enum(["kadin", "erkek", "belirtilmemis"], { error: "Geçerli bir cinsiyet seçin." }).nullable()),
    pasaport_no: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^[A-Za-z0-9]{5,20}$/.test(v), "Pasaport no 5-20 harf/rakamdan oluşmalı.")
      .transform((v) => v || null),
    sgk_sicil_no: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^[0-9A-Za-z-]{4,30}$/.test(v), "SGK sicil no 4-30 karakter (harf, rakam, tire) olmalı.")
      .transform((v) => v || null),
    calisma_tipi: z
      .string()
      .optional()
      .transform((v) => v || null)
      .pipe(z.enum(["tam_zamanli", "yari_zamanli", "vardiyali", "prim_usulu"], { error: "Geçerli bir çalışma tipi seçin." }).nullable()),
  })
  .superRefine((v, ctx) => {
    if (v.dogum_tarihi && (v.dogum_tarihi > bugunIstanbulTarihi() || v.dogum_tarihi < "1900-01-01")) ctx.addIssue({ code: "custom", path: ["dogum_tarihi"], message: "Doğum tarihi geçerli bir geçmiş tarih olmalı." });
    if (Boolean(v.acil_durum_ad_soyad) !== Boolean(v.acil_durum_telefon)) ctx.addIssue({ code: "custom", path: ["acil_durum_telefon"], message: "Acil durum kişisi için ad ve telefon birlikte girilmelidir." });
  });

export const PERSONEL_BELGE_TURLERI = ["sertifika", "ilk_yardim", "saglik_raporu", "sozlesme", "diger"] as const;
export const personelBelgeSemasi = z
  .object({
    kullanici_id: z.uuid(),
    tur: z.enum(PERSONEL_BELGE_TURLERI, { error: "Belge türünü seçin." }),
    ad: z.string().trim().min(2, "Belge adını yazın.").max(150),
    veren_kurum: metinOpsiyonel(150),
    belge_no: metinOpsiyonel(60),
    verilis_tarihi: gunOpsiyonel,
    gecerlilik_bitis: gunOpsiyonel,
    not_metni: metinOpsiyonel(300),
  })
  .refine((v) => !v.verilis_tarihi || !v.gecerlilik_bitis || v.gecerlilik_bitis >= v.verilis_tarihi, { path: ["gecerlilik_bitis"], message: "Geçerlilik bitişi veriliş tarihinden önce olamaz." });
export const personelBelgeKaldirSemasi = z.object({ kullanici_id: z.uuid(), belge_id: z.uuid() });

/** Herkese açık iş başvuru formu. */
export const isBasvurusuSemasi = z.object({
  ad_soyad: isimAlani,
  telefon: telefonAlani,
  eposta: epostaOpsiyonel,
  dogum_tarihi: gunOpsiyonel,
  basvurulan_pozisyon: metinOpsiyonel(100),
  deneyim: metinOpsiyonel(1000),
  sertifikalar: metinOpsiyonel(500),
  kvkk: onay.refine((v) => v, "Devam etmek için aydınlatma metnini okuduğunuzu onaylayın."),
  website: z.string().optional(),
});

export const isBasvurusuSonucSemasi = z.object({
  basvuru_id: z.uuid(),
  durum: z.enum(["olumlu", "olumsuz"], { error: "Sonucu seçin." }),
  not_metni: metinOpsiyonel(500),
});

export const PUANTAJ_DURUMLARI = ["geldi", "gelmedi", "raporlu", "yarim_gun"] as const;
export const puantajKaydetSemasi = z
  .object({
    kullanici_id: z.uuid(),
    tarih: z.string().trim().refine((v) => takvimTarihiGecerli(v), "Geçerli bir tarih girin."),
    durum: z.enum(PUANTAJ_DURUMLARI, { error: "Durumu seçin." }),
    giris: saatOpsiyonel,
    cikis: saatOpsiyonel,
    fazla_mesai_dk: tamSayiOpsiyonel(0, 960, "Fazla mesai 0-960 dakika olmalı."),
    not_metni: metinOpsiyonel(200),
  })
  .refine((v) => !v.giris || !v.cikis || v.cikis > v.giris, { path: ["cikis"], message: "Çıkış saati girişten sonra olmalı." });
export const puantajSilSemasi = z.object({ kullanici_id: z.uuid(), tarih: z.string().trim().refine(takvimTarihiGecerli, "Geçerli bir tarih girin.") });

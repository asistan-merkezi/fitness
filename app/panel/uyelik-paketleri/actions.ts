"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formVerisi, ilkHata, paketSemasi } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { MUSTERI_ROLLERI, PAKET_GORUNTULEME_ROLLERI, YONETICI_ROLLERI } from "@/lib/panel/roller";
import { musteriAdlariGetir } from "@/lib/panel/musteri-adlari";

type Onceki = EylemSonucu | null;

/** Paket oluştur/güncelle (yalnız işletme yöneticisi). `paket_id` doluysa günceller. */
export async function paketKaydet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const girdi = formVerisi(formData);
  const paketId = typeof girdi.paket_id === "string" && girdi.paket_id ? girdi.paket_id : null;
  if (paketId && !z.uuid().safeParse(paketId).success) return hata("Geçersiz paket.");

  const ayristirma = paketSemasi.safeParse(girdi);
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const satir = {
    ad: v.ad,
    tur: v.tur,
    kapsam: v.kapsam,
    sure_gun: v.tur === "sure" ? v.sure_gun : null,
    seans_sayisi: v.tur === "seans" ? v.seans_sayisi : null,
    gecerlilik_gun: v.tur === "seans" ? v.gecerlilik_gun : null,
    fiyat_kurus: v.fiyat,
    kdv_orani: v.kdv_orani,
    dondurma_izni: v.dondurma_izni,
    azami_dondurma_gun: v.dondurma_izni ? (v.azami_dondurma_gun ?? 0) : 0,
    dondurma_ucret_kurus: v.dondurma_izni ? v.dondurma_ucret : 0,
    satis_bitis_tarihi: v.satis_bitis_tarihi,
    aktif: v.aktif,
  };

  if (paketId) {
    const { data, error } = await oturum.supabase.from("uyelik_paketi").update(satir).eq("id", paketId).select("id");
    if (error) {
      console.error("[paketKaydet:guncelle]", error.code);
      return hata(hataMesajiCoz(error));
    }
    if (!data || data.length === 0) return hata("Paket bulunamadı.");
  } else {
    const { error } = await oturum.supabase.from("uyelik_paketi").insert({ ...satir, isletme_id: oturum.kullanici.isletme_id });
    if (error) {
      console.error("[paketKaydet:ekle]", error.code);
      return hata(hataMesajiCoz(error));
    }
  }

  revalidatePath("/panel/uyelik-paketleri");
  return basari(paketId ? "Paket güncellendi." : "Paket oluşturuldu.");
}

/** Paketi satışa aç / kapat (yalnız işletme yöneticisi). Kapalı paket arşive geçer; mevcut üyelikler etkilenmez. */
export async function paketAktifDegistir(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const a = z.object({ paket_id: z.uuid(), aktif: z.enum(["true", "false"]) }).safeParse(formVerisi(formData));
  if (!a.success) return hata("Geçersiz istek.");

  const aktif = a.data.aktif === "true";
  const { data, error } = await oturum.supabase.from("uyelik_paketi").update({ aktif }).eq("id", a.data.paket_id).select("id");
  if (error) {
    console.error("[paketAktifDegistir]", error.code);
    return hata(hataMesajiCoz(error));
  }
  if (!data || data.length === 0) return hata("Paket bulunamadı.");
  revalidatePath("/panel/uyelik-paketleri");
  return basari(aktif ? "Paket satışa açıldı." : "Paket satışa kapatıldı.");
}

export type PaketUyesi = { musteri_id: string; ad_soyad: string; baslangic_tarihi: string; bitis_tarihi: string | null; toplam_hak: number | null; kalan_hak: number | null; gecerli_durum: string };

/** Paketi satın almış üyelikler (yönetici, resepsiyon, muhasebe): en yeni önce, en çok 200. Pencere açılınca çağrılır. */
export async function paketUyeleriGetir(paketId: string): Promise<PaketUyesi[]> {
  const oturum = await yetkiliOturum(PAKET_GORUNTULEME_ROLLERI);
  if (!oturum || !z.uuid().safeParse(paketId).success) return [];

  const { data } = await oturum.supabase
    .from("uyelik_gorunum")
    .select("musteri_id, baslangic_tarihi, bitis_tarihi, toplam_hak, kalan_hak, gecerli_durum")
    .eq("paket_id", paketId)
    .order("baslangic_tarihi", { ascending: false })
    .limit(200);
  const satirlar = (data ?? []) as Omit<PaketUyesi, "ad_soyad">[];
  const ad = await musteriAdlariGetir(oturum.supabase, satirlar.map((s) => s.musteri_id));
  return satirlar.map((s) => ({ ...s, ad_soyad: ad.get(s.musteri_id) ?? "Müşteri" }));
}

/** Müşteri kategorisinin önerilen iskonto yüzdesi (paket satış penceresi için). Yönetici ve resepsiyon. */
export async function musteriIskontoYuzdesi(musteriId: string): Promise<number> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum || !z.uuid().safeParse(musteriId).success) return 0;
  const { data: musteri } = await oturum.supabase.from("musteri").select("kategori").eq("id", musteriId).maybeSingle<{ kategori: string }>();
  if (!musteri) return 0;
  const { data } = await oturum.supabase.from("kategori_iskonto_orani").select("yuzde").eq("kategori", musteri.kategori).maybeSingle<{ yuzde: number }>();
  return Number(data?.yuzde ?? 0);
}

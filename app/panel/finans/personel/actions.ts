"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { formVerisi, ilkHata, isBasvurusuSonucSemasi, personelBelgeKaldirSemasi, personelBelgeSemasi, personelDonemSemasi, personelHareketSemasi, personelTopluOdemeSemasi, personelKisiselSemasi, personelProfilSemasi, puantajKaydetSemasi, puantajSilSemasi } from "@/lib/dogrulama";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { FINANS_YONETIM_ROLLERI, YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createAdminClient } from "@/lib/supabase/admin";

type Onceki = EylemSonucu | null;

/**
 * Maaş / ders primi / işe giriş-çıkış (yalnız işletme yöneticisi). İşten çıkış tarihi bugün veya geçmişse hesap
 * pasife alınır ve giriş engellenir; kayıt silinmez, geçmiş hakediş korunur.
 */
export async function personelProfilKaydet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = personelProfilSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.from("personel_profil").upsert(
    {
      kullanici_id: v.kullanici_id,
      isletme_id: oturum.kullanici.isletme_id,
      maas_kurus: v.maas,
      ders_prim_kurus: v.ders_prim,
      ise_giris_tarihi: v.ise_giris_tarihi,
      isten_cikis_tarihi: v.isten_cikis_tarihi,
    },
    { onConflict: "kullanici_id" }
  );
  if (error) {
    console.error("[personelProfilKaydet]", error.code);
    return hata(hataMesajiCoz(error));
  }

  let ek = "";
  if (v.isten_cikis_tarihi && v.isten_cikis_tarihi <= bugunIstanbulTarihi()) {
    if (v.kullanici_id === oturum.authUser.id) {
      ek = " Kendi hesabınız pasife alınmadı.";
    } else {
      const { data, error: pasifHatasi } = await oturum.supabase.from("kullanici").update({ aktif: false }).eq("id", v.kullanici_id).select("id");
      if (pasifHatasi || !data || data.length === 0) {
        console.error("[personelProfilKaydet:pasif]", pasifHatasi?.code);
        ek = " Ancak hesap pasife alınamadı; Ayarlar > Personel Tanımlama'dan pasife alın.";
      } else {
        const { error: banHatasi } = await createAdminClient().auth.admin.updateUserById(v.kullanici_id, { ban_duration: "876000h" });
        if (banHatasi) console.error("[personelProfilKaydet:ban]", banHatasi.status);
        ek = " Hesap pasife alındı, giriş engellendi.";
      }
    }
  }

  revalidatePath("/panel/finans/personel", "layout");
  revalidatePath(`/panel/finans/personel/${v.kullanici_id}`);
  return basari(`Personel bilgileri kaydedildi.${ek}`);
}

/** Biten ayın hakediş ve prim satırlarını deftere yazar (yalnız yönetici). Tekrar çalıştırmak çift kayıt üretmez. */
export async function personelDonemKapat(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = personelDonemSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { data, error } = await oturum.supabase.rpc("personel_donem_kapat", { p_ay: `${ayristirma.data.ay}-01` });
  if (error) {
    console.error("[personelDonemKapat]", error.code);
    return hata(hataMesajiCoz(error));
  }

  revalidatePath("/panel/finans/personel", "layout");
  const adet = Number(data ?? 0);
  return basari(adet > 0 ? `Dönem kapatıldı: ${adet} kayıt deftere yazıldı.` : "Bu dönem zaten kapalı veya yazılacak hakediş yok.");
}

/** Ödeme sonrası yenilenecek yollar: ödeme/avans kasa-banka-kart defterine ve raporlara düşer. */
function hareketYenile(kullaniciId?: string) {
  if (kullaniciId) revalidatePath(`/panel/finans/personel/${kullaniciId}`);
  revalidatePath("/panel/finans/personel", "layout");
  for (const yol of ["/panel/kasa", "/panel/finans/banka", "/panel/finans/kredi-karti", "/panel/finans/raporlar"]) revalidatePath(yol);
}

/**
 * Personel hesabına ödeme / avans / prim / yol / yemek / fazla mesai / kesinti kaydı (yönetici ve muhasebe; klinikteki "Ödeme Ekle").
 * Yalnız ödeme ve avans kasa/bankadan çıkar (yöntem + banka hesabı); diğerleri yalnız bakiyeyi etkiler. Defter değişmez; düzeltme yeni kayıtla yapılır.
 */
export async function personelHareketEkle(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(FINANS_YONETIM_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = personelHareketSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("personel_hesap_hareket_ekle", {
    p_kullanici_id: v.kullanici_id,
    p_tur: v.tur,
    p_tutar_kurus: v.tutar,
    p_yontem: v.yontem,
    p_aciklama: v.aciklama ?? undefined,
    p_anahtar: v.anahtar,
    p_banka_hesap_id: v.banka_hesap_id,
    p_tarih: v.tarih,
  });
  if (error) {
    console.error("[personelHareketEkle]", error.code);
    return hata(hataMesajiCoz(error));
  }

  hareketYenile(v.kullanici_id);
  return basari(v.tur === "avans" ? "Avans kaydedildi." : v.tur === "odeme" ? "Ödeme kaydedildi." : "Kayıt eklendi.");
}

/** Gönderim anahtarından kalem başına KARARLI uuid üretir: aynı formun tekrar gönderilmesi çift kayıt açmaz. */
function kalemAnahtari(anahtar: string, kullaniciId: string): string {
  const h = createHash("sha256").update(`${anahtar}:${kullaniciId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Toplu ödeme (klinikteki "Toplu Ödeme (Maaş)"): seçilen her personele kendi tutarıyla AYRI kayıt yazılır.
 * Satır bazlı hata toleransı: biri başarısız olsa diğerleri kaydedilir, sonuç mesajı kaç tanesinin yazıldığını söyler.
 */
export async function personelTopluOdemeEkle(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(FINANS_YONETIM_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = personelTopluOdemeSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  let basarili = 0;
  let basarisiz = 0;
  for (const kalem of v.kalemler) {
    const { error } = await oturum.supabase.rpc("personel_hesap_hareket_ekle", {
      p_kullanici_id: kalem.kullanici_id,
      p_tur: v.tur,
      p_tutar_kurus: kalem.tutar_kurus,
      p_yontem: v.yontem,
      p_aciklama: v.aciklama ?? undefined,
      p_anahtar: kalemAnahtari(v.anahtar, kalem.kullanici_id),
      p_banka_hesap_id: v.banka_hesap_id,
      p_tarih: v.tarih,
    });
    if (error) {
      console.error("[personelTopluOdemeEkle]", error.code);
      basarisiz++;
    } else {
      basarili++;
    }
  }

  hareketYenile();
  if (basarili === 0) return hata("Hiçbir ödeme eklenemedi, lütfen tekrar deneyin.");
  return basari(basarisiz > 0 ? `${basarili} personele ödeme eklendi, ${basarisiz} tanesi başarısız oldu.` : `${basarili} personele ödeme eklendi.`);
}

/** Kişisel bilgiler (T.C. kimlik no, adres, doğum tarihi, acil durum kişisi): yalnız işletme yöneticisi yazar; özel nitelikli veri. */
export async function personelKisiselKaydet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;
  const ayristirma = personelKisiselSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("personel_kisisel_kaydet", {
    p_kullanici_id: v.kullanici_id,
    p_telefon: v.telefon ?? undefined,
    p_dogum_tarihi: v.dogum_tarihi ?? undefined,
    p_tc: v.tc_kimlik_no ?? undefined,
    p_il: v.adres_il ?? undefined,
    p_ilce: v.adres_ilce ?? undefined,
    p_mahalle: v.adres_mahalle ?? undefined,
    p_adres_detay: v.adres_detay ?? undefined,
    p_acil_ad: v.acil_durum_ad_soyad ?? undefined,
    p_acil_telefon: v.acil_durum_telefon ?? undefined,
  });
  if (error) {
    console.error("[personelKisiselKaydet]", error.code);
    return hata(hataMesajiCoz(error));
  }
  revalidatePath("/panel/finans/personel", "layout");
  return basari("Kişisel bilgiler kaydedildi.");
}

/** Belge KAYDI ekler (sertifika, ilk yardım, sağlık raporu, sözleşme); dosya yüklenmez. */
export async function personelBelgeEkle(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;
  const ayristirma = personelBelgeSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("personel_belge_ekle", {
    p_kullanici_id: v.kullanici_id,
    p_tur: v.tur,
    p_ad: v.ad,
    p_veren_kurum: v.veren_kurum ?? undefined,
    p_belge_no: v.belge_no ?? undefined,
    p_verilis: v.verilis_tarihi ?? undefined,
    p_gecerlilik_bitis: v.gecerlilik_bitis ?? undefined,
    p_not: v.not_metni ?? undefined,
  });
  if (error) {
    console.error("[personelBelgeEkle]", error.code);
    return hata(hataMesajiCoz(error));
  }
  revalidatePath("/panel/finans/personel", "layout");
  return basari("Belge kaydedildi.");
}

/** Belgeyi listeden kaldırır (silinmez, pasifleşir). */
export async function personelBelgeKaldir(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;
  const ayristirma = personelBelgeKaldirSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { error } = await oturum.supabase.rpc("personel_belge_kaldir", { p_id: ayristirma.data.belge_id });
  if (error) {
    console.error("[personelBelgeKaldir]", error.code);
    return hata(hataMesajiCoz(error));
  }
  revalidatePath("/panel/finans/personel", "layout");
  return basari("Belge kaldırıldı.");
}

/** İş başvurusunu olumsuz sonuçlandırır (olumlu sonuç, hesap oluşturulurken Ayarlar > Personel'de verilir). */
export async function isBasvurusuReddet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;
  const ayristirma = isBasvurusuSonucSemasi.safeParse({ ...formVerisi(formData), durum: "olumsuz" });
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("is_basvurusu_sonuclandir", { p_id: v.basvuru_id, p_durum: v.durum, p_not: v.not_metni ?? undefined });
  if (error) {
    console.error("[isBasvurusuReddet]", error.code);
    return hata(hataMesajiCoz(error));
  }
  revalidatePath("/panel/finans/personel", "layout");
  return basari("Başvuru olumsuz olarak kapatıldı.");
}

/** Günlük puantaj kaydı (yalnız yönetici). Hakedişi kapatılmış aya ve onaylı izin gününe yazılamaz. */
export async function puantajKaydet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;
  const ayristirma = puantajKaydetSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("personel_puantaj_kaydet", {
    p_kullanici_id: v.kullanici_id,
    p_tarih: v.tarih,
    p_durum: v.durum,
    p_giris: v.giris ?? undefined,
    p_cikis: v.cikis ?? undefined,
    p_fazla_mesai_dk: v.fazla_mesai_dk ?? 0,
    p_not: v.not_metni ?? undefined,
  });
  if (error) {
    console.error("[puantajKaydet]", error.code);
    return hata(hataMesajiCoz(error));
  }
  revalidatePath("/panel/finans/personel", "layout");
  return basari("Puantaj kaydedildi.");
}

/** Personel listesinden tek tıkla Giriş / Çıkış (yalnız yönetici, BUGÜN için). Mevcut kaydı ezmez; ikinci giriş/çıkış reddedilir. */
export async function personelPuantajHizli(kullaniciId: string, tur: "giris" | "cikis", saat: string): Promise<EylemSonucu> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;
  if (!z.uuid().safeParse(kullaniciId).success || (tur !== "giris" && tur !== "cikis") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(saat)) return hata("Saat geçersiz.");

  const { error } = await oturum.supabase.rpc("personel_puantaj_hizli", { p_kullanici_id: kullaniciId, p_tur: tur, p_saat: saat });
  if (error) {
    console.error("[personelPuantajHizli]", error.code);
    return hata(hataMesajiCoz(error));
  }
  revalidatePath("/panel/finans/personel", "layout");
  return basari(tur === "giris" ? `Giriş kaydedildi (${saat}).` : `Çıkış kaydedildi (${saat}).`);
}

export async function puantajSil(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;
  const ayristirma = puantajSilSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { error } = await oturum.supabase.rpc("personel_puantaj_sil", { p_kullanici_id: ayristirma.data.kullanici_id, p_tarih: ayristirma.data.tarih });
  if (error) {
    console.error("[puantajSil]", error.code);
    return hata(hataMesajiCoz(error));
  }
  revalidatePath("/panel/finans/personel", "layout");
  return basari("Puantaj kaydı temizlendi.");
}

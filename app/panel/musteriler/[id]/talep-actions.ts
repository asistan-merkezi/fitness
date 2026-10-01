"use server";

import { revalidatePath } from "next/cache";
import { dersDurumuDegistir, dersTasi } from "@/app/panel/dersler/actions";
import { dersTalebiSemasi, formVerisi, ilkHata, talepDersSemasi, talepTuruSemasi, talepYanitSemasi, yorumSemasi } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

/**
 * "Talep ve Öneriler" tek gönderim eylemi (resepsiyon müşteri adına girer). Ders talebi ve yorum yeni
 * fonksiyonlara yazılır; iptal ve erteleme mevcut ders eylemlerini kullanır (hak iadesi/mesaj orada yönetilir).
 * İptal/erteleme/yorumda seçilen dersin GERÇEKTEN bu müşteriye ait olduğu burada ayrıca doğrulanır.
 */
export async function talepOneriGonder(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const veri = formVerisi(formData);
  const turAyristirma = talepTuruSemasi.safeParse(veri.tur);
  if (!turAyristirma.success) return hata(ilkHata(turAyristirma.error));
  const tur = turAyristirma.data;

  let musteriId: string;
  let mesaj = "Gönderildi.";

  if (tur === "ders_talebi") {
    const a = dersTalebiSemasi.safeParse(veri);
    if (!a.success) return hata(ilkHata(a.error));
    musteriId = a.data.musteri_id;
    const { error } = await oturum.supabase.rpc("ders_talebi_olustur", {
      p_musteri_id: a.data.musteri_id,
      p_tarih: a.data.tarih,
      p_saat: a.data.saat ?? undefined,
      p_antrenor_id: a.data.antrenor_id,
      p_not: a.data.not ?? undefined,
    });
    if (error) {
      console.error("[talepOneriGonder:talep]", error.code);
      return hata(hataMesajiCoz(error));
    }
    mesaj = "Ders talebi kaydedildi.";
  } else if (tur === "antrenor_yorumu" || tur === "ders_yorumu") {
    const a = yorumSemasi.safeParse(veri);
    if (!a.success) return hata(ilkHata(a.error));
    musteriId = a.data.musteri_id;
    if (!(await dersMusteriyeAitMi(oturum.supabase, a.data.ders_id, musteriId))) return hata("Ders bulunamadı.");
    const { error } = await oturum.supabase.rpc("musteri_yorum_ekle", {
      p_ders_id: a.data.ders_id,
      p_tur: tur,
      p_puan: a.data.puan,
      p_yorum: a.data.yorum,
    });
    if (error) {
      console.error("[talepOneriGonder:yorum]", error.code);
      return hata(hataMesajiCoz(error));
    }
    mesaj = "Yorum kaydedildi.";
  } else {
    const a = talepDersSemasi.safeParse(veri);
    if (!a.success) return hata(ilkHata(a.error));
    musteriId = a.data.musteri_id;
    if (!(await dersMusteriyeAitMi(oturum.supabase, a.data.ders_id, musteriId))) return hata("Ders bulunamadı.");

    const aktarilan = new FormData();
    aktarilan.set("ders_id", a.data.ders_id);
    if (tur === "ders_iptali") {
      aktarilan.set("hedef", "iptal");
      const sonuc = await dersDurumuDegistir(null, aktarilan);
      if (sonuc) {
        yenile(musteriId);
        return sonuc;
      }
    } else {
      aktarilan.set("baslangic", typeof veri.baslangic === "string" ? veri.baslangic : "");
      const sonuc = await dersTasi(null, aktarilan);
      if (sonuc) {
        yenile(musteriId);
        return sonuc;
      }
    }
    return hata("İşlem tamamlanamadı, lütfen tekrar deneyin.");
  }

  yenile(musteriId);
  return basari(mesaj);
}

/** Bekleyen ders talebini kapatır: "Planlandı" (ders açıldı) veya "Reddedildi". */
export async function talepYanitla(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const a = talepYanitSemasi.safeParse(formVerisi(formData));
  if (!a.success) return hata(ilkHata(a.error));

  const { error } = await oturum.supabase.rpc("ders_talebi_yanitla", { p_id: a.data.talep_id, p_durum: a.data.durum });
  if (error) {
    console.error("[talepYanitla]", error.code);
    return hata(hataMesajiCoz(error));
  }
  yenile(a.data.musteri_id);
  return basari(a.data.durum === "planlandi" ? "Talep planlandı olarak işaretlendi." : "Talep reddedildi.");
}

type Oturum = NonNullable<Awaited<ReturnType<typeof yetkiliOturum>>>;

async function dersMusteriyeAitMi(supabase: Oturum["supabase"], dersId: string, musteriId: string) {
  const { data } = await supabase.from("ders_seansi").select("id").eq("id", dersId).eq("musteri_id", musteriId).maybeSingle();
  return data !== null;
}

function yenile(musteriId: string) {
  revalidatePath(`/panel/musteriler/${musteriId}`);
  revalidatePath("/panel");
}

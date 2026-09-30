"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formVerisi, ilkHata } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

const onaySemasi = z.object({ on_kayit_id: z.uuid() });
const redSemasi = z.object({ on_kayit_id: z.uuid(), red_nedeni: z.string().trim().max(200).optional() });

type OnKayit = { id: string; ad_soyad: string; telefon: string; eposta: string | null; dogum_tarihi: string | null; ticari_ileti_izni: boolean; metin_versiyonu: string; durum: string };

/**
 * Ön kaydı onaylar: müşteri, KVKK aydınlatma (ve verildiyse ticari ileti izni) onamlarıyla, kayıt kanalı 'qr_self_servis' olarak
 * açılır; ardından ön kayıt kapatılır. Müşteri açıldıktan sonra kapatma başarısız olursa kullanıcı bilgilendirilir.
 */
export async function onKayitOnayla(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = onaySemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { data: kayit } = await oturum.supabase
    .from("musteri_on_kayit")
    .select("id, ad_soyad, telefon, eposta, dogum_tarihi, ticari_ileti_izni, metin_versiyonu, durum")
    .eq("id", ayristirma.data.on_kayit_id)
    .maybeSingle<OnKayit>();
  if (!kayit) return hata("Ön kayıt bulunamadı.");
  if (kayit.durum !== "beklemede") return hata("Bu ön kayıt zaten sonuçlandırılmış.");

  const { data: musteriId, error } = await oturum.supabase.rpc("musteri_olustur", {
    p_ad_soyad: kayit.ad_soyad,
    p_telefon: kayit.telefon,
    p_eposta: kayit.eposta,
    p_dogum_tarihi: kayit.dogum_tarihi,
    p_kayit_kanali: "qr_self_servis",
    p_onamlar: [
      { tur: "kvkk_aydinlatma", verildi: true, metin_versiyonu: kayit.metin_versiyonu },
      { tur: "ticari_ileti", verildi: kayit.ticari_ileti_izni, metin_versiyonu: kayit.metin_versiyonu },
    ],
  });
  if (error || !musteriId) {
    console.error("[onKayitOnayla:musteri]", error?.code);
    return hata(error ? hataMesajiCoz(error) : "Müşteri oluşturulamadı.");
  }

  const { error: kapatmaHatasi } = await oturum.supabase.rpc("on_kayit_sonuclandir", { p_id: kayit.id, p_durum: "onaylandi", p_musteri_id: String(musteriId) });
  if (kapatmaHatasi) {
    console.error("[onKayitOnayla:kapat]", kapatmaHatasi.code);
    return hata("Müşteri oluşturuldu ancak ön kayıt kapatılamadı; Müşteriler listesinden kontrol edin.");
  }

  revalidatePath("/panel/musteriler");
  revalidatePath("/panel/musteriler/on-kayitlar");
  redirect(`/panel/musteriler/${musteriId}`);
}

export async function onKayitReddet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = redSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { error } = await oturum.supabase.rpc("on_kayit_sonuclandir", {
    p_id: ayristirma.data.on_kayit_id,
    p_durum: "reddedildi",
    p_red_nedeni: ayristirma.data.red_nedeni || undefined,
  });
  if (error) {
    console.error("[onKayitReddet]", error.code);
    return hata(hataMesajiCoz(error));
  }

  revalidatePath("/panel/musteriler/on-kayitlar");
  return basari("Ön kayıt reddedildi.");
}

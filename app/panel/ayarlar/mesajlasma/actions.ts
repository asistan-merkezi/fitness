"use server";

import { revalidatePath } from "next/cache";
import { formVerisi, ilkHata, mesajKuraliSemasi, mesajTestSemasi } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { bilinmeyenDegiskenleriBul, sablonDoldur } from "@/lib/mesaj/degisken-dogrula";
import { kuyrukSatiriniIsle } from "@/lib/mesaj/kuyruk-isle";
import { merkezYapilandirildiMi } from "@/lib/mesaj/merkez-client";
import { tetikleyiciGetir } from "@/lib/mesaj/tetikleyiciler";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createAdminClient } from "@/lib/supabase/admin";
import { telefonE164 } from "@/lib/utils";

type Onceki = EylemSonucu | null;

const DAKIKA_CARPANI = { dakika: 1, saat: 60, gun: 1440 } as const;

/**
 * Bir tetikleyicinin kuralını kaydeder (yalnız işletme yöneticisi). Katalog kodda sabit olduğundan satır ilk kaydedildiğinde
 * oluşur (upsert). Metinde kataloğun izin vermediği değişken varsa reddedilir.
 */
export async function mesajKuraliKaydet(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = mesajKuraliSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const tanim = tetikleyiciGetir(v.tetikleyici_kodu);
  if (!tanim) return hata("Bilinmeyen tetikleyici.");

  const bilinmeyen = bilinmeyenDegiskenleriBul(v.mesaj_metni, tanim.gecerliDegiskenler);
  if (bilinmeyen.length > 0) return hata(`Bu tetikleyicide kullanılamayan değişken: ${bilinmeyen.map((d) => `{{${d}}}`).join(", ")}`);
  if (v.aktif && !v.sms_aktif && !v.whatsapp_aktif && !v.mail_aktif) return hata("Kural aktifken en az bir kanal seçin.");

  const offset = tanim.tetiklemeTipi === "zamanlanmis" && v.offset_deger !== null ? v.offset_deger * DAKIKA_CARPANI[v.offset_birim] : null;
  if (offset !== null && offset > 43200) return hata("Zamanlama en fazla 30 gün olabilir.");

  const { error } = await oturum.supabase.from("mesaj_kurali").upsert(
    {
      isletme_id: oturum.kullanici.isletme_id,
      tetikleyici_kodu: v.tetikleyici_kodu,
      aktif: v.aktif,
      sms_aktif: v.sms_aktif,
      whatsapp_aktif: v.whatsapp_aktif,
      mail_aktif: v.mail_aktif,
      mesaj_metni: v.mesaj_metni,
      zamanlama_offset_dakika: offset,
    },
    { onConflict: "isletme_id,tetikleyici_kodu" }
  );
  if (error) {
    console.error("[mesajKuraliKaydet]", error.code);
    return hata(hataMesajiCoz(error));
  }

  revalidatePath("/panel/ayarlar/mesajlasma");
  return basari("Kural kaydedildi.");
}

/** Test mesajı: örnek değerlerle doldurulmuş metin, verilen adrese (kredi düşer). Merkez bağlı değilse sıraya alınır. */
export async function mesajTestGonder(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = mesajTestSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const tanim = tetikleyiciGetir(v.tetikleyici_kodu);
  if (!tanim) return hata("Bilinmeyen tetikleyici.");

  let adres = v.adres;
  if (v.kanal !== "mail") {
    const tel = telefonE164(v.adres);
    if (!tel) return hata("Geçerli bir cep telefonu girin (ör. 0532 123 45 67).");
    adres = tel;
  } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adres)) {
    return hata("Geçerli bir e-posta adresi girin.");
  }

  // Kayıtlı metin varsa o, yoksa kataloğun önerisi; değişkenler örnek değerlerle doldurulur.
  const { data: kural } = await oturum.supabase.from("mesaj_kurali").select("mesaj_metni").eq("isletme_id", oturum.kullanici.isletme_id).eq("tetikleyici_kodu", v.tetikleyici_kodu).maybeSingle<{ mesaj_metni: string }>();
  const ornek: Record<string, string> = Object.fromEntries(tanim.gecerliDegiskenler.map((d) => [d, `[${d}]`]));
  const metin = sablonDoldur(kural?.mesaj_metni?.trim() || tanim.varsayilanMesajMetni, ornek);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mesaj_kuyrugu")
    .insert({
      isletme_id: oturum.kullanici.isletme_id,
      tetikleyici_kodu: v.tetikleyici_kodu,
      kanal: v.kanal,
      alici_tipi: "personel",
      alici_id: oturum.authUser.id,
      alici_adres: adres,
      gonderilecek_metin: `[TEST] ${metin}`,
      idempotency_anahtari: `test:${oturum.authUser.id}:${crypto.randomUUID()}`,
      test_mi: true,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error || !data) {
    console.error("[mesajTestGonder]", error?.code);
    return hata("Test mesajı sıraya alınamadı.");
  }

  if (!merkezYapilandirildiMi()) {
    revalidatePath("/panel/ayarlar/mesajlasma");
    return basari("Test mesajı sıraya alındı. Mesaj altyapısı (Asistan Merkezi) henüz bağlı olmadığı için gönderilmedi.");
  }
  const sonuc = await kuyrukSatiriniIsle(admin, data.id);
  revalidatePath("/panel/ayarlar/mesajlasma");
  if (sonuc.durum === "gonderildi") return basari("Test mesajı gönderildi.");
  if (sonuc.durum === "beklemede") return basari("Test mesajı sıraya alındı; geçici bir sorun nedeniyle kısa süre sonra yeniden denenecek.");
  return hata(`Test mesajı gönderilemedi (${sonuc.hataMesaji ?? sonuc.durum}).`);
}

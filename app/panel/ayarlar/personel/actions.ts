"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formVerisi, ilkHata } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createAdminClient } from "@/lib/supabase/admin";
import { isimNormalle } from "@/lib/utils";

type Onceki = EylemSonucu | null;

const ROLLER = ["isletme_admin", "resepsiyon", "antrenor", "muhasebe"] as const;

const personelEkleSemasi = z.object({
  ad_soyad: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı.").max(100).transform(isimNormalle),
  eposta: z.email("Geçerli bir e-posta girin.").max(254),
  sifre: z
    .string()
    .min(10, "Şifre en az 10 karakter olmalı.")
    .max(72, "Şifre en fazla 72 karakter olabilir.")
    .refine((s) => /[a-zA-Z]/.test(s) && /\d/.test(s), "Şifre harf ve rakam içermeli."),
  rol: z.enum(ROLLER, { error: "Rol seçin." }),
});

/**
 * Personel hesabı oluşturur (yalnız işletme yöneticisi). Auth kullanıcısı servis rolüyle açılır
 * (RLS'i atlar) — bu yüzden işletme ve rol sunucuda OTURUMDAN alınır, istemciden ASLA.
 */
export async function personelEkle(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = personelEkleSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const admin = createAdminClient();
  const { data: olusan, error: authHatasi } = await admin.auth.admin.createUser({
    email: v.eposta,
    password: v.sifre,
    email_confirm: true,
  });
  if (authHatasi || !olusan.user) {
    console.error("[personelEkle:auth]", authHatasi?.code ?? authHatasi?.status);
    return hata(/already|registered|exists/i.test(authHatasi?.message ?? "") ? "Bu e-posta adresiyle zaten bir hesap var." : "Hesap oluşturulamadı.");
  }

  const { error: profilHatasi } = await admin.from("kullanici").insert({
    id: olusan.user.id,
    isletme_id: oturum.kullanici.isletme_id,
    ad_soyad: v.ad_soyad,
    rol: v.rol,
  });
  if (profilHatasi) {
    console.error("[personelEkle:profil]", profilHatasi.code);
    await admin.auth.admin.deleteUser(olusan.user.id); // yarım kalan hesabı geri al
    return hata("Personel kaydı oluşturulamadı.");
  }

  revalidatePath("/panel/ayarlar/personel");
  return basari(`${v.ad_soyad} için hesap oluşturuldu. Şifreyi kişiye güvenli bir yolla iletin.`);
}

const personelGuncelleSemasi = z.object({
  kullanici_id: z.uuid(),
  rol: z.enum(ROLLER),
  aktif: z.string().optional().transform((v) => v === "on"),
});

/** Rol / aktiflik değişikliği. Pasife alınan personelin oturum açması engellenir (ban). */
export async function personelGuncelle(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = personelGuncelleSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  if (v.kullanici_id === oturum.authUser.id) return hata("Kendi rolünüzü veya durumunuzu değiştiremezsiniz.");

  // RLS: yalnız kendi işletmesinin kullanıcıları görünür/güncellenir; tetikleyici yetki yükseltmeyi engeller.
  const { data, error } = await oturum.supabase.from("kullanici").update({ rol: v.rol, aktif: v.aktif }).eq("id", v.kullanici_id).select("id");
  if (error) {
    console.error("[personelGuncelle]", error.code);
    return hata(hataMesajiCoz(error));
  }
  if (!data || data.length === 0) return hata("Personel bulunamadı.");

  // Güncelleme kendi işletmemizdeki kullanıcıda başarılı oldu → auth tarafında da oturumu kapat/aç.
  const admin = createAdminClient();
  const { error: banHatasi } = await admin.auth.admin.updateUserById(v.kullanici_id, { ban_duration: v.aktif ? "none" : "876000h" });
  if (banHatasi) console.error("[personelGuncelle:ban]", banHatasi.status);

  revalidatePath("/panel/ayarlar/personel");
  return basari("Personel güncellendi.");
}

const isletmeAdiSemasi = z.object({ ad: z.string().trim().min(2, "İşletme adı en az 2 karakter olmalı.").max(100).transform(isimNormalle) });

export async function isletmeAdiGuncelle(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = isletmeAdiSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));

  const { data, error } = await oturum.supabase.from("isletme").update({ ad: ayristirma.data.ad }).eq("id", oturum.kullanici.isletme_id).select("id");
  if (error) {
    console.error("[isletmeAdiGuncelle]", error.code);
    return hata(hataMesajiCoz(error));
  }
  if (!data || data.length === 0) return hata("İşletme bulunamadı.");

  revalidatePath("/panel/ayarlar/personel");
  return basari("İşletme adı güncellendi.");
}

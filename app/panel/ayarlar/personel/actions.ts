"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formVerisi, ilkHata } from "@/lib/dogrulama";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { POZISYON_SELECT, type Pozisyon } from "@/lib/panel/pozisyon";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createAdminClient } from "@/lib/supabase/admin";
import { isimNormalle } from "@/lib/utils";

type Onceki = EylemSonucu | null;
type Oturum = NonNullable<Awaited<ReturnType<typeof yetkiliOturum>>>;

const ROLLER = ["isletme_admin", "resepsiyon", "antrenor", "muhasebe"] as const;

/** Boş gelen seçim "yok" demektir; dolu ise geçerli bir UUID olmalıdır. */
const pozisyonSecimi = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.uuid({ error: "Geçersiz pozisyon." }).optional());

/** Atanabilir (aktif + sistem erişimi açık) pozisyonu getirir; RLS yalnız kendi işletmesini gösterir. */
async function atanabilirPozisyon(oturum: Oturum, pozisyonId: string): Promise<Pozisyon | null> {
  const { data } = await oturum.supabase.from("pozisyonlar").select(POZISYON_SELECT).eq("id", pozisyonId).eq("aktif", true).eq("sistem_erisimi", true).maybeSingle<Pozisyon>();
  return data ?? null;
}

const personelEkleSemasi = z.object({
  ad_soyad: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı.").max(100).transform(isimNormalle),
  eposta: z.email("Geçerli bir e-posta girin.").max(254),
  sifre: z
    .string()
    .min(10, "Şifre en az 10 karakter olmalı.")
    .max(72, "Şifre en fazla 72 karakter olabilir.")
    .refine((s) => /[a-zA-Z]/.test(s) && /\d/.test(s), "Şifre harf ve rakam içermeli."),
  pozisyon_id: pozisyonSecimi,
  rol: z.enum(ROLLER).optional(),
});

/**
 * Personel hesabı oluşturur (yalnız işletme yöneticisi). Auth kullanıcısı servis rolüyle açılır
 * (RLS'i atlar) — bu yüzden işletme ve rol sunucuda OTURUMDAN/POZİSYONDAN alınır, istemciden ASLA.
 * Pozisyon seçildiyse rol pozisyonun varsayılan rolüdür; seçilmediyse formdaki rol kullanılır.
 */
export async function personelEkle(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = personelEkleSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  let rol = v.rol;
  if (v.pozisyon_id) {
    const pozisyon = await atanabilirPozisyon(oturum, v.pozisyon_id);
    if (!pozisyon) return hata("Seçilen pozisyon aktif değil veya sistem erişimi kapalı.");
    rol = pozisyon.varsayilan_rol;
  }
  if (!rol) return hata("Rol seçin.");

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
    rol,
    pozisyon_id: v.pozisyon_id ?? null,
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
  pozisyon_id: pozisyonSecimi,
  rol: z.enum(ROLLER).optional(),
  aktif: z.string().optional().transform((v) => v === "on"),
});

/** Pozisyon / rol / aktiflik değişikliği. Pasife alınan personelin oturum açması engellenir (ban). */
export async function personelGuncelle(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = personelGuncelleSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  if (v.kullanici_id === oturum.authUser.id) return hata("Kendi rolünüzü veya durumunuzu değiştiremezsiniz.");

  // Mevcut pozisyonunda kalan kişi için pozisyon artık pasif olsa da atama korunur; değişiklikte yenisi doğrulanır.
  const { data: mevcut } = await oturum.supabase.from("kullanici").select("pozisyon_id").eq("id", v.kullanici_id).maybeSingle<{ pozisyon_id: string | null }>();
  if (!mevcut) return hata("Personel bulunamadı.");

  let rol = v.rol;
  const pozisyonDegisti = (v.pozisyon_id ?? null) !== mevcut.pozisyon_id;
  if (v.pozisyon_id) {
    const { data: pozisyon } = await oturum.supabase.from("pozisyonlar").select(POZISYON_SELECT).eq("id", v.pozisyon_id).maybeSingle<Pozisyon>();
    if (!pozisyon) return hata("Pozisyon bulunamadı.");
    if (pozisyonDegisti && (!pozisyon.aktif || !pozisyon.sistem_erisimi)) return hata("Seçilen pozisyon aktif değil veya sistem erişimi kapalı.");
    rol = pozisyon.varsayilan_rol;
  }
  if (!rol) return hata("Rol seçin.");

  // RLS: yalnız kendi işletmesinin kullanıcıları görünür/güncellenir; tetikleyiciler yetki yükseltmeyi ve rol-pozisyon uyumsuzluğunu engeller.
  const { data, error } = await oturum.supabase.from("kullanici").update({ rol, aktif: v.aktif, pozisyon_id: v.pozisyon_id ?? null }).eq("id", v.kullanici_id).select("id");
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

const pozisyonDegistirSemasi = z.object({ id: z.uuid(), alan: z.enum(["aktif", "sistem_erisimi"]), deger: z.boolean() });

/** Pozisyonu aç/kapat veya sistem erişimini aç/kapat (yalnız işletme yöneticisi). Bağlı aktif personeli olan pozisyon kapatılamaz. */
export async function pozisyonDegistir(pozisyonId: string, alan: "aktif" | "sistem_erisimi", deger: boolean): Promise<EylemSonucu> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = pozisyonDegistirSemasi.safeParse({ id: pozisyonId, alan, deger });
  if (!ayristirma.success) return hata("Geçersiz istek.");

  const { data, error } = await oturum.supabase.from("pozisyonlar").update({ [alan]: deger }).eq("id", pozisyonId).select("id");
  if (error) {
    console.error("[pozisyonDegistir]", error.code);
    return hata(hataMesajiCoz(error));
  }
  if (!data || data.length === 0) return hata("Pozisyon bulunamadı.");

  revalidatePath("/panel/ayarlar/personel");
  return basari(alan === "aktif" ? (deger ? "Pozisyon aktifleştirildi." : "Pozisyon pasife alındı.") : deger ? "Sistem erişimi açıldı." : "Sistem erişimi kapatıldı.");
}

const ozelPozisyonSemasi = z.object({
  grup: z.string().trim().min(1, "Departman seçin.").max(100),
  ad: z.string().trim().min(2, "Ünvan en az 2 karakter olmalı.").max(100, "Ünvan en fazla 100 karakter olabilir."),
});

/** Özel pozisyon ekler: seçilen departmandaki ilk pozisyonun rol/ücret/puantaj ayarlarını devralır; pasif ve erişimsiz başlar. */
export async function ozelPozisyonOlustur(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = ozelPozisyonSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const { grup, ad } = ayristirma.data;

  const { data: ornek } = await oturum.supabase
    .from("pozisyonlar")
    .select("varsayilan_rol, ucret_tipi, puantaj_modu")
    .eq("grup", grup)
    .order("sira")
    .limit(1)
    .maybeSingle<Pick<Pozisyon, "varsayilan_rol" | "ucret_tipi" | "puantaj_modu">>();
  if (!ornek) return hata("Departman bulunamadı.");

  const { error } = await oturum.supabase.from("pozisyonlar").insert({
    isletme_id: oturum.kullanici.isletme_id,
    ad,
    grup,
    sira: 999,
    varsayilan_rol: ornek.varsayilan_rol,
    ucret_tipi: ornek.ucret_tipi,
    puantaj_modu: ornek.puantaj_modu,
    ozel_mi: true,
  });
  if (error) {
    console.error("[ozelPozisyonOlustur]", error.code);
    return hata(error.code === "23505" ? "Bu isimde bir pozisyon zaten var." : hataMesajiCoz(error));
  }

  revalidatePath("/panel/ayarlar/personel");
  return basari("Özel pozisyon eklendi. Kullanmak için aktifleştirin.");
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

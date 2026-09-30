"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type GirisSonucu = { success: false; message: string } | never;

const girisSemasi = z.object({
  giris_adi: z.string().trim().min(1, "Telefon/e-posta ve şifre gerekli.").max(254),
  sifre: z.string().min(1, "Telefon/e-posta ve şifre gerekli.").max(200),
});

const YONETICI_ROLLERI = ["isletme_admin", "super_admin"];

/**
 * Tek giriş alanı (klinikle aynı kural): "@" içeriyorsa e-posta → yalnız yönetici rolleri girebilir;
 * değilse telefon → personel (resepsiyon/antrenör/muhasebe). Telefon → e-posta çözümü yalnız
 * sunucuda, servis rolüyle yapılır (e-posta tarayıcıya hiç dönmez). Hata mesajları hangisinin
 * yanlış olduğunu söylemez.
 */
export async function girisYap(_onceki: GirisSonucu | null, formData: FormData): Promise<GirisSonucu | null> {
  const ayristirma = girisSemasi.safeParse({ giris_adi: formData.get("giris_adi"), sifre: formData.get("sifre") });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Telefon/e-posta ve şifre gerekli." };
  }
  const { giris_adi: girisAdi, sifre } = ayristirma.data;

  const supabase = await createClient();

  if (girisAdi.includes("@")) {
    const { error } = await supabase.auth.signInWithPassword({ email: girisAdi, password: sifre });
    if (error) return { success: false, message: "E-posta veya şifre hatalı." };

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user?.id ?? "").maybeSingle<{ rol: string }>();
    if (!kullanici || !YONETICI_ROLLERI.includes(kullanici.rol)) {
      await supabase.auth.signOut();
      return { success: false, message: "Bu hesap yalnızca telefon numarasıyla giriş yapabilir." };
    }
    redirect("/panel");
  }

  const { data: eposta } = await createAdminClient().rpc("personel_giris_epostasi", { p_telefon: girisAdi });
  if (!eposta) return { success: false, message: "Telefon veya şifre hatalı." };

  const { error } = await supabase.auth.signInWithPassword({ email: eposta as string, password: sifre });
  if (error) return { success: false, message: "Telefon veya şifre hatalı." };

  redirect("/panel");
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type GirisSonucu = { success: false; message: string } | never;

const girisSemasi = z.object({
  eposta: z.string().trim().email("Geçerli bir e-posta girin.").max(254),
  sifre: z.string().min(1, "Şifre gerekli.").max(200),
});

export async function girisYap(
  _onceki: GirisSonucu | null,
  formData: FormData
): Promise<GirisSonucu | null> {
  const ayristirma = girisSemasi.safeParse({
    eposta: formData.get("eposta"),
    sifre: formData.get("sifre"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "E-posta ve şifre gerekli." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: ayristirma.data.eposta,
    password: ayristirma.data.sifre,
  });

  // Hangisinin yanlış olduğunu söyleme (kullanıcı adı numaralandırma koruması).
  if (error) {
    return { success: false, message: "E-posta veya şifre hatalı." };
  }

  redirect("/panel");
}

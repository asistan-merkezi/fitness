"use server";

import { revalidatePath } from "next/cache";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";

const TUM_ROLLER = ["isletme_admin", "resepsiyon", "muhasebe", "antrenor"] as const;

/**
 * Kişi KENDİ giriş/çıkışını kendi oturumuyla yazar (ayrı PIN/şifre yok). Kimlik oturumdan alınır; saat istemciden gelmez,
 * veritabanı İstanbul saatini kendisi yazar. Kurallar (ikinci giriş yok, çıkış için önce giriş, izinli/kapalı ay reddi) RPC'dedir.
 */
export async function kendiPuantajiniYaz(tur: "giris" | "cikis"): Promise<EylemSonucu> {
  const oturum = await yetkiliOturum(TUM_ROLLER);
  if (!oturum) return YETKISIZ;
  if (tur !== "giris" && tur !== "cikis") return hata("Geçersiz işlem.");

  const { error } = await oturum.supabase.rpc("personel_puantaj_kendi", { p_tur: tur });
  if (error) {
    console.error("[kendiPuantajiniYaz]", error.code);
    return hata(hataMesajiCoz(error));
  }
  revalidatePath("/panel/hakedisim");
  revalidatePath("/panel/finans/personel", "layout");
  return basari(tur === "giris" ? "Girişiniz kaydedildi." : "Çıkışınız kaydedildi.");
}

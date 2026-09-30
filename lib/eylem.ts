import "server-only";
import { gecerliKullanici, type KullaniciRolu } from "@/lib/auth/gecerli-kullanici";
import { createClient } from "@/lib/supabase/server";

/** Tüm server action'ların döndürdüğü sonuç. `anahtar`: formun bir sonraki gönderimi için yeni idempotency anahtarı. */
export type EylemSonucu = { success: boolean; message: string; anahtar?: string };

export const YETKISIZ: EylemSonucu = {
  success: false,
  message: "Bu işlem için yetkiniz yok veya oturumunuz sona erdi. Lütfen yeniden giriş yapın.",
};

export function basari(mesaj: string): EylemSonucu {
  return { success: true, message: mesaj, anahtar: crypto.randomUUID() };
}

export function hata(mesaj: string): EylemSonucu {
  return { success: false, message: mesaj };
}

/**
 * Sayfa/action kapısı: oturum + işletme + rol. Bir KULLANICI ARAYÜZÜ kontrolüdür; asıl sınır RLS ve
 * SECURITY DEFINER fonksiyonlardaki rol kontrolüdür (skill: auth-flow).
 * super_admin tenant işlemlerine bu yollarla girmez (işletme bağlamı yok).
 */
export async function yetkiliOturum(izinli: readonly KullaniciRolu[]) {
  const oturum = await gecerliKullanici();
  const k = oturum?.kullanici;
  if (!oturum || !k?.isletme_id || !k.rol || !izinli.includes(k.rol)) {
    return null;
  }
  return {
    supabase: await createClient(),
    authUser: oturum.authUser,
    kullanici: { ...k, isletme_id: k.isletme_id, rol: k.rol },
  };
}

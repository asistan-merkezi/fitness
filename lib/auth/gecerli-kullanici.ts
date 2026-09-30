import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type KullaniciRolu = "super_admin" | "isletme_admin" | "resepsiyon" | "antrenor" | "muhasebe";

type KullaniciSatiri = {
  id: string;
  isletme_id: string | null;
  ad_soyad: string | null;
  rol: KullaniciRolu | null;
};

export type GecerliKullanici = {
  authUser: { id: string; email: string | null };
  kullanici: KullaniciSatiri | null;
};

/**
 * auth.getClaims() + kullanici SELECT'i tek yerde birleştirir. React cache()
 * ile sarılı: aynı istek/render içinde (örn. panel/layout.tsx + panel/page.tsx)
 * birden çok yerden çağrılsa da Supabase'e yalnız BİR KEZ gidilir.
 *
 * getClaims(): JWT'yi YERELDE doğrular (proje asimetrik imza anahtarı
 * kullanıyorsa Auth server'a gitmez); getUser() her seferinde gider.
 * Simetrik imza anahtarlı projelerdeki davranış için güncel Supabase
 * dokümanına bak (skill: auth-flow sürüm notu).
 *
 * `kullanici` tablosu SELECT'i (rol/isletme_id) ayrı bir sorgudur — bu veriler
 * JWT claim'i DEĞİL. Tablo henüz yoksa (şema kurulmadan önce) ya da kayıt yoksa
 * `kullanici` null döner; çağıran taraf bunu "işletmeye bağlı değil" olarak ele alır.
 */
export const gecerliKullanici = cache(async (): Promise<GecerliKullanici | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    return null;
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("id, isletme_id, ad_soyad, rol")
    .eq("id", claims.sub)
    .maybeSingle<KullaniciSatiri>();

  return {
    authUser: { id: claims.sub, email: claims.email ?? null },
    kullanici: kullanici ?? null,
  };
});

import { redirect } from "next/navigation";
import { gecerliKullanici, type KullaniciRolu } from "@/lib/auth/gecerli-kullanici";

/**
 * Sık tekrar eden rol kümeleri. `super_admin` her sayfada zaten geçer
 * (bkz. sayfaYetkisiIste), bu yüzden listelere yazılmaz.
 */
export const ROL_GRUPLARI = {
  /** Kasa/Banka/Kredi Kartı/Giderler/Raporlar: yönetim + muhasebe. */
  finansYonetim: ["isletme_admin", "muhasebe"],
  /** Cari alacaklar / fatura kesme: resepsiyon da erişir. */
  finansFatura: ["isletme_admin", "resepsiyon", "muhasebe"],
} as const satisfies Record<string, readonly KullaniciRolu[]>;

/**
 * Sayfa (Server Component) düzeyinde rol kapısı.
 *
 *  - Oturum yoksa            → /giris
 *  - Rol yok / listede değil → /panel
 *  - `super_admin` her zaman geçer.
 *
 * Bir KULLANICI ARAYÜZÜ kontrolüdür, güvenlik sınırı DEĞİL: asıl sınır RLS ve
 * SECURITY DEFINER RPC'lerdir (skill: auth-flow, saas-patterns).
 * `gecerliKullanici` React cache() ile sarılı; layout ile aynı istekte tekrar
 * sorgu atmaz.
 */
export async function sayfaYetkisiIste(izinliRoller: readonly KullaniciRolu[]) {
  const oturum = await gecerliKullanici();

  if (!oturum) {
    redirect("/giris");
  }

  const { kullanici } = oturum;
  if (!kullanici?.rol || (kullanici.rol !== "super_admin" && !izinliRoller.includes(kullanici.rol))) {
    redirect("/panel");
  }

  return { authUser: oturum.authUser, kullanici: { ...kullanici, rol: kullanici.rol } };
}

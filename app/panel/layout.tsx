import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PanelKabugu } from "@/components/panel/kabuk";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { menuIcinRol, ROL_ETIKETLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cikisYap } from "./actions";

// Panel arama motorlarında görünmez (yalnız giriş sayfası indekslenir).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const oturum = await gecerliKullanici();

  if (!oturum) {
    redirect("/giris");
  }

  const kullanici = oturum.kullanici;
  const gorunenAd = kullanici?.ad_soyad ?? oturum.authUser.email ?? "Kullanıcı";
  const rolEtiketi = kullanici?.rol ? ROL_ETIKETLERI[kullanici.rol] : null;
  const menu = menuIcinRol(kullanici?.rol).map((m) => ({ href: m.href, etiket: m.etiket, ikon: m.ikon }));

  let isletmeAdi: string | null = null;
  if (kullanici?.isletme_id) {
    const supabase = await createClient();
    const { data } = await supabase.from("isletme").select("ad").eq("id", kullanici.isletme_id).maybeSingle<{ ad: string }>();
    isletmeAdi = data?.ad ?? null;
  }

  return (
    <PanelKabugu menu={menu} kullaniciAdi={gorunenAd} rolEtiketi={rolEtiketi} isletmeAdi={isletmeAdi} cikisEylemi={cikisYap}>
      {children}
    </PanelKabugu>
  );
}

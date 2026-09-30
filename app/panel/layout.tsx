import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PanelKabugu } from "@/components/panel/kabuk";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { anaOgelerIcinRol, gruplarIcinRol } from "@/lib/panel/menu-gruplari";
import { MUSTERI_ROLLERI, ROL_ETIKETLERI } from "@/lib/panel/roller";
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
  // Kabuğa yalnız düz (serileştirilebilir) veri gider: üst linkler + ana başlıklar (alt sayfa yolları "aktif" vurgusu içindir).
  const menu = [
    ...anaOgelerIcinRol(kullanici?.rol).map((m) => ({ href: m.href, etiket: m.etiket, ikon: m.ikon, altYollar: [] as string[] })),
    ...gruplarIcinRol(kullanici?.rol).map((g) => ({ href: `/panel/${g.anahtar}`, etiket: g.etiket, ikon: g.ikon, altYollar: g.ogeler.map((o) => o.href) })),
  ];

  let isletmeAdi: string | null = null;
  if (kullanici?.isletme_id) {
    const supabase = await createClient();
    const { data } = await supabase.from("isletme").select("ad").eq("id", kullanici.isletme_id).maybeSingle<{ ad: string }>();
    isletmeAdi = data?.ad ?? null;
  }

  // Üst çubuk: yalnız yönetici/resepsiyon müşteri arar ve ders açar; bekleyen izin rozeti yalnız yöneticide.
  const musteriYetkisi = !!kullanici?.rol && (MUSTERI_ROLLERI as readonly string[]).includes(kullanici.rol);
  let bekleyenIzin: number | null = null;
  if (kullanici?.rol === "isletme_admin") {
    const supabase = await createClient();
    const { count } = await supabase.from("izin_talebi").select("id", { count: "exact", head: true }).eq("durum", "beklemede");
    bekleyenIzin = count ?? 0;
  }

  return (
    <PanelKabugu
      menu={menu}
      kullaniciAdi={gorunenAd}
      rolEtiketi={rolEtiketi}
      isletmeAdi={isletmeAdi}
      cikisEylemi={cikisYap}
      ust={{ yeniDers: musteriYetkisi, bekleyenIzin, aramaVar: musteriYetkisi }}
    >
      {children}
    </PanelKabugu>
  );
}

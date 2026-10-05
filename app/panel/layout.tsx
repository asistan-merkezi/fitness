import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PanelKabugu } from "@/components/panel/kabuk";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { bildirimKaynagiVarMi, bildirimleriGetir } from "@/lib/panel/bildirimler";
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
  let logoUrl: string | null = null;
  let logoUrlKoyu: string | null = null;
  if (kullanici?.isletme_id) {
    const supabase = await createClient();
    const { data } = await supabase.from("isletme").select("ad, logo_url, logo_url_koyu").eq("id", kullanici.isletme_id).maybeSingle<{ ad: string; logo_url: string | null; logo_url_koyu: string | null }>();
    isletmeAdi = data?.ad ?? null;
    logoUrl = data?.logo_url ?? null;
    logoUrlKoyu = data?.logo_url_koyu ?? null;
  }

  // Üst çubuk: yalnız yönetici/resepsiyon müşteri arar ve ders açar; zil = rolün her yerden gelen bekleyen bildirimleri (lib/panel/bildirimler.ts).
  const musteriYetkisi = !!kullanici?.rol && (MUSTERI_ROLLERI as readonly string[]).includes(kullanici.rol);
  const bildirimSayisi = bildirimKaynagiVarMi(kullanici?.rol) ? (await bildirimleriGetir(await createClient(), kullanici?.rol)).toplam : null;

  return (
    <PanelKabugu
      menu={menu}
      kullaniciAdi={gorunenAd}
      rolEtiketi={rolEtiketi}
      isletmeAdi={isletmeAdi}
      logoUrl={logoUrl}
      logoUrlKoyu={logoUrlKoyu}
      cikisEylemi={cikisYap}
      ust={{ yeniDers: musteriYetkisi, bildirimSayisi, aramaVar: musteriYetkisi }}
    >
      {children}
    </PanelKabugu>
  );
}

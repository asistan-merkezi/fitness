import { redirect } from "next/navigation";
import { ModulKarti } from "@/components/panel/modul-karti";
import { MENU_IKONLARI } from "@/components/panel/menu-ikonlari";
import { PageHeader } from "@/components/ui/page-header";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { gruplarIcinRol } from "@/lib/panel/menu-gruplari";

/** Ana başlık sayfalarının (Finans/Yönetim/Ayarlar/Destek) ortak görünümü: role görünen alt sayfaların kart ızgarası. */
export async function MenuGrubuSayfasi({ anahtar }: { anahtar: string }) {
  const oturum = await gecerliKullanici();
  if (!oturum) redirect("/giris");

  const grup = gruplarIcinRol(oturum.kullanici?.rol).find((g) => g.anahtar === anahtar);
  if (!grup) redirect("/panel");

  return (
    <>
      <PageHeader title={grup.etiket} icon={MENU_IKONLARI[grup.ikon]} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {grup.ogeler.map((o) => (
          <ModulKarti key={o.href} href={o.href} etiket={o.etiket} ikon={o.ikon} yakinda={o.yakinda} />
        ))}
      </div>
    </>
  );
}

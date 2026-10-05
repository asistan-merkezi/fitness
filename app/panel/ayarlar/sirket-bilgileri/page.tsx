import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { FINANS_YONETIM_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { telefonGoster } from "@/lib/utils";
import type { AracSatiri, BankaHesabiSatiri, SirketBilgileri } from "@/types/veritabani";
import { AracKarti } from "./arac-karti";
import { BankaKarti } from "./banka-karti";
import { SirketFormu } from "./sirket-formu";

export const metadata: Metadata = { title: "Şirket Bilgileri" };

const SUTUNLAR =
  "ad, unvan, il, ilce, mahalle, adres, vergi_dairesi, vergi_no, telefon, whatsapp_no, eposta, yetkili_kisi, yetkili_telefon, yetkili_eposta, logo_url, logo_url_koyu, hafta_ici_baslangic, hafta_ici_bitis, cumartesi_baslangic, cumartesi_bitis, pazar_baslangic, pazar_bitis";

function Satir({ etiket, deger }: { etiket: string; deger: string | null | undefined }) {
  return (
    <div>
      <dt className="text-muted-foreground">{etiket}</dt>
      <dd className="font-medium">{deger || "—"}</dd>
    </div>
  );
}

export default async function SirketBilgileriSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const duzenlenebilir = kullanici.rol === "isletme_admin";

  const supabase = await createClient();
  const [{ data: bilgiVeri }, { data: hesapVeri }, { data: aracVeri }] = await Promise.all([
    supabase.from("isletme").select(SUTUNLAR).eq("id", kullanici.isletme_id).maybeSingle<SirketBilgileri>(),
    supabase.from("isletme_banka_hesabi").select("id, banka_adi, sube, hesap_sahibi, iban, hesap_tipi, aktif").order("aktif", { ascending: false }).order("sira").order("banka_adi"),
    supabase.from("isletme_arac").select("id, marka, model, plaka, aktif").order("aktif", { ascending: false }).order("marka").order("plaka"),
  ]);
  const bilgiler = bilgiVeri ?? null;
  const hesaplar = (hesapVeri ?? []) as BankaHesabiSatiri[];
  const araclar = (aracVeri ?? []) as AracSatiri[];
  const saat = (bas: string | null, bit: string | null) => (bas && bit ? `${bas.slice(0, 5)} – ${bit.slice(0, 5)}` : "Kapalı");

  return (
    <>
      <PageHeader title="Şirket Bilgileri" description="Fatura ve kurumsal iletişimde kullanılan şirket profili." icon={Building2} />

      <Card>
        <CardHeader>
          <CardTitle>Kurumsal Bilgiler</CardTitle>
          {!duzenlenebilir && <CardDescription>Bu bilgileri yalnızca işletme yöneticisi düzenleyebilir.</CardDescription>}
        </CardHeader>
        <CardContent>
          {duzenlenebilir ? (
            <SirketFormu bilgiler={bilgiler} />
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Satir etiket="Şirket adı" deger={bilgiler?.ad} />
              <Satir etiket="Fatura ünvanı" deger={bilgiler?.unvan} />
              <Satir etiket="Adres" deger={[bilgiler?.mahalle, bilgiler?.adres, bilgiler?.ilce, bilgiler?.il].filter(Boolean).join(", ")} />
              <Satir etiket="Vergi dairesi / no" deger={[bilgiler?.vergi_dairesi, bilgiler?.vergi_no].filter(Boolean).join(" / ")} />
              <Satir etiket="Telefon" deger={bilgiler?.telefon ? telefonGoster(bilgiler.telefon) : null} />
              <Satir etiket="E-posta" deger={bilgiler?.eposta} />
              <Satir etiket="Hafta içi" deger={saat(bilgiler?.hafta_ici_baslangic ?? null, bilgiler?.hafta_ici_bitis ?? null)} />
              <Satir etiket="Cumartesi" deger={saat(bilgiler?.cumartesi_baslangic ?? null, bilgiler?.cumartesi_bitis ?? null)} />
              <Satir etiket="Pazar" deger={saat(bilgiler?.pazar_baslangic ?? null, bilgiler?.pazar_bitis ?? null)} />
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Araçlar</CardTitle>
          <CardDescription>İşletme envanterindeki araçlar. Bakım/onarım, motorlu taşıtlar vergisi ve trafik cezası giderlerinde araç seçilebilir. Araç silinmez, pasife alınır.</CardDescription>
        </CardHeader>
        <CardContent>
          <AracKarti araclar={araclar} duzenlenebilir={duzenlenebilir} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Banka Bilgileri</CardTitle>
          <CardDescription>Kasa/banka hareketleri, gider ve personel ödemelerinde hesap seçimini besler. Hesap silinmez, çöp kutusuyla pasife alınır (geçmiş hareketler korunur).</CardDescription>
        </CardHeader>
        <CardContent>
          <BankaKarti hesaplar={hesaplar} />
        </CardContent>
      </Card>
    </>
  );
}

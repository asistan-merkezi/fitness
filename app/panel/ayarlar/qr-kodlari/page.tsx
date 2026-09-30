import type { Metadata } from "next";
import { ClipboardEdit, LogIn, LogOut, QrCode, UserPlus } from "lucide-react";
import { QrKarti } from "@/components/panel/qr-kart";
import { EylemFormu } from "@/components/panel/eylem-formu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { siteKoku } from "@/lib/qr/isletme-bilgisi";
import { QR_KOD_TANIMLARI, type QrKodTipi } from "@/lib/qr/qr-kod-tanimlari";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { qrKodunuYenile } from "./actions";

export const metadata: Metadata = { title: "QR Kodları" };

const IKONLAR: Record<QrKodTipi, React.ReactNode> = {
  musteri_on_kayit: <UserPlus className="size-5" strokeWidth={1.5} aria-hidden />,
  anket: <ClipboardEdit className="size-5" strokeWidth={1.5} aria-hidden />,
  puantaj_giris: <LogIn className="size-5" strokeWidth={1.5} aria-hidden />,
  puantaj_cikis: <LogOut className="size-5" strokeWidth={1.5} aria-hidden />,
};

export default async function QrKodlariSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(YONETICI_ROLLERI);
  const supabase = await createClient();

  const [{ data: isletme }, { data: ayarVeri }, koku] = await Promise.all([
    supabase.from("isletme").select("qr_kisa_kod").eq("id", kullanici.isletme_id).maybeSingle<{ qr_kisa_kod: string }>(),
    supabase.from("qr_kod_ayar").select("tip, aktif").eq("isletme_id", kullanici.isletme_id),
    siteKoku(),
  ]);
  const kisaKod = isletme?.qr_kisa_kod;
  const aktifler = new Map(((ayarVeri ?? []) as { tip: QrKodTipi; aktif: boolean }[]).map((a) => [a.tip, a.aktif]));

  return (
    <>
      <PageHeader
        title="QR Kodları"
        description="Kare kodları yazdırıp salonda (resepsiyon, giriş, ilan panosu) asın. Okutan kişi giriş yapmadan ilgili formu doldurur. Bu bağlantılar herkese açıktır; kodun görünür olduğu her yerden erişilebilir. Bir formu kapatırsanız kodu okutan kişiye 'kullanım dışı' mesajı gösterilir."
        icon={QrCode}
      />

      {!kisaKod ? (
        <p role="alert" className="rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive">
          İşletme QR kodu bulunamadı. Lütfen destek ile iletişime geçin.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {QR_KOD_TANIMLARI.map((tanim) => (
            <QrKarti key={tanim.tip} tanim={tanim} kisaKod={kisaKod} koku={koku} aktif={aktifler.get(tanim.tip) ?? true} ikon={IKONLAR[tanim.tip]} />
          ))}

          <Card>
            <CardHeader>
              <CardTitle>Kodları yenile</CardTitle>
              <CardDescription>Basılı bir QR yanlış kişilerin eline geçtiyse tüm kodlar yeni bir kısa kodla yenilenir. Eski QR&apos;lar çalışmaz; yenilerini yazdırıp değiştirmeniz gerekir.</CardDescription>
            </CardHeader>
            <CardContent>
              <EylemFormu eylem={qrKodunuYenile} gonder="Kodları Yenile" yukleniyor="Yenileniyor..." varyant="destructive" boyut="sm" onay="Tüm basılı QR kodları geçersiz olacak. Devam edilsin mi?" />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

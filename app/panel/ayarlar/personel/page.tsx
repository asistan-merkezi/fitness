import { UsersRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { ROL_ETIKETLERI, YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import type { KullaniciRolu } from "@/lib/auth/gecerli-kullanici";
import { IsletmeAdiFormu, PersonelEkleFormu, PersonelSatiriFormu } from "./personel-formlari";

type KullaniciListeSatiri = { id: string; ad_soyad: string; rol: KullaniciRolu; aktif: boolean };

export default async function PersonelSayfasi() {
  const { authUser, kullanici } = await sayfaYetkisiIste(YONETICI_ROLLERI);

  const supabase = await createClient();
  const [{ data: kullanicilar }, { data: isletme }] = await Promise.all([
    supabase.from("kullanici").select("id, ad_soyad, rol, aktif").eq("isletme_id", kullanici.isletme_id).order("ad_soyad"),
    supabase.from("isletme").select("ad").eq("id", kullanici.isletme_id).maybeSingle<{ ad: string }>(),
  ]);
  const liste = (kullanicilar ?? []) as KullaniciListeSatiri[];

  return (
    <>
      <PageHeader title="Personel ve Ayarlar" description="Personel hesapları ve işletme bilgileri (yalnız işletme yöneticisi)." icon={UsersRound} />

      <Card>
        <CardHeader>
          <CardTitle>İşletme</CardTitle>
        </CardHeader>
        <CardContent>
          <IsletmeAdiFormu ad={isletme?.ad ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yeni personel</CardTitle>
          <CardDescription>Hesap oluşturulur; personel e-posta ve geçici şifreyle giriş yapar.</CardDescription>
        </CardHeader>
        <CardContent>
          <PersonelEkleFormu />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personel listesi</CardTitle>
          <CardDescription>Pasife alınan personelin oturum açması engellenir; kayıtları silinmez.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {liste.map((k) => (
            <div key={k.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{k.ad_soyad}</span>
                <StatusBadge tone="primary">{ROL_ETIKETLERI[k.rol]}</StatusBadge>
                {!k.aktif && <StatusBadge tone="slate">Pasif</StatusBadge>}
              </div>
              <PersonelSatiriFormu kullaniciId={k.id} rol={k.rol} aktif={k.aktif} benMiyim={k.id === authUser.id} />
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

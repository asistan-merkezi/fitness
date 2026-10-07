import type { Metadata } from "next";
import Link from "next/link";
import { CirclePlus, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import type { AntrenmanTanimiSatiri, EgzersizSatiri } from "@/types/veritabani";
import { AntrenmanSatiri } from "./antrenman-satiri";
import { YeniAntrenmanDialog } from "./yeni-antrenman-dialog";

export const metadata: Metadata = { title: "Antrenman Tanımları" };

export default async function AntrenmanTanimlariSayfasi() {
  await sayfaYetkisiIste(YONETICI_ROLLERI);
  const supabase = await createClient();

  const [tanimSonucu, egzersizSonucu] = await Promise.all([
    supabase
      .from("antrenman_program_sablonu")
      .select("id, ad, aciklama, sure_dakika, aktif, adimlar:antrenman_program_sablonu_adimi(id, ad, ekipman, set_sayisi, tekrar, sure_dakika, sira)")
      .order("aktif", { ascending: false })
      .order("ad")
      .order("sira", { referencedTable: "antrenman_program_sablonu_adimi" })
      .returns<AntrenmanTanimiSatiri[]>(),
    supabase.from("egzersiz_kutuphanesi").select("id, ad, ekipman, sure_dakika, aktif").eq("aktif", true).order("ad").returns<EgzersizSatiri[]>(),
  ]);

  const tanimlar = tanimSonucu.data ?? [];
  const egzersizler = egzersizSonucu.data ?? [];

  return (
    <>
      <PageHeader
        title="Antrenman Tanımları"
        description="Hareketlerden oluşan, yeniden kullanılabilir antrenman tanımlarını görüntüle ve yönet."
        icon={Dumbbell}
        actions={
          <>
            <YeniAntrenmanDialog egzersizler={egzersizler} />
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link href="/panel/yonetim/antrenman-tanimlari/hareketler">
                  <CirclePlus aria-hidden /> Hareket Tanımlama
                </Link>
              }
            />
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Kayıtlı Antrenmanlar</CardTitle>
        </CardHeader>
        <CardContent>
          {tanimSonucu.error ? (
            <p role="alert" className="text-sm text-destructive">
              Bir hata oluştu, lütfen tekrar deneyin.
            </p>
          ) : tanimlar.length === 0 ? (
            <EmptyState icon={Dumbbell} title="Henüz antrenman tanımı yok" description="Önce hareket ekleyin, sonra hareketlerden bir antrenman oluşturun." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tanimlar.map((t) => (
                <AntrenmanSatiri key={t.id} antrenman={t} egzersizler={egzersizler} duzenlenebilir />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

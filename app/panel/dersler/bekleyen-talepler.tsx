import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { gunYazi } from "@/lib/datetime";
import { TalepYanitDugmeleri } from "../musteriler/[id]/talep-formu";

export type BekleyenDersTalebi = {
  id: string;
  musteri_id: string;
  musteri_adi: string;
  tercih_tarih: string;
  tercih_saat: string | null;
  antrenor_adi: string | null;
  not_metni: string | null;
};

/**
 * Bekleyen ders talepleri (klinikteki "Bekleyen Randevu Talepleri" kartının karşılığı): müşterinin telefonla/yüz yüze ilettiği
 * talepler. "Ders Planla" Yeni Ders penceresini müşteri, gün ve saat dolu olarak açar; ders açıldıktan sonra "Planlandı" ile kapatılır.
 */
export function BekleyenTalepler({ talepler, saltOkunur = false }: { talepler: BekleyenDersTalebi[]; saltOkunur?: boolean }) {
  if (talepler.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bekleyen ders talepleri ({talepler.length})</CardTitle>
        <CardDescription>{saltOkunur ? "Size yönlendirilen ders talepleri. Planlamayı resepsiyon/yönetim yapar." : "Müşterilerin ilettiği ders talepleri. Dersi planladıktan sonra talebi “Planlandı” olarak kapatın."}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border p-0">
        {talepler.map((t) => {
          const saat = t.tercih_saat ? t.tercih_saat.slice(0, 5) : null;
          return (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={t.musteri_adi} size="sm" />
                <div className="min-w-0">
                  {saltOkunur ? (
                    <span className="block truncate font-semibold">{t.musteri_adi}</span>
                  ) : (
                    <Link href={`/panel/musteriler/${t.musteri_id}`} className="block truncate font-semibold hover:underline">
                      {t.musteri_adi}
                    </Link>
                  )}
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {gunYazi(t.tercih_tarih)}
                    {saat && ` · ${saat}`}
                    {t.antrenor_adi && ` · ${t.antrenor_adi}`}
                  </p>
                  {t.not_metni && <p className="text-xs text-muted-foreground">{t.not_metni}</p>}
                </div>
              </div>
              {!saltOkunur && (
              <div className="flex flex-wrap items-start gap-2">
                <Link href={`/panel/dersler?yeni=1&uye=${t.musteri_id}&gun=${t.tercih_tarih}${saat ? `&saat=${saat}` : ""}`} className={buttonVariants({ size: "sm" })}>
                  <CalendarPlus aria-hidden /> Ders Planla
                </Link>
                <TalepYanitDugmeleri musteriId={t.musteri_id} talepId={t.id} />
              </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

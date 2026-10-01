"use client";

import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { DersFormu } from "./ders-formu";
import type { MusteriSecenegi } from "./ders-sorgulari";

/**
 * Yeni Ders penceresi (klinikteki Yeni Randevu penceresi gibi Dersler sayfasında açılır).
 * Açık/kapalı durumu URL'den (`?yeni=1`) gelir: sayfa yalnız açıkken bunu render eder, kapatma `kapatHref`'e gider.
 * Başarılı kayıtta `dersOlustur` o günün programına yönlendirir; bu da pencereyi kapatır.
 */
export function YeniDersDialog({
  kapatHref,
  antrenorler,
  alanlar,
  varsayilanTarih,
  varsayilanSaat,
  sabitMusteri,
}: {
  kapatHref: string;
  antrenorler: { id: string; ad_soyad: string }[];
  alanlar: { id: string; ad: string }[];
  varsayilanTarih: string;
  varsayilanSaat?: string;
  sabitMusteri?: MusteriSecenegi;
}) {
  const router = useRouter();
  const eksik =
    antrenorler.length === 0
      ? "Önce Ayarlar > Personel Tanımlama'dan bir antrenör ekleyin."
      : alanlar.length === 0
        ? "Önce Yönetim > Donanım'dan bir alan ekleyin."
        : null;

  return (
    <Dialog open onOpenChange={(acik) => !acik && router.replace(kapatHref, { scroll: false })}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Yeni Ders</DialogTitle>
          <DialogDescription>Müşteriyi seçin, tarih ve saati girin; müsait antrenör ve alanlar listelenir.</DialogDescription>
        </DialogHeader>
        {eksik ? (
          <EmptyState compact icon={UserRound} title={eksik} />
        ) : (
          <DersFormu antrenorler={antrenorler} alanlar={alanlar} varsayilanTarih={varsayilanTarih} varsayilanSaat={varsayilanSaat} sabitMusteri={sabitMusteri} />
        )}
      </DialogContent>
    </Dialog>
  );
}

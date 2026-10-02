"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DersFormu } from "./ders-formu";
import type { MusteriSecenegi } from "./ders-sorgulari";
import { PeriyodikDersFormu } from "./periyodik-ders-formu";

// Klinikteki Yeni Randevu sekmeleriyle aynı: variant="outline" sınıfları emerald sınıflarından sonra geldiği için "!" şart.
const SEKME_SECILI_SINIFI = "!border-emerald-500 !bg-emerald-500 !text-white hover:!bg-emerald-600";

/**
 * Yeni Ders penceresi (klinikteki Yeni Randevu penceresi gibi Dersler sayfasında açılır): Tek Ders / Periyodik Ders sekmeleri.
 * Açık/kapalı durumu URL'den (`?yeni=1`) gelir: sayfa yalnız açıkken bunu render eder, kapatma `kapatHref`'e gider.
 * Başarılı tek ders kaydında `dersOlustur` o günün programına yönlendirir; bu da pencereyi kapatır.
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
  const [mod, setMod] = useState<"tekil" | "periyodik">("tekil");

  return (
    <Dialog open onOpenChange={(acik) => !acik && router.replace(kapatHref, { scroll: false })}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Yeni Ders</DialogTitle>
          <DialogDescription>Müşteriyi seçin, tarih ve saati girin; müsait antrenör ve alanlar listelenir.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {(["tekil", "periyodik"] as const).map((m) => (
            <Button key={m} type="button" variant="outline" className={cn(mod === m && SEKME_SECILI_SINIFI)} onClick={() => setMod(m)}>
              {m === "tekil" ? "Tek Ders" : "Periyodik Ders"}
            </Button>
          ))}
        </div>
        {mod === "tekil" ? (
          <DersFormu antrenorler={antrenorler} alanlar={alanlar} varsayilanTarih={varsayilanTarih} varsayilanSaat={varsayilanSaat} sabitMusteri={sabitMusteri} />
        ) : (
          <PeriyodikDersFormu antrenorler={antrenorler} alanlar={alanlar} sabitMusteri={sabitMusteri} />
        )}
      </DialogContent>
    </Dialog>
  );
}

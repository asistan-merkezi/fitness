"use client";

import { useActionState, useState } from "react";
import { UserPen } from "lucide-react";
import { Alan } from "@/components/panel/form-alanlari";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { faturaBilgisiTamamla } from "../../actions";

/**
 * "Eksik Bilgileri Tamamla": yalnız EKSİK alanları sorar (e-posta / T.C. kimlik no / adres), yalnız doldurulanları yazar;
 * kayıttan sonra sayfa yenilenir ve "Fatura Kes" açılır. Yalnız yönetici/resepsiyon görür (muhasebe kişisel veri yazamaz).
 */
export function EksikBilgiDialog({ musteriId, eksikler }: { musteriId: string; eksikler: string[] }) {
  const [acik, setAcik] = useState(false);
  const [durum, eylem, bekliyor] = useActionState(faturaBilgisiTamamla, null);

  return (
    <>
      <Button type="button" onClick={() => setAcik(true)}>
        <UserPen aria-hidden /> Eksik Bilgileri Tamamla
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Fatura Bilgilerini Tamamla</DialogTitle>
            <DialogDescription>Yalnızca eksik alanlar listelenir; mevcut bilgiler değişmez.</DialogDescription>
          </DialogHeader>
          <form action={eylem} className="flex flex-col gap-4">
            <input type="hidden" name="musteri_id" value={musteriId} />
            <div className="grid gap-4 sm:grid-cols-2">
              {eksikler.includes("eposta") && (
                <Alan etiket="E-posta" htmlFor="eb_eposta">
                  <Input id="eb_eposta" name="eposta" type="email" autoComplete="off" required />
                </Alan>
              )}
              {eksikler.includes("tc_kimlik_no") && (
                <Alan etiket="T.C. kimlik no" htmlFor="eb_tc" ipucu="11 hane.">
                  <Input id="eb_tc" name="tc_kimlik_no" inputMode="numeric" maxLength={11} autoComplete="off" required />
                </Alan>
              )}
              {eksikler.includes("adres") && (
                <>
                  <Alan etiket="İl" htmlFor="eb_il">
                    <Input id="eb_il" name="il" autoComplete="off" required />
                  </Alan>
                  <Alan etiket="İlçe" htmlFor="eb_ilce">
                    <Input id="eb_ilce" name="ilce" autoComplete="off" required />
                  </Alan>
                  <Alan etiket="Mahalle" htmlFor="eb_mahalle">
                    <Input id="eb_mahalle" name="mahalle" autoComplete="off" />
                  </Alan>
                  <Alan etiket="Sokak / apartman / no" htmlFor="eb_adres">
                    <Input id="eb_adres" name="adres_detay" autoComplete="off" required />
                  </Alan>
                </>
              )}
            </div>
            {durum && (
              <p role={durum.success ? "status" : "alert"} className={cn("rounded-lg border px-3 py-2 text-sm font-medium", durum.success ? "border-success-border bg-success-soft text-success" : "border-destructive-border bg-destructive-soft text-destructive")}>
                {durum.message}
              </p>
            )}
            <Button type="submit" disabled={bekliyor} className="w-fit">
              {bekliyor ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

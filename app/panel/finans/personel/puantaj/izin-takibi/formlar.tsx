"use client";

import { useActionState } from "react";
import { Alan } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IZIN_TIPLERI } from "@/lib/panel/etiketler";
import { izinDegerlendir, izinManuelEkle } from "./actions";

/** Bekleyen talep için Onayla / Reddet (ret gerekçesi zorunlu). */
export function DegerlendirmeFormu({ izinId }: { izinId: string }) {
  const [durum, eylem, bekliyor] = useActionState(izinDegerlendir, null);
  return (
    <form action={eylem} className="flex w-full flex-col gap-2 sm:w-72">
      <input type="hidden" name="izin_id" value={izinId} />
      <Textarea name="red_gerekce" rows={1} maxLength={300} placeholder="Ret gerekçesi (reddederken zorunlu)" aria-label="Ret gerekçesi" />
      <div className="flex gap-2">
        <Button type="submit" name="karar" value="onayla" size="sm" disabled={bekliyor}>
          Onayla
        </Button>
        <Button type="submit" name="karar" value="reddet" size="sm" variant="destructive" disabled={bekliyor}>
          Reddet
        </Button>
      </div>
      {durum && (
        <p role={durum.success ? "status" : "alert"} className={durum.success ? "text-xs font-medium text-success" : "text-xs font-medium text-destructive"}>
          {durum.message}
        </p>
      )}
    </form>
  );
}

/**
 * Manuel kayıt (klinik: "Manuel İzin Ekle" / "Manuel Rapor Ekle"): doğrudan onaylı kaydedilir.
 * `rapor`: tür sabit "rapor" (tür seçilmez); değilse yıllık/mazeret seçilir.
 */
export function ManuelIzinFormu({ personeller, bugun, rapor = false }: { personeller: { id: string; ad_soyad: string }[]; bugun: string; rapor?: boolean }) {
  const on = rapor ? "mr" : "mi";
  return (
    <EylemFormu eylem={izinManuelEkle} gonder={rapor ? "Raporu Kaydet" : "İzni Kaydet"}>
      {rapor && <input type="hidden" name="tip" value="rapor" />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Personel" htmlFor={`${on}_kisi`}>
          <SecimKutusu id={`${on}_kisi`} name="kullanici_id" required defaultValue="">
            <option value="" disabled>
              Seçin
            </option>
            {personeller.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ad_soyad}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        {!rapor && (
          <Alan etiket="İzin türü" htmlFor={`${on}_tip`}>
            <SecimKutusu id={`${on}_tip`} name="tip" defaultValue="yillik">
              {Object.entries(IZIN_TIPLERI)
                .filter(([kod]) => kod !== "rapor")
                .map(([kod, etiket]) => (
                  <option key={kod} value={kod}>
                    {etiket}
                  </option>
                ))}
            </SecimKutusu>
          </Alan>
        )}
        <Alan etiket="Başlangıç" htmlFor={`${on}_bas`}>
          <Input id={`${on}_bas`} name="baslangic" type="date" defaultValue={bugun} required />
        </Alan>
        <Alan etiket="Bitiş (dahil)" htmlFor={`${on}_bit`}>
          <Input id={`${on}_bit`} name="bitis" type="date" defaultValue={bugun} required />
        </Alan>
      </div>
      <Alan etiket={rapor ? "Açıklama" : "Gerekçe"} htmlFor={`${on}_gerekce`}>
        <Textarea id={`${on}_gerekce`} name="gerekce" rows={2} maxLength={300} />
      </Alan>
    </EylemFormu>
  );
}

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

export function ManuelIzinFormu({ personeller, bugun }: { personeller: { id: string; ad_soyad: string }[]; bugun: string }) {
  return (
    <EylemFormu eylem={izinManuelEkle} gonder="İzni Kaydet">
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Personel" htmlFor="mi_kisi">
          <SecimKutusu id="mi_kisi" name="kullanici_id" required defaultValue="">
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
        <Alan etiket="İzin türü" htmlFor="mi_tip">
          <SecimKutusu id="mi_tip" name="tip" defaultValue="rapor">
            {Object.entries(IZIN_TIPLERI).map(([kod, etiket]) => (
              <option key={kod} value={kod}>
                {etiket}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        <Alan etiket="Başlangıç" htmlFor="mi_bas">
          <Input id="mi_bas" name="baslangic" type="date" defaultValue={bugun} required />
        </Alan>
        <Alan etiket="Bitiş (dahil)" htmlFor="mi_bit">
          <Input id="mi_bit" name="bitis" type="date" defaultValue={bugun} required />
        </Alan>
      </div>
      <Alan etiket="Gerekçe" htmlFor="mi_gerekce">
        <Textarea id="mi_gerekce" name="gerekce" rows={2} maxLength={300} />
      </Alan>
    </EylemFormu>
  );
}

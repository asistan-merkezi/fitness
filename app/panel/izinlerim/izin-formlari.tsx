"use client";

import { useActionState } from "react";
import { Alan } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IZIN_TIPLERI } from "@/lib/panel/etiketler";
import { izinTalepIptal, izinTalepOlustur } from "./actions";

export function IzinTalepFormu({ bugun }: { bugun: string }) {
  return (
    <EylemFormu eylem={izinTalepOlustur} gonder="Talep Gönder" yukleniyor="Gönderiliyor...">
      <div className="grid gap-4 sm:grid-cols-3">
        <Alan etiket="İzin türü" htmlFor="iz_tip">
          <SecimKutusu id="iz_tip" name="tip" defaultValue="yillik">
            {Object.entries(IZIN_TIPLERI).map(([kod, etiket]) => (
              <option key={kod} value={kod}>
                {etiket}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        <Alan etiket="Başlangıç" htmlFor="iz_bas">
          <Input id="iz_bas" name="baslangic" type="date" defaultValue={bugun} required />
        </Alan>
        <Alan etiket="Bitiş (dahil)" htmlFor="iz_bit">
          <Input id="iz_bit" name="bitis" type="date" defaultValue={bugun} required />
        </Alan>
      </div>
      <Alan etiket="Gerekçe" htmlFor="iz_gerekce" ipucu="İş günü sayısı otomatik hesaplanır (Pazar ve resmi tatiller sayılmaz).">
        <Textarea id="iz_gerekce" name="gerekce" rows={2} maxLength={300} />
      </Alan>
    </EylemFormu>
  );
}

/** Tek tıkla iptal (onay sorulur). */
export function IzinIptalButonu({ izinId }: { izinId: string }) {
  const [durum, eylem, bekliyor] = useActionState(izinTalepIptal, null);
  return (
    <form action={eylem} className="flex flex-col items-end gap-1">
      <input type="hidden" name="izin_id" value={izinId} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={bekliyor}
        onClick={(e) => {
          if (!window.confirm("İzin talebi iptal edilsin mi?")) e.preventDefault();
        }}
      >
        İptal Et
      </Button>
      {durum && !durum.success && <span className="text-xs font-medium text-destructive">{durum.message}</span>}
    </form>
  );
}

"use client";

import { Input } from "@/components/ui/input";
import { Alan, IsimGirdisi, OnayKutusu } from "@/components/panel/form-alanlari";
import { EylemFormu } from "@/components/panel/eylem-formu";
import type { EgzersizSatiri } from "@/types/veritabani";
import { egzersizKaydet } from "../actions";

export function EgzersizFormu({ egzersiz }: { egzersiz?: EgzersizSatiri }) {
  const on = egzersiz ? `e_${egzersiz.id}_` : "e_yeni_";
  return (
    <EylemFormu eylem={egzersizKaydet} gonder={egzersiz ? "Kaydet" : "Hareket Ekle"} varyant={egzersiz ? "outline" : "default"}>
      {egzersiz && <input type="hidden" name="egzersiz_id" value={egzersiz.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Alan etiket="Hareket adı" htmlFor={`${on}ad`}>
          <IsimGirdisi id={`${on}ad`} name="ad" varsayilan={egzersiz?.ad ?? ""} required />
        </Alan>
        <Alan etiket="Ekipman (opsiyonel)" htmlFor={`${on}ekipman`}>
          <Input id={`${on}ekipman`} name="ekipman" defaultValue={egzersiz?.ekipman ?? ""} maxLength={100} />
        </Alan>
        <Alan etiket="Varsayılan süre (dk)" htmlFor={`${on}sure`}>
          <Input id={`${on}sure`} name="sure_dakika" type="number" min={1} max={480} defaultValue={egzersiz?.sure_dakika ?? ""} />
        </Alan>
      </div>
      {egzersiz && <OnayKutusu id={`${on}aktif`} name="aktif" etiket="Kullanımda (aktif)" varsayilan={egzersiz.aktif} />}
    </EylemFormu>
  );
}

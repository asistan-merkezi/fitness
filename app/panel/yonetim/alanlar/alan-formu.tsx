"use client";

import { Alan, IsimGirdisi, OnayKutusu } from "@/components/panel/form-alanlari";
import { EylemFormu } from "@/components/panel/eylem-formu";
import { alanKaydet } from "./actions";

export function AlanFormu({ alan }: { alan?: { id: string; ad: string; aktif: boolean } }) {
  const on = alan ? `a_${alan.id}_` : "a_yeni_";
  return (
    <EylemFormu eylem={alanKaydet} gonder={alan ? "Kaydet" : "Alan Ekle"} varyant={alan ? "outline" : "default"} className={alan ? "sm:flex-row sm:items-end sm:gap-3" : undefined}>
      {alan && <input type="hidden" name="alan_id" value={alan.id} />}
      <Alan etiket="Alan / stüdyo adı" htmlFor={`${on}ad`}>
        <IsimGirdisi id={`${on}ad`} name="ad" varsayilan={alan?.ad ?? ""} required />
      </Alan>
      {alan && <OnayKutusu id={`${on}aktif`} name="aktif" etiket="Kullanımda (aktif)" varsayilan={alan.aktif} />}
    </EylemFormu>
  );
}

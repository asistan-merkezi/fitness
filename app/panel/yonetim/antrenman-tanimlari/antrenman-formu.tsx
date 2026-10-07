"use client";

import { useId, useState } from "react";
import { EylemFormu } from "@/components/panel/eylem-formu";
import { Alan, IsimGirdisi } from "@/components/panel/form-alanlari";
import { Textarea } from "@/components/ui/textarea";
import type { AntrenmanTanimiSatiri, EgzersizSatiri } from "@/types/veritabani";
import { antrenmanTanimiKaydet } from "./actions";
import { AdimSatirlari, adimlardanDuzenlenebilir, toplamSureHesapla, type AntrenmanAdimi } from "./adim-satirlari";

/** Antrenman tanımı formu (yeni/düzenle): ad, açıklama ve hareket adımları; toplam süre adımlardan hesaplanır. */
export function AntrenmanFormu({
  antrenman,
  egzersizler,
  basariliOlunca,
}: {
  antrenman?: AntrenmanTanimiSatiri;
  egzersizler: EgzersizSatiri[];
  basariliOlunca?: () => void;
}) {
  const on = useId();
  const [adimlar, setAdimlar] = useState<AntrenmanAdimi[]>(() => adimlardanDuzenlenebilir(antrenman?.adimlar ?? [], on));
  const toplam = toplamSureHesapla(adimlar);

  return (
    <EylemFormu eylem={antrenmanTanimiKaydet} gonder={antrenman ? "Kaydet" : "Antrenman Tanımı Ekle"} basariliOlunca={basariliOlunca} className="gap-4">
      {antrenman && <input type="hidden" name="antrenman_id" value={antrenman.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Antrenman adı" htmlFor={`${on}ad`} ipucu="Ör. Göğüs & Triceps, Full Body Başlangıç.">
          <IsimGirdisi id={`${on}ad`} name="ad" varsayilan={antrenman?.ad ?? ""} required />
        </Alan>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Toplam süre</span>
          <p className="flex h-10 items-center text-sm text-muted-foreground">{toplam > 0 ? `${toplam} dakika` : "Hareket süreleri girilince hesaplanır"}</p>
        </div>
      </div>
      <Alan etiket="Açıklama (opsiyonel)" htmlFor={`${on}aciklama`}>
        <Textarea id={`${on}aciklama`} name="aciklama" defaultValue={antrenman?.aciklama ?? ""} maxLength={500} rows={2} />
      </Alan>
      <AdimSatirlari egzersizler={egzersizler} adimlar={adimlar} onDegisti={setAdimlar} onEk={on} />
    </EylemFormu>
  );
}

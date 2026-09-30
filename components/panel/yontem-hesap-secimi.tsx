"use client";

import { useState } from "react";
import { Alan } from "@/components/panel/form-alanlari";
import { SecimKutusu } from "@/components/panel/eylem-formu";

export type HesapSecenegi = { id: string; ad: string };

/**
 * Ödeme yöntemi + (havale/kredi kartı seçilince) banka hesabı. Nakit seçilirse hesap alanı gizlenir ve gönderilmez (nakit kasaya yazılır).
 * Hesap seçilmezse kayıt "hesap atanmamış" banka hareketi olarak görünür; bu bilinçli bir serbestliktir, zorunlu değildir.
 * `yontemler`: gösterilecek yöntemler (kod -> etiket). `hesapGerektirenler`: hesap seçimi sunulan yöntemler.
 */
export function YontemHesapSecimi({
  id,
  yontemler,
  hesaplar,
  hesapGerektirenler = ["havale", "kredi_karti"],
  yontemAdi = "yontem",
  hesapAdi = "banka_hesap_id",
  zorunlu = true,
  varsayilan = "",
  yontemEtiketi = "Yöntem",
}: {
  id: string;
  yontemler: Record<string, string>;
  hesaplar: HesapSecenegi[];
  hesapGerektirenler?: string[];
  yontemAdi?: string;
  hesapAdi?: string;
  zorunlu?: boolean;
  varsayilan?: string;
  yontemEtiketi?: string;
}) {
  const [yontem, setYontem] = useState(varsayilan);
  const hesapGoster = hesapGerektirenler.includes(yontem) && hesaplar.length > 0;

  return (
    <>
      <Alan etiket={yontemEtiketi} htmlFor={`${id}_yontem`}>
        <SecimKutusu id={`${id}_yontem`} name={yontemAdi} required={zorunlu} value={yontem} onChange={(e) => setYontem(e.target.value)}>
          <option value="" disabled={zorunlu}>
            {zorunlu ? "Seçin" : "—"}
          </option>
          {Object.entries(yontemler).map(([kod, etiket]) => (
            <option key={kod} value={kod}>
              {etiket}
            </option>
          ))}
        </SecimKutusu>
      </Alan>
      {hesapGoster && (
        <Alan etiket="Banka hesabı" htmlFor={`${id}_hesap`} ipucu="İsteğe bağlı; seçilmezse 'hesap atanmamış' olarak izlenir.">
          <SecimKutusu id={`${id}_hesap`} name={hesapAdi} defaultValue="">
            <option value="">Hesap seçilmedi</option>
            {hesaplar.map((h) => (
              <option key={h.id} value={h.id}>
                {h.ad}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
      )}
    </>
  );
}

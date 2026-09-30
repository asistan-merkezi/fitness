"use client";

import { useState } from "react";
import { Alan } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { Input } from "@/components/ui/input";
import { kurusGirdiYazi } from "@/lib/para";
import { acilisBakiyeKaydet, manuelHareketEkle } from "./actions";

export type HesapSecimSatiri = { kod: string; ad: string };

/** Hesap seçeneği: "kasa" veya banka hesabının UUID'si. */
export function ManuelHareketFormu({ hesaplar, varsayilanHesap = "kasa" }: { hesaplar: HesapSecimSatiri[]; varsayilanHesap?: string }) {
  const [tip, setTip] = useState<"giren" | "cikan" | "transfer">("giren");
  return (
    <EylemFormu eylem={manuelHareketEkle} gonder="Hareketi Kaydet" anahtarli>
      <div className="grid gap-4 sm:grid-cols-3">
        <Alan etiket="Hareket türü" htmlFor="mh_tip">
          <SecimKutusu id="mh_tip" name="tip" value={tip} onChange={(e) => setTip(e.target.value as typeof tip)}>
            <option value="giren">Hesaba giren</option>
            <option value="cikan">Hesaptan çıkan</option>
            <option value="transfer">Hesaplar arası transfer</option>
          </SecimKutusu>
        </Alan>
        <Alan etiket={tip === "transfer" ? "Kaynak hesap" : "Hesap"} htmlFor="mh_hesap">
          <SecimKutusu id="mh_hesap" name="hesap" defaultValue={varsayilanHesap} required>
            {hesaplar.map((h) => (
              <option key={h.kod} value={h.kod}>
                {h.ad}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        {tip === "transfer" && (
          <Alan etiket="Hedef hesap" htmlFor="mh_hedef">
            <SecimKutusu id="mh_hedef" name="hedef" defaultValue="" required>
              <option value="" disabled>
                Seçin
              </option>
              {hesaplar.map((h) => (
                <option key={h.kod} value={h.kod}>
                  {h.ad}
                </option>
              ))}
            </SecimKutusu>
          </Alan>
        )}
        <Alan etiket="Tutar (₺)" htmlFor="mh_tutar">
          <Input id="mh_tutar" name="tutar" inputMode="decimal" required autoComplete="off" placeholder="0,00" />
        </Alan>
        <Alan etiket="Karşı taraf" htmlFor="mh_karsi">
          <Input id="mh_karsi" name="karsi_taraf" maxLength={100} autoComplete="off" />
        </Alan>
        <Alan etiket="Tarih" htmlFor="mh_tarih" ipucu="Boşsa bugün.">
          <Input id="mh_tarih" name="tarih" type="date" />
        </Alan>
      </div>
      <Alan etiket="Açıklama" htmlFor="mh_aciklama">
        <Input id="mh_aciklama" name="aciklama" maxLength={300} autoComplete="off" />
      </Alan>
    </EylemFormu>
  );
}

export function AcilisFormu({ hesapKodu, acilisKurus }: { hesapKodu: string; acilisKurus: number }) {
  return (
    <EylemFormu eylem={acilisBakiyeKaydet} gonder="Kaydet" varyant="outline" boyut="sm" className="sm:flex-row sm:items-end sm:gap-3">
      <input type="hidden" name="hesap" value={hesapKodu} />
      <Alan etiket="Açılış bakiyesi (₺)" htmlFor={`ab_${hesapKodu}`} ipucu="Kayıtlara başlamadan önceki bakiye; eksi girilebilir.">
        <Input id={`ab_${hesapKodu}`} name="tutar" inputMode="decimal" defaultValue={acilisKurus === 0 ? "" : (acilisKurus < 0 ? "-" : "") + kurusGirdiYazi(Math.abs(acilisKurus))} autoComplete="off" className="w-44" />
      </Alan>
    </EylemFormu>
  );
}

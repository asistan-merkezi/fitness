"use client";

import { Alan, IsimGirdisi, OnayKutusu } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { Input } from "@/components/ui/input";
import { kurusGirdiYazi } from "@/lib/para";
import type { PaketSatiri } from "@/types/veritabani";
import { paketKaydet } from "./actions";

export function PaketFormu({ paket }: { paket?: PaketSatiri }) {
  const on = paket ? `p_${paket.id}_` : "p_yeni_";
  return (
    <EylemFormu eylem={paketKaydet} gonder={paket ? "Paketi Güncelle" : "Paketi Oluştur"}>
      {paket && <input type="hidden" name="paket_id" value={paket.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Alan etiket="Paket adı" htmlFor={`${on}ad`}>
            <IsimGirdisi id={`${on}ad`} name="ad" varsayilan={paket?.ad ?? ""} required />
          </Alan>
        </div>
        <Alan etiket="Tür" htmlFor={`${on}tur`}>
          <SecimKutusu id={`${on}tur`} name="tur" defaultValue={paket?.tur ?? "sure"}>
            <option value="sure">Süre bazlı (ör. aylık)</option>
            <option value="seans">Seans bazlı (ör. 10 PT)</option>
          </SecimKutusu>
        </Alan>
        <Alan etiket="Süre (gün)" htmlFor={`${on}sure`} ipucu="Yalnız süre bazlı pakette.">
          <Input id={`${on}sure`} name="sure_gun" inputMode="numeric" defaultValue={paket?.sure_gun ?? ""} autoComplete="off" />
        </Alan>
        <Alan etiket="Seans sayısı" htmlFor={`${on}seans`} ipucu="Yalnız seans bazlı pakette.">
          <Input id={`${on}seans`} name="seans_sayisi" inputMode="numeric" defaultValue={paket?.seans_sayisi ?? ""} autoComplete="off" />
        </Alan>
        <Alan etiket="Seans geçerlilik (gün)" htmlFor={`${on}gecerlilik`} ipucu="Boşsa süresiz.">
          <Input id={`${on}gecerlilik`} name="gecerlilik_gun" inputMode="numeric" defaultValue={paket?.gecerlilik_gun ?? ""} autoComplete="off" />
        </Alan>
        <Alan etiket="Fiyat (₺)" htmlFor={`${on}fiyat`}>
          <Input id={`${on}fiyat`} name="fiyat" inputMode="decimal" defaultValue={paket ? kurusGirdiYazi(paket.fiyat_kurus) : ""} required autoComplete="off" />
        </Alan>
        <Alan etiket="KDV oranı (%)" htmlFor={`${on}kdv`}>
          <Input id={`${on}kdv`} name="kdv_orani" inputMode="numeric" defaultValue={paket?.kdv_orani ?? 20} autoComplete="off" />
        </Alan>
        <Alan etiket="Satış bitiş tarihi" htmlFor={`${on}satis_bitis`} ipucu="Boşsa süresiz satışta.">
          <Input id={`${on}satis_bitis`} name="satis_bitis_tarihi" type="date" defaultValue={paket?.satis_bitis_tarihi ?? ""} />
        </Alan>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <OnayKutusu id={`${on}dondurma`} name="dondurma_izni" etiket="Dondurmaya izin ver" varsayilan={paket?.dondurma_izni ?? false} />
        <Alan etiket="Azami dondurma (gün)" htmlFor={`${on}azami`}>
          <Input id={`${on}azami`} name="azami_dondurma_gun" inputMode="numeric" defaultValue={paket?.azami_dondurma_gun || ""} autoComplete="off" />
        </Alan>
        <Alan etiket="Dondurma ücreti (₺)" htmlFor={`${on}dondurma_ucret`}>
          <Input id={`${on}dondurma_ucret`} name="dondurma_ucret" inputMode="decimal" defaultValue={paket?.dondurma_ucret_kurus ? kurusGirdiYazi(paket.dondurma_ucret_kurus) : ""} autoComplete="off" />
        </Alan>
      </div>
      <OnayKutusu id={`${on}aktif`} name="aktif" etiket="Satışa açık (aktif)" varsayilan={paket?.aktif ?? true} />
    </EylemFormu>
  );
}

"use client";

import Link from "next/link";
import { CirclePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SecimKutusu } from "@/components/panel/eylem-formu";
import type { AntrenmanAdimiSatiri, EgzersizSatiri } from "@/types/veritabani";

export type AntrenmanAdimi = {
  anahtar: string;
  id?: string;
  ad: string;
  ekipman: string;
  setSayisi: string;
  tekrar: string;
  sureDakika: string;
};

export function bosAdim(anahtar: string): AntrenmanAdimi {
  return { anahtar, ad: "", ekipman: "", setSayisi: "", tekrar: "", sureDakika: "" };
}

export function adimlardanDuzenlenebilir(adimlar: AntrenmanAdimiSatiri[], onEk: string): AntrenmanAdimi[] {
  if (adimlar.length === 0) return [bosAdim(`${onEk}-0`)];
  return adimlar.map((a, i) => ({
    anahtar: `${onEk}-${i}`,
    id: a.id,
    ad: a.ad,
    ekipman: a.ekipman ?? "",
    setSayisi: a.set_sayisi !== null ? String(a.set_sayisi) : "",
    tekrar: a.tekrar ?? "",
    sureDakika: a.sure_dakika !== null ? String(a.sure_dakika) : "",
  }));
}

export function toplamSureHesapla(adimlar: AntrenmanAdimi[]): number {
  return adimlar.reduce((toplam, a) => toplam + (Number(a.sureDakika) || 0), 0);
}

/** Adım listesi editörü: hareket egzersiz kütüphanesinden seçilir (ad/ekipman/süre dolar, sonra elle değiştirilebilir). Liste tek gizli JSON alanıyla gider. */
export function AdimSatirlari({
  egzersizler,
  adimlar,
  onDegisti,
  onEk,
  disabled,
}: {
  egzersizler: EgzersizSatiri[];
  adimlar: AntrenmanAdimi[];
  onDegisti: (adimlar: AntrenmanAdimi[]) => void;
  onEk: string;
  disabled?: boolean;
}) {
  function adimEkle() {
    onDegisti([...adimlar, bosAdim(`${onEk}-${crypto.randomUUID()}`)]);
  }

  function adimSil(anahtar: string) {
    if (adimlar.length <= 1) return;
    onDegisti(adimlar.filter((a) => a.anahtar !== anahtar));
  }

  function guncelle(anahtar: string, alan: "ekipman" | "setSayisi" | "tekrar" | "sureDakika", deger: string) {
    onDegisti(adimlar.map((a) => (a.anahtar === anahtar ? { ...a, [alan]: deger } : a)));
  }

  function kutuphandenDoldur(anahtar: string, egzersizId: string) {
    const e = egzersizler.find((x) => x.id === egzersizId);
    if (!e) return;
    onDegisti(
      adimlar.map((a) =>
        a.anahtar === anahtar ? { ...a, ad: e.ad, ekipman: e.ekipman ?? "", sureDakika: e.sure_dakika !== null ? String(e.sure_dakika) : a.sureDakika } : a
      )
    );
  }

  const gonderilecek = JSON.stringify(
    adimlar.map((a) => ({ id: a.id ?? "", ad: a.ad, ekipman: a.ekipman, set_sayisi: a.setSayisi, tekrar: a.tekrar, sure_dakika: a.sureDakika }))
  );

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="adimlar" value={gonderilecek} readOnly />

      {egzersizler.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Önce{" "}
          <Link href="/panel/yonetim/antrenman-tanimlari/hareketler" className="underline">
            Hareket Tanımlama
          </Link>{" "}
          sayfasından hareket ekleyin.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {adimlar.map((adim, sira) => {
          const secili = egzersizler.find((e) => e.ad === adim.ad);
          return (
            <div key={adim.anahtar} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
              <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div className="flex flex-col gap-1 lg:col-span-2">
                  <Label className="text-xs text-muted-foreground">{sira + 1}. Hareket</Label>
                  <SecimKutusu
                    value={secili?.id ?? ""}
                    onChange={(e) => kutuphandenDoldur(adim.anahtar, e.target.value)}
                    disabled={disabled || egzersizler.length === 0}
                    aria-label={`${sira + 1}. hareket`}
                  >
                    <option value="" disabled>
                      {egzersizler.length === 0 ? "Kayıtlı hareket yok" : "Hareket seçin"}
                    </option>
                    {egzersizler.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.ad}
                      </option>
                    ))}
                  </SecimKutusu>
                  {adim.ad && !secili && <p className="text-xs text-muted-foreground">Mevcut: {adim.ad} (kütüphanede yok)</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Ekipman</Label>
                  <Input value={adim.ekipman} maxLength={100} onChange={(e) => guncelle(adim.anahtar, "ekipman", e.target.value)} disabled={disabled} />
                </div>
                <div className="grid grid-cols-2 gap-2 lg:col-span-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Set</Label>
                    <Input type="number" min={1} max={50} value={adim.setSayisi} onChange={(e) => guncelle(adim.anahtar, "setSayisi", e.target.value)} disabled={disabled} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Tekrar</Label>
                    <Input value={adim.tekrar} maxLength={20} placeholder="8-12" onChange={(e) => guncelle(adim.anahtar, "tekrar", e.target.value)} disabled={disabled} />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Süre (dk)</Label>
                    <Input type="number" min={1} max={480} value={adim.sureDakika} onChange={(e) => guncelle(adim.anahtar, "sureDakika", e.target.value)} disabled={disabled} />
                  </div>
                </div>
              </div>
              <Button type="button" size="icon" variant="ghost" disabled={disabled || adimlar.length === 1} onClick={() => adimSil(adim.anahtar)} aria-label="Hareketi kaldır">
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <Button type="button" size="sm" variant="outline" onClick={adimEkle} disabled={disabled} className="w-fit">
        <CirclePlus className="size-4" /> Hareket İlave Et
      </Button>
    </div>
  );
}

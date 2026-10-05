"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Alan } from "@/components/panel/form-alanlari";
import { EylemFormu } from "@/components/panel/eylem-formu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { kurusGirdiYazi } from "@/lib/para";
import { istanbulZamanYazisi } from "@/lib/panel/finans";
import { kasaBaslangicKaydet, kasaDengelemeKaydet } from "./actions";

/**
 * Kasa Kontrol penceresi (yalnız yönetici): üstte butona basılan tarih+saat (İstanbul); kasa başlangıç tutarı kendi Kaydet
 * düğmesiyle (giriş zamanı + giren kişi görünür, girildiği günde Kasa Hareketleri'ne "Kasa Başlangıç" olarak işlenir);
 * Kasa Dengeleme Bedeli (+ kasaya ekler, − kasadan düşer) + açıklama + oturumdaki giren kişi. Her ikisi de değişmez deftere yazılır.
 */
export function KasaKontrolDiyalog({ baslangicKurus, baslangicZamani, baslangicGiren, girenKisi }: { baslangicKurus: number; baslangicZamani: string | null; baslangicGiren: string | null; girenKisi: string }) {
  const [acik, setAcik] = useState(false);
  const [aciliste, setAciliste] = useState("");

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setAciliste(istanbulZamanYazisi(new Date().toISOString()));
          setAcik(true);
        }}
      >
        <ClipboardCheck aria-hidden /> Kasa Kontrol
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kasa Kontrol</DialogTitle>
            <DialogDescription>{aciliste}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2/60 p-3.5">
            <EylemFormu eylem={kasaBaslangicKaydet} gonder="Kaydet" varyant="outline" boyut="sm" className="sm:flex-row sm:items-end sm:gap-3">
              <Alan etiket="Kasa Başlangıç Tutarı (₺)" htmlFor="kk_baslangic">
                <Input id="kk_baslangic" name="tutar" inputMode="decimal" defaultValue={baslangicKurus === 0 ? "" : (baslangicKurus < 0 ? "-" : "") + kurusGirdiYazi(Math.abs(baslangicKurus))} autoComplete="off" placeholder="0,00" className="w-44" />
              </Alan>
            </EylemFormu>
            <p className="text-xs text-muted-foreground">
              {baslangicZamani ? (
                <>
                  Giriş: {istanbulZamanYazisi(baslangicZamani)}
                  {baslangicGiren ? ` · ${baslangicGiren}` : ""} — Kasa Hareketleri&apos;ne işlenir.
                </>
              ) : (
                "Giriş tarihi / kişi bilgisi kayıtlı değil; tutar her dönemin açılışı sayılır. Yeniden kaydederseniz girildiği günde harekete dönüşür."
              )}
            </p>
          </div>

          <EylemFormu eylem={kasaDengelemeKaydet} gonder="Kaydet" anahtarli basariliOlunca={() => setAcik(false)}>
            <Alan etiket="Kasa Dengeleme Bedeli (₺)" htmlFor="kk_dengeleme" ipucu="Kasaya eklenecekse pozitif, kasadan düşülecekse eksi (−) değer girin.">
              <Input id="kk_dengeleme" name="tutar" inputMode="decimal" required autoComplete="off" placeholder="0,00" />
            </Alan>
            <Alan etiket="Açıklama" htmlFor="kk_aciklama">
              <Input id="kk_aciklama" name="aciklama" maxLength={300} autoComplete="off" placeholder="İsteğe bağlı" />
            </Alan>
            <Alan etiket="Giren Kişi" htmlFor="kk_giren">
              <Input id="kk_giren" value={girenKisi || "—"} readOnly disabled />
            </Alan>
          </EylemFormu>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { EylemFormu } from "@/components/panel/eylem-formu";
import { cn } from "@/lib/utils";
import type { AntrenmanTanimiSatiri, EgzersizSatiri } from "@/types/veritabani";
import { antrenmanAktifDegistir } from "./actions";
import { AntrenmanFormu } from "./antrenman-formu";

function adimOzeti(a: AntrenmanTanimiSatiri["adimlar"][number]) {
  const setTekrar = a.set_sayisi && a.tekrar ? `${a.set_sayisi}×${a.tekrar}` : a.set_sayisi ? `${a.set_sayisi} set` : a.tekrar ? `${a.tekrar} tekrar` : null;
  const detay = [setTekrar, a.ekipman, a.sure_dakika !== null ? `${a.sure_dakika} dk` : null].filter(Boolean).join(", ");
  return detay ? `${a.ad} (${detay})` : a.ad;
}

/** Antrenman tanımı kartı: özet + (yönetici) Düzenle penceresi ve pasife alma/etkinleştirme. */
export function AntrenmanSatiri({ antrenman, egzersizler, duzenlenebilir }: { antrenman: AntrenmanTanimiSatiri; egzersizler: EgzersizSatiri[]; duzenlenebilir: boolean }) {
  const [duzenle, setDuzenle] = useState(false);

  return (
    <Card elevated className="gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className={cn("font-medium", !antrenman.aktif && "text-muted-foreground line-through")}>{antrenman.ad}</span>
        <StatusBadge tone={antrenman.aktif ? "emerald" : "slate"}>{antrenman.aktif ? "Aktif" : "Pasif"}</StatusBadge>
      </div>
      {antrenman.aciklama && <span className="text-sm text-muted-foreground">{antrenman.aciklama}</span>}
      <span className="text-sm text-muted-foreground">{antrenman.sure_dakika !== null ? `Toplam süre: ${antrenman.sure_dakika} dk` : "Süre girilmemiş"}</span>
      {antrenman.adimlar.length > 0 && <span className="text-sm text-muted-foreground">{antrenman.adimlar.map(adimOzeti).join(" · ")}</span>}

      {duzenlenebilir && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="button" size="sm" variant="outline" onClick={() => setDuzenle(true)}>
            Düzenle
          </Button>
          <EylemFormu eylem={antrenmanAktifDegistir} gonder={antrenman.aktif ? "Pasife Al" : "Etkinleştir"} varyant="outline" boyut="sm" className="gap-1">
            <input type="hidden" name="antrenman_id" value={antrenman.id} />
            {!antrenman.aktif && <input type="hidden" name="aktif" value="on" />}
          </EylemFormu>
        </div>
      )}

      {duzenlenebilir && (
        <Dialog open={duzenle} onOpenChange={setDuzenle}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Antrenman Tanımını Düzenle: {antrenman.ad}</DialogTitle>
            </DialogHeader>
            <AntrenmanFormu antrenman={antrenman} egzersizler={egzersizler} basariliOlunca={() => setDuzenle(false)} />
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

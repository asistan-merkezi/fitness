"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { paketOzeti, paketSatilabilir, satisSuresiDoldu } from "@/lib/panel/paket";
import type { PaketSatiri as Paket } from "@/types/veritabani";
import { paketAktifDegistir } from "./actions";
import { PaketFormu } from "./paket-formu";
import { PaketSatisDialog } from "./paket-satis-dialog";
import { PaketUyeleriDialog } from "./paket-uyeleri-dialog";

/**
 * Paket satırı (klinikteki PaketSatiri): ad + rozetler + özet + aktif üye sayısı; eylemler: Paketi Sat (yönetici/resepsiyon, yalnız satılabilir
 * pakette), Üyeler, Düzenle (pencere) ve satışa aç/kapat (yönetici). Kapatılan/süresi dolan paket arşive geçer, mevcut üyelikler etkilenmez.
 */
export function PaketSatiri({ paket, aktifUyeSayisi, yonetici, satisYapabilir, bugun }: { paket: Paket; aktifUyeSayisi: number; yonetici: boolean; satisYapabilir: boolean; bugun: string }) {
  const [duzenle, setDuzenle] = useState(false);
  const [durum, eylem, bekliyor] = useActionState(paketAktifDegistir, null);
  const doldu = satisSuresiDoldu(paket, bugun);

  return (
    <li>
      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {paket.ad}
              <StatusBadge tone={!paket.aktif ? "slate" : doldu ? "amber" : "emerald"}>{!paket.aktif ? "Kapalı" : doldu ? "Satış süresi doldu" : "Satışta"}</StatusBadge>
              {paket.kapsam === "ders" && <StatusBadge tone="primary">PT dersi</StatusBadge>}
              {paket.dondurma_izni && <StatusBadge tone="sky">Dondurulabilir</StatusBadge>}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{paketOzeti(paket)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{aktifUyeSayisi} aktif üye</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {satisYapabilir && paketSatilabilir(paket, bugun) && <PaketSatisDialog paket={paket} bugun={bugun} />}
            <PaketUyeleriDialog paket={paket} />
            {yonetici && (
              <>
                <Button type="button" size="sm" variant="outline" onClick={() => setDuzenle(true)}>
                  <Pencil aria-hidden /> Düzenle
                </Button>
                <form action={eylem}>
                  <input type="hidden" name="paket_id" value={paket.id} />
                  <input type="hidden" name="aktif" value={String(!paket.aktif)} />
                  <Button type="submit" size="sm" variant="outline" disabled={bekliyor}>
                    {paket.aktif ? "Satışa Kapat" : "Satışa Aç"}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
        {durum && !durum.success && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {durum.message}
          </p>
        )}
      </Card>

      {yonetici && (
        <Dialog open={duzenle} onOpenChange={setDuzenle}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Paketi Düzenle: {paket.ad}</DialogTitle>
            </DialogHeader>
            <PaketFormu paket={paket} basariliOlunca={() => setDuzenle(false)} />
          </DialogContent>
        </Dialog>
      )}
    </li>
  );
}

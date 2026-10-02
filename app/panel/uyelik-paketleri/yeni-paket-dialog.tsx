"use client";

import { useState } from "react";
import { CirclePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaketFormu } from "./paket-formu";

/** "Yeni Paket" düğmesi: formu pencerede açar (klinikteki Yeni Paket penceresi), kayıt başarılı olunca kapanır. */
export function YeniPaketDialog() {
  const [acik, setAcik] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setAcik(true)}>
        <CirclePlus aria-hidden /> Yeni Paket
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Yeni Paket</DialogTitle>
            <DialogDescription>Fiyat değişikliği mevcut üyelikleri etkilemez; satış anındaki koşullar üyelikte saklanır.</DialogDescription>
          </DialogHeader>
          <PaketFormu basariliOlunca={() => setAcik(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

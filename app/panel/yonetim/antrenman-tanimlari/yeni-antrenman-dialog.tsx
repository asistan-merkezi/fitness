"use client";

import { useState } from "react";
import { CirclePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EgzersizSatiri } from "@/types/veritabani";
import { AntrenmanFormu } from "./antrenman-formu";

/** "Yeni Antrenman Ekle" düğmesi: formu pencerede açar, kayıt başarılı olunca kapanır. */
export function YeniAntrenmanDialog({ egzersizler }: { egzersizler: EgzersizSatiri[] }) {
  const [acik, setAcik] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setAcik(true)}>
        <CirclePlus aria-hidden /> Yeni Antrenman Ekle
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Yeni Antrenman Tanımı</DialogTitle>
          </DialogHeader>
          <AntrenmanFormu egzersizler={egzersizler} basariliOlunca={() => setAcik(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

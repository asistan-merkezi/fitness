"use client";

import { useState } from "react";
import { CirclePlus } from "lucide-react";
import type { HesapSecenegi } from "@/components/panel/yontem-hesap-secimi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GiderFormu } from "./gider-formu";

/** "Yeni Gider" / "Yeni Kamu Ödemesi" düğmesi: formu pencerede açar, kayıt başarılı olunca kapatıp formu sıfırlar. */
export function YeniGiderButonu({ tur, hesaplar, bugun }: { tur: "gider" | "kamusal"; hesaplar: HesapSecenegi[]; bugun: string }) {
  const [acik, setAcik] = useState(false);
  const [formAnahtari, setFormAnahtari] = useState(0);
  const baslik = tur === "kamusal" ? "Yeni Kamu Ödemesi" : "Yeni Gider";

  return (
    <>
      <Button type="button" onClick={() => setAcik(true)}>
        <CirclePlus aria-hidden /> {baslik}
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{baslik}</DialogTitle>
          </DialogHeader>
          <GiderFormu
            key={formAnahtari}
            tur={tur}
            hesaplar={hesaplar}
            bugun={bugun}
            basariliOlunca={() => {
              setAcik(false);
              setFormAnahtari((k) => k + 1);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

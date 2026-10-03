"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KisiselFormu, type KisiselBilgi } from "./kisisel-formlari";

/** "Düzenle" penceresi (klinik düzeni): kişisel bilgilerin tamamı tek formda; başarılı kayıtta pencere kapanır. */
export function KisiselDuzenleDiyalog({ kullaniciId, bilgi }: { kullaniciId: string; bilgi: KisiselBilgi | null }) {
  const [acik, setAcik] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAcik(true)}>
        <Pencil aria-hidden /> Düzenle
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Kişisel Bilgileri Düzenle</DialogTitle>
            <DialogDescription>Form tüm alanları gönderir; boş bıraktığınız alan temizlenir.</DialogDescription>
          </DialogHeader>
          <KisiselFormu kullaniciId={kullaniciId} bilgi={bilgi} basariliOlunca={() => setAcik(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

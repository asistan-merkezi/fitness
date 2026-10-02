"use client";

import { useState, useTransition } from "react";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PaketSatiri } from "@/types/veritabani";
import type { MusteriSecenegi } from "../dersler/ders-sorgulari";
import { MusteriArama } from "../dersler/musteri-arama";
import { SatisFormu } from "../musteriler/[id]/islem-formlari";
import { musteriIskontoYuzdesi } from "./actions";

/**
 * "Paketi Sat" penceresi (klinikteki Paket Satış penceresi): müşteri aranıp seçilir, paket önceden seçili satış formu açılır.
 * Satış müşteri kartındakiyle AYNI formdur (üyelik + borç + isteğe bağlı ilk tahsilat tek işlemde); kategori iskontosu önerilir.
 */
export function PaketSatisDialog({ paket, bugun }: { paket: PaketSatiri; bugun: string }) {
  const [acik, setAcik] = useState(false);
  const [musteri, setMusteri] = useState<MusteriSecenegi | null>(null);
  const [yuzde, setYuzde] = useState(0);
  const [, basla] = useTransition();

  function musteriSecildi(m: MusteriSecenegi) {
    setMusteri(m);
    basla(async () => setYuzde(await musteriIskontoYuzdesi(m.id)));
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAcik(true)}>
        <ShoppingCart aria-hidden /> Paketi Sat
      </Button>
      <Dialog
        open={acik}
        onOpenChange={(a) => {
          setAcik(a);
          if (!a) setMusteri(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Paketi Sat: {paket.ad}</DialogTitle>
            <DialogDescription>Müşteriyi arayıp seçin; satış üyelik, borç ve (varsa) ilk tahsilatı tek işlemde kaydeder.</DialogDescription>
          </DialogHeader>
          <MusteriArama id="ps_musteri" onSecim={musteriSecildi} onTemizle={() => setMusteri(null)} />
          {musteri && <SatisFormu key={`${musteri.id}-${yuzde}`} musteriId={musteri.id} paketler={[paket]} varsayilanPaketId={paket.id} bugun={bugun} kategoriYuzdesi={yuzde} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

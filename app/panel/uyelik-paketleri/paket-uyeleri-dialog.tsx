"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { gunYazi } from "@/lib/datetime";
import { UYELIK_DURUMU } from "@/lib/panel/etiketler";
import type { PaketSatiri } from "@/types/veritabani";
import { type PaketUyesi, paketUyeleriGetir } from "./actions";

/** Paketi satın almış üyeler (klinikteki "Katılımcılar"): pencere açılınca sunucudan çekilir; satır müşteri kartına gider. */
export function PaketUyeleriDialog({ paket }: { paket: PaketSatiri }) {
  const [acik, setAcik] = useState(false);
  const [uyeler, setUyeler] = useState<PaketUyesi[] | null>(null);
  const [yukleniyor, basla] = useTransition();

  function ac() {
    setAcik(true);
    basla(async () => setUyeler(await paketUyeleriGetir(paket.id)));
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={ac}>
        <Users aria-hidden /> Üyeler
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Üyeler: {paket.ad}</DialogTitle>
            <DialogDescription>Bu paketi satın alan üyelikler (en yeni önce).</DialogDescription>
          </DialogHeader>
          {yukleniyor || uyeler === null ? (
            <p className="text-sm text-muted-foreground">Yükleniyor…</p>
          ) : uyeler.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bu paketi satın alan üye yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Müşteri</th>
                    <th className="py-1.5 pr-2 font-medium">Başlangıç</th>
                    <th className="py-1.5 pr-2 font-medium">Bitiş</th>
                    <th className="py-1.5 pr-2 text-right font-medium">{paket.tur === "seans" ? "Kalan hak" : "Süre"}</th>
                    <th className="py-1.5 font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {uyeler.map((u, i) => {
                    const d = UYELIK_DURUMU[u.gecerli_durum as keyof typeof UYELIK_DURUMU];
                    return (
                      <tr key={`${u.musteri_id}-${i}`}>
                        <td className="py-1.5 pr-2">
                          <Link href={`/panel/musteriler/${u.musteri_id}?sekme=uyelikler`} className="font-medium hover:underline">
                            {u.ad_soyad}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-2 tabular-nums">{gunYazi(u.baslangic_tarihi)}</td>
                        <td className="py-1.5 pr-2 tabular-nums">{u.bitis_tarihi ? gunYazi(u.bitis_tarihi) : "Süresiz"}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{paket.tur === "seans" ? `${u.kalan_hak ?? 0} / ${u.toplam_hak ?? 0}` : "—"}</td>
                        <td className="py-1.5">{d ? <StatusBadge tone={d.ton}>{d.etiket}</StatusBadge> : u.gecerli_durum}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

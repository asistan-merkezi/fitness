"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DersEylemi } from "@/lib/panel/ders";
import type { StatusTone } from "@/lib/ui/durum-tonlari";
import { DersEylemleri } from "./ders-eylemleri";

export type DersDetayi = {
  id: string;
  musteriId: string;
  musteriAdi: string;
  antrenorAdi: string;
  alanAdi: string;
  /** Hazır biçimlenmiş (İstanbul saati): "28 Eylül 2026 · 10:00–11:00". */
  zaman: string;
  durumEtiketi: string;
  durumTonu: StatusTone;
  ucret: string | null;
  haktenDustu: boolean;
  cariyeYazildi: boolean;
  gecikmeDk: number | null;
  notMetni: string | null;
  eylemler: DersEylemi[];
  tasimaBaslangici: string;
  yonetim: boolean;
};

/**
 * Ders detayı penceresi (klinikteki randevu detay paneli): çizelgede bir derse tıklayınca açılır, durum eylemleri ve erteleme
 * burada yapılır. Açık/kapalı durumu URL'den (`?ders=`) gelir; eylemler sayfayı yenilediği için pencere güncel durumu gösterir.
 */
export function DersDetayDialog({ ders, kapatHref }: { ders: DersDetayi; kapatHref: string }) {
  const router = useRouter();
  const islendi = ders.haktenDustu || ders.cariyeYazildi;

  return (
    <Dialog open onOpenChange={(acik) => !acik && router.replace(kapatHref, { scroll: false })}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Ders Detayı</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={ders.durumTonu}>{ders.durumEtiketi}</StatusBadge>
          {ders.haktenDustu && <StatusBadge tone="emerald">Paketten düştü</StatusBadge>}
          {ders.cariyeYazildi && <StatusBadge tone="amber">Cariye yazıldı</StatusBadge>}
          {!islendi && ders.ucret && <span className="text-xs text-muted-foreground tabular-nums">{ders.ucret}</span>}
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Müşteri</dt>
            <dd className="font-medium">
              {ders.yonetim ? (
                <Link href={`/panel/musteriler/${ders.musteriId}`} className="hover:underline">
                  {ders.musteriAdi}
                </Link>
              ) : (
                ders.musteriAdi
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Zaman</dt>
            <dd className="font-medium tabular-nums">{ders.zaman}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Antrenör</dt>
            <dd className="font-medium">{ders.antrenorAdi}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Alan / stüdyo</dt>
            <dd className="font-medium">{ders.alanAdi}</dd>
          </div>
          {(ders.gecikmeDk || ders.notMetni) && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Not</dt>
              <dd>
                {ders.gecikmeDk ? `${ders.gecikmeDk} dk geç geldi. ` : ""}
                {ders.notMetni}
              </dd>
            </div>
          )}
        </dl>

        <DersEylemleri dersId={ders.id} eylemler={ders.eylemler} tasimaBaslangici={ders.tasimaBaslangici} />
      </DialogContent>
    </Dialog>
  );
}

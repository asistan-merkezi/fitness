"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
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
  /** Müşterinin aktif risk bayrakları (yalnız yönetim/resepsiyon için dolu; sağlık verisidir). */
  riskler: { etiket: string; seviye: "yuksek" | "orta" | "dusuk" }[];
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

        {ders.riskler.length > 0 && (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {ders.riskler.map((r, i) => (
              <StatusBadge key={i} tone={r.seviye === "yuksek" ? "rose" : r.seviye === "orta" ? "amber" : "slate"}>
                {r.etiket}
              </StatusBadge>
            ))}
          </div>
        )}

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

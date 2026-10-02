"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Alan } from "@/components/panel/form-alanlari";
import { SecimKutusu } from "@/components/panel/eylem-formu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { RISK_SEVIYE_ETIKETLERI, RISK_TIPI_ETIKETLERI } from "@/lib/panel/etiketler";
import type { StatusTone } from "@/lib/ui/durum-tonlari";
import { cn } from "@/lib/utils";
import { riskBayragiEkle, riskBayragiKaldir } from "./risk-actions";

export type RiskBayragi = { id: string; tip: string; seviye: "yuksek" | "orta" | "dusuk"; aciklama: string | null };

const SEVIYE_TONU: Record<RiskBayragi["seviye"], StatusTone> = { yuksek: "rose", orta: "amber", dusuk: "slate" };
const BANT_SINIFI: Record<RiskBayragi["seviye"], string> = {
  yuksek: "border-destructive-border bg-destructive-soft text-destructive",
  orta: "border-warning-border bg-warning-soft text-warning",
  dusuk: "border-border bg-surface text-muted-foreground",
};
/** Müşteri oluşturulurken işaretlenen eski (düz) risk bayrakları: seviyesiz olduklarından "orta" gösterilir. */
const ESKI_ETIKET: Record<string, string> = { saglik_riski: "Sağlık riski", sakatlik_riski: "Sakatlık riski" };

function KaldirDugmesi({ musteriId, riskId }: { musteriId: string; riskId: string }) {
  const [durum, eylem, bekliyor] = useActionState(riskBayragiKaldir, null);
  return (
    <form action={eylem} className="flex items-center gap-2">
      <input type="hidden" name="musteri_id" value={musteriId} />
      <input type="hidden" name="risk_id" value={riskId} />
      <Button type="submit" size="sm" variant="outline" disabled={bekliyor} onClick={(e) => !window.confirm("Risk bayrağı kaldırılsın mı?") && e.preventDefault()}>
        Kaldır
      </Button>
      {durum && !durum.success && <span className="text-xs text-destructive">{durum.message}</span>}
    </form>
  );
}

function EkleFormu({ musteriId }: { musteriId: string }) {
  const [durum, eylem, bekliyor] = useActionState(riskBayragiEkle, null);
  return (
    <form action={eylem} className="flex flex-col gap-3 border-t border-border pt-4">
      <p className="text-sm font-semibold">Yeni risk bayrağı</p>
      <input type="hidden" name="musteri_id" value={musteriId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Alan etiket="Tür" htmlFor="rb_tip">
          <SecimKutusu id="rb_tip" name="tip" required defaultValue="">
            <option value="" disabled>
              Seçin
            </option>
            {Object.entries(RISK_TIPI_ETIKETLERI).map(([k, e]) => (
              <option key={k} value={k}>
                {e}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        <Alan etiket="Seviye" htmlFor="rb_seviye">
          <SecimKutusu id="rb_seviye" name="seviye" defaultValue="orta">
            {Object.entries(RISK_SEVIYE_ETIKETLERI).map(([k, e]) => (
              <option key={k} value={k}>
                {e}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        <div className="sm:col-span-2">
          <Alan etiket="Açıklama (isteğe bağlı)" htmlFor="rb_aciklama" ipucu="Kısa tutun (en fazla 200 karakter); antrenörün bilmesi gereken kısıtı yazın.">
            <Input id="rb_aciklama" name="aciklama" maxLength={200} autoComplete="off" />
          </Alan>
        </div>
      </div>
      {durum && (
        <p role={durum.success ? "status" : "alert"} className={cn("text-sm font-medium", durum.success ? "text-success" : "text-destructive")}>
          {durum.message}
        </p>
      )}
      <Button type="submit" disabled={bekliyor} className="w-fit">
        {bekliyor ? "Ekleniyor..." : "Bayrağı Ekle"}
      </Button>
    </form>
  );
}

/**
 * Risk Bandı (klinikteki hasta risk bandı): müşteri kartının üstünde sağlık/sakatlık uyarıları. Bant en yüksek seviyeye göre
 * renklenir; tıklayınca pencere açılır (liste, kaldır, yeni ekle). Bayrak yoksa küçük bir "Risk bayrağı ekle" düğmesi görünür.
 */
export function RiskBandi({ musteriId, bayraklar, eskiBayraklar, duzenlenebilir }: { musteriId: string; bayraklar: RiskBayragi[]; eskiBayraklar: string[]; duzenlenebilir: boolean }) {
  const [acik, setAcik] = useState(false);
  const toplam = bayraklar.length + eskiBayraklar.length;
  const enYuksek: RiskBayragi["seviye"] = bayraklar.some((r) => r.seviye === "yuksek") ? "yuksek" : bayraklar.some((r) => r.seviye === "orta") || eskiBayraklar.length > 0 ? "orta" : "dusuk";

  return (
    <>
      {toplam === 0 ? (
        duzenlenebilir && (
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setAcik(true)}>
            <Plus aria-hidden /> Risk bayrağı ekle
          </Button>
        )
      ) : (
        <button type="button" onClick={() => setAcik(true)} className={cn("flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:brightness-95", BANT_SINIFI[enYuksek])}>
          <AlertTriangle className="size-5 shrink-0" aria-hidden />
          <span className="flex flex-wrap items-center gap-1.5">
            {bayraklar.map((r) => (
              <StatusBadge key={r.id} tone={SEVIYE_TONU[r.seviye]}>
                {RISK_TIPI_ETIKETLERI[r.tip] ?? r.tip}
                {r.aciklama ? `: ${r.aciklama}` : ""}
              </StatusBadge>
            ))}
            {eskiBayraklar.map((k) => (
              <StatusBadge key={k} tone="amber">
                {ESKI_ETIKET[k] ?? k}
              </StatusBadge>
            ))}
          </span>
        </button>
      )}

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Risk Bayrakları</DialogTitle>
            <DialogDescription>Antrenörün ve resepsiyonun bilmesi gereken sağlık/sakatlık uyarıları. Kaldırılan bayrak silinmez, geçmişte kalır.</DialogDescription>
          </DialogHeader>

          {toplam === 0 ? (
            <p className="text-sm text-muted-foreground">Aktif risk bayrağı yok.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {bayraklar.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {RISK_TIPI_ETIKETLERI[r.tip] ?? r.tip}
                      <StatusBadge tone={SEVIYE_TONU[r.seviye]}>{RISK_SEVIYE_ETIKETLERI[r.seviye]}</StatusBadge>
                    </p>
                    {r.aciklama && <p className="text-xs text-muted-foreground">{r.aciklama}</p>}
                  </div>
                  {duzenlenebilir && <KaldirDugmesi musteriId={musteriId} riskId={r.id} />}
                </li>
              ))}
              {eskiBayraklar.map((k) => (
                <li key={k} className="py-2.5 text-sm">
                  <span className="font-semibold">{ESKI_ETIKET[k] ?? k}</span>
                  <span className="ml-2 text-xs text-muted-foreground">Kayıt sırasında işaretlendi; ayrıntı için yukarıdan yeni bayrak ekleyin.</span>
                </li>
              ))}
            </ul>
          )}

          {duzenlenebilir && <EkleFormu musteriId={musteriId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

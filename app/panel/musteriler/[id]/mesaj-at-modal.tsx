"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { KANAL_ETIKET, KANAL_SIRASI, type MesajKanal } from "@/types/mesajlasma";
import { type MesajSecenegi, type MesajSecenekleri, musteriMesajiGonder, musteriMesajSecenekleriGetir } from "./mesaj-actions";

/**
 * Mesaj At (klinikteki hasta Mesaj At penceresi): şablon listesi → metni düzenle, kanal(lar)ı işaretle, gönder.
 * Ticari şablon, müşterinin ticari ileti onayı yoksa pasiftir; sunucu da aynı kuralı yeniden denetler.
 */
export function MesajAtModal({ musteriId }: { musteriId: string }) {
  const [acik, setAcik] = useState(false);
  const [secenekler, setSecenekler] = useState<MesajSecenekleri | null>(null);
  const [secili, setSecili] = useState<MesajSecenegi | null>(null);
  const [metin, setMetin] = useState("");
  const [kanallar, setKanallar] = useState<MesajKanal[]>([]);
  const [sonuc, setSonuc] = useState<{ success: boolean; message: string } | null>(null);
  const [bekliyor, basla] = useTransition();

  function degistir(deger: boolean) {
    setAcik(deger);
    if (!deger) {
      setSecenekler(null);
      setSecili(null);
      setMetin("");
      setKanallar([]);
      setSonuc(null);
    }
  }

  useEffect(() => {
    if (!acik) return;
    let iptal = false;
    musteriMesajSecenekleriGetir(musteriId)
      .then((s) => !iptal && setSecenekler(s))
      .catch(() => !iptal && setSecenekler({ ok: false, hata: "Şablonlar yüklenemedi." }));
    return () => {
      iptal = true;
    };
  }, [acik, musteriId]);

  function sec(s: MesajSecenegi) {
    if (!secenekler?.ok) return;
    const uygun = KANAL_SIRASI.filter((k) => secenekler.kanallar[k]);
    setSecili(s);
    setMetin(s.metin);
    setKanallar(secenekler.kanallar.sms ? ["sms"] : uygun.slice(0, 1));
    setSonuc(null);
  }

  function kanalDegistir(k: MesajKanal, isaretli: boolean) {
    setKanallar((onceki) => (isaretli ? [...onceki, k] : onceki.filter((x) => x !== k)));
  }

  function gonder() {
    if (!secili) return;
    basla(async () => {
      setSonuc(await musteriMesajiGonder(musteriId, { kod: secili.kod, metin, kanallar }));
    });
  }

  const gonderildi = sonuc?.success === true;

  return (
    <>
      <Button type="button" variant="outline" size="lg" onClick={() => degistir(true)}>
        <MessageSquare aria-hidden /> Mesaj At
      </Button>
      <Dialog open={acik} onOpenChange={degistir}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Mesaj At</DialogTitle>
            <DialogDescription>{secili ? "Metni düzenleyin, kanalı seçin ve gönderin." : "Müşteriye göndermek istediğiniz şablonu seçin."}</DialogDescription>
          </DialogHeader>

          {!secenekler ? (
            <p className="text-sm text-muted-foreground">Yükleniyor…</p>
          ) : !secenekler.ok ? (
            <p role="alert" className="text-sm text-destructive">
              {secenekler.hata}
            </p>
          ) : !secili ? (
            <ul className="flex flex-col gap-2">
              {secenekler.sablonlar.length === 0 && <li className="text-sm text-muted-foreground">Elle gönderilebilir şablon yok.</li>}
              {secenekler.sablonlar.map((s) => (
                <li key={s.kod}>
                  <button
                    type="button"
                    disabled={s.engelli}
                    onClick={() => sec(s)}
                    className={cn("flex w-full flex-col gap-1 rounded-lg border border-border p-3 text-left transition-colors", s.engelli ? "cursor-not-allowed opacity-60" : "hover:bg-surface")}
                  >
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {s.ad}
                      {s.ticari && <StatusBadge tone="amber">Ticari</StatusBadge>}
                      {s.engelli && <StatusBadge tone="rose">Ticari ileti onayı yok</StatusBadge>}
                    </span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{s.metin}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold">{secili.ad}</p>
              <Textarea value={metin} onChange={(e) => setMetin(e.target.value)} rows={6} maxLength={1000} aria-label="Mesaj metni" disabled={gonderildi} />
              <fieldset className="flex flex-wrap gap-4" disabled={gonderildi}>
                <legend className="sr-only">Kanal</legend>
                {KANAL_SIRASI.map((k) => {
                  const uygun = secenekler.kanallar[k];
                  return (
                    <label key={k} className={cn("flex items-center gap-2 text-sm", !uygun && "text-muted-foreground")}>
                      <input type="checkbox" className="size-4 accent-primary" disabled={!uygun} checked={kanallar.includes(k)} onChange={(e) => kanalDegistir(k, e.target.checked)} />
                      {KANAL_ETIKET[k]}
                      {!uygun && <span className="text-xs">(bilgi yok)</span>}
                    </label>
                  );
                })}
              </fieldset>
              {sonuc && (
                <p role={sonuc.success ? "status" : "alert"} className={cn("text-sm font-medium", sonuc.success ? "text-success" : "text-destructive")}>
                  {sonuc.message}
                </p>
              )}
              <div className="flex justify-end gap-2">
                {gonderildi ? (
                  <Button type="button" onClick={() => degistir(false)}>
                    Kapat
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="outline" onClick={() => setSecili(null)} disabled={bekliyor}>
                      Listeye dön
                    </Button>
                    <Button type="button" onClick={gonder} disabled={bekliyor || kanallar.length === 0 || metin.trim() === ""}>
                      {bekliyor ? "Gönderiliyor…" : "Gönder"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

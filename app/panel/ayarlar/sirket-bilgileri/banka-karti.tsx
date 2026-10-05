"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Alan, IsimGirdisi } from "@/components/panel/form-alanlari";
import { EylemFormu } from "@/components/panel/eylem-formu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ibanBicimle } from "@/lib/iban";
import { cn } from "@/lib/utils";
import type { BankaHesabiSatiri } from "@/types/veritabani";
import { bankaHesabiDurumDegistir, bankaHesabiKaydet } from "./actions";

const TIP_ETIKETI = { isletme: "Şirket Hesabı", sahis: "Şahıs Hesabı" } as const;

/** Hesap tipi: iki büyük seçim düğmesi (formla `hesap_tipi` olarak gider). */
function HesapTipiSecimi({ varsayilan }: { varsayilan: "isletme" | "sahis" }) {
  const [tip, setTip] = useState(varsayilan);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Hesap Tipi</span>
      <input type="hidden" name="hesap_tipi" value={tip} />
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Hesap tipi">
        {(["isletme", "sahis"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tip === t}
            onClick={() => setTip(t)}
            className={cn("h-11 rounded-lg border text-sm font-medium transition-colors", tip === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-surface-2")}
          >
            {TIP_ETIKETI[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "Yeni Banka Hesabı" / "Banka Hesabını Düzenle" kutusu. Kaydedilince ya da İptal'de kapanır. */
function HesapKutusu({ hesap, kapat }: { hesap?: BankaHesabiSatiri; kapat: () => void }) {
  const on = hesap ? `bh_${hesap.id}_` : "bh_yeni_";
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-5">
      <p className="mb-4 text-base font-semibold">{hesap ? "Banka Hesabını Düzenle" : "Yeni Banka Hesabı"}</p>
      <EylemFormu eylem={bankaHesabiKaydet} gonder="Kaydet" basariliOlunca={kapat} className="gap-5" gonderSinifi="w-full">
        {hesap && <input type="hidden" name="hesap_id" value={hesap.id} />}
        {hesap?.aktif && <input type="hidden" name="aktif" value="on" />}
        <HesapTipiSecimi varsayilan={hesap?.hesap_tipi ?? "isletme"} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Alan etiket="Banka Adı *" htmlFor={`${on}banka`}>
            <IsimGirdisi id={`${on}banka`} name="banka_adi" varsayilan={hesap?.banka_adi ?? ""} placeholder="Türkiye İş Bankası" required />
          </Alan>
          <Alan etiket="Şube" htmlFor={`${on}sube`}>
            <IsimGirdisi id={`${on}sube`} name="sube" varsayilan={hesap?.sube ?? ""} placeholder="Şube adı / kodu" />
          </Alan>
          <Alan etiket="Hesap Sahibi" htmlFor={`${on}sahip`}>
            <IsimGirdisi id={`${on}sahip`} name="hesap_sahibi" varsayilan={hesap?.hesap_sahibi ?? ""} placeholder="Ad Soyad / Şirket unvanı" required />
          </Alan>
          <Alan etiket="IBAN" htmlFor={`${on}iban`} ipucu="TR ile başlayan 26 karakter; boşluklu yazılabilir.">
            <Input id={`${on}iban`} name="iban" defaultValue={hesap ? ibanBicimle(hesap.iban) : ""} placeholder="TR00 0000 0000 0000 0000 0000 00" required autoComplete="off" spellCheck={false} className="font-mono" />
          </Alan>
        </div>
      </EylemFormu>
      <Button type="button" variant="outline" onClick={kapat} className="mt-3 w-full">
        İptal
      </Button>
    </div>
  );
}

export function BankaKarti({ hesaplar }: { hesaplar: BankaHesabiSatiri[] }) {
  // "yeni" = boş form, hesap id'si = o hesabın düzenleme formu, null = kapalı.
  const [acik, setAcik] = useState<string | null>(null);
  const [bekliyor, basla] = useTransition();
  const [mesaj, setMesaj] = useState<{ basarili: boolean; metin: string } | null>(null);
  const duzenlenen = acik && acik !== "yeni" ? hesaplar.find((h) => h.id === acik) : undefined;

  const durumDegistir = (h: BankaHesabiSatiri) => {
    if (h.aktif && !window.confirm(`${h.banka_adi} (${h.hesap_sahibi}) hesabı pasife alınsın mı? Hesap silinmez; geçmiş hareketler korunur, yeni hareketlerde seçilemez.`)) return;
    basla(async () => {
      const sonuc = await bankaHesabiDurumDegistir(h.id, !h.aktif);
      setMesaj({ basarili: sonuc.success, metin: sonuc.message });
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {acik === "yeni" && <HesapKutusu kapat={() => setAcik(null)} />}
      {acik === null && (
        <div>
          <Button type="button" onClick={() => setAcik("yeni")}>
            <Plus aria-hidden /> Yeni Banka Hesabı
          </Button>
        </div>
      )}
      {duzenlenen && <HesapKutusu key={duzenlenen.id} hesap={duzenlenen} kapat={() => setAcik(null)} />}

      {mesaj && (
        <p role="status" className={cn("rounded-lg border px-3 py-2 text-sm font-medium", mesaj.basarili ? "border-success-border bg-success-soft text-success" : "border-destructive-border bg-destructive-soft text-destructive")}>
          {mesaj.metin}
        </p>
      )}

      {hesaplar.length === 0 ? (
        <p className="text-sm text-muted-foreground">Henüz banka hesabı yok.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table className="min-w-[44rem]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Hesap Tipi</TableHead>
                <TableHead>Banka</TableHead>
                <TableHead>Şube</TableHead>
                <TableHead>Hesap Sahibi</TableHead>
                <TableHead>IBAN</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {hesaplar.map((h) => (
                <TableRow key={h.id} className={cn(!h.aktif && "opacity-60")}>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge tone={h.hesap_tipi === "sahis" ? "amber" : "indigo"}>{TIP_ETIKETI[h.hesap_tipi]}</StatusBadge>
                      {!h.aktif && <StatusBadge tone="slate">Pasif</StatusBadge>}
                    </span>
                  </TableCell>
                  <TableCell className="font-semibold">{h.banka_adi}</TableCell>
                  <TableCell className="text-muted-foreground">{h.sube ?? "—"}</TableCell>
                  <TableCell>{h.hesap_sahibi}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">{ibanBicimle(h.iban)}</TableCell>
                  <TableCell>
                    <span className="flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="icon" aria-label={`${h.banka_adi} hesabını düzenle`} onClick={() => setAcik(h.id)}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" disabled={bekliyor} aria-label={h.aktif ? `${h.banka_adi} hesabını pasife al` : `${h.banka_adi} hesabını yeniden kullanıma aç`} onClick={() => durumDegistir(h)}>
                        {h.aktif ? <Trash2 aria-hidden /> : <RotateCcw aria-hidden />}
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

"use client";

import { Alan, IsimGirdisi, OnayKutusu } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { ibanBicimle } from "@/lib/iban";
import type { BankaHesabiSatiri } from "@/types/veritabani";
import { bankaHesabiKaydet } from "./actions";

function HesapFormu({ hesap }: { hesap?: BankaHesabiSatiri }) {
  const on = hesap ? `bh_${hesap.id}_` : "bh_yeni_";
  return (
    <EylemFormu eylem={bankaHesabiKaydet} gonder={hesap ? "Kaydet" : "Hesap Ekle"} varyant={hesap ? "outline" : "default"}>
      {hesap && <input type="hidden" name="hesap_id" value={hesap.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Banka adı" htmlFor={`${on}banka`}>
          <IsimGirdisi id={`${on}banka`} name="banka_adi" varsayilan={hesap?.banka_adi ?? ""} required />
        </Alan>
        <Alan etiket="Şube" htmlFor={`${on}sube`}>
          <IsimGirdisi id={`${on}sube`} name="sube" varsayilan={hesap?.sube ?? ""} />
        </Alan>
        <Alan etiket="Hesap sahibi" htmlFor={`${on}sahip`}>
          <IsimGirdisi id={`${on}sahip`} name="hesap_sahibi" varsayilan={hesap?.hesap_sahibi ?? ""} required />
        </Alan>
        <Alan etiket="Hesap türü" htmlFor={`${on}tip`}>
          <SecimKutusu id={`${on}tip`} name="hesap_tipi" defaultValue={hesap?.hesap_tipi ?? "isletme"}>
            <option value="isletme">İşletme hesabı</option>
            <option value="sahis">Şahıs hesabı</option>
          </SecimKutusu>
        </Alan>
        <div className="sm:col-span-2">
          <Alan etiket="IBAN" htmlFor={`${on}iban`} ipucu="TR ile başlayan 26 karakter; boşluklu yazılabilir.">
            <Input id={`${on}iban`} name="iban" defaultValue={hesap ? ibanBicimle(hesap.iban) : ""} required autoComplete="off" spellCheck={false} className="font-mono" />
          </Alan>
        </div>
      </div>
      {hesap && <OnayKutusu id={`${on}aktif`} name="aktif" etiket="Kullanımda (aktif)" varsayilan={hesap.aktif} />}
    </EylemFormu>
  );
}

export function BankaKarti({ hesaplar }: { hesaplar: BankaHesabiSatiri[] }) {
  return (
    <div className="flex flex-col gap-5">
      {hesaplar.length === 0 ? (
        <p className="text-sm text-muted-foreground">Henüz banka hesabı yok.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {hesaplar.map((h) => (
            <li key={h.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {h.banka_adi}
                  {h.sube && <span className="font-normal text-muted-foreground"> · {h.sube}</span>}
                </p>
                <span className="flex items-center gap-2">
                  {h.hesap_tipi === "sahis" && <StatusBadge tone="sky">Şahıs</StatusBadge>}
                  <StatusBadge tone={h.aktif ? "emerald" : "slate"}>{h.aktif ? "Aktif" : "Pasif"}</StatusBadge>
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{h.hesap_sahibi}</p>
              <p className="mt-1 font-mono text-sm tabular-nums">{ibanBicimle(h.iban)}</p>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-primary select-none">Düzenle</summary>
                <div className="mt-4">
                  <HesapFormu hesap={h} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border pt-5">
        <p className="mb-3 text-sm font-semibold">Yeni hesap</p>
        <HesapFormu />
      </div>
    </div>
  );
}

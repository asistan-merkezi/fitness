"use client";

import { useActionState, useState } from "react";
import { CalendarDays, Check, ChevronDown, Minus, UserCog, Users, Wallet, type LucideIcon } from "lucide-react";
import { Alan, OnayKutusu } from "@/components/panel/form-alanlari";
import { SecimKutusu } from "@/components/panel/eylem-formu";
import { Button } from "@/components/ui/button";
import { IconTile, type IconTileTone } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { tetikleyiciGetir } from "@/lib/mesaj/tetikleyiciler";
import { cn } from "@/lib/utils";
import { type EtkinMesajKurali, KANAL_ETIKET, KANAL_SIRASI, type MesajBolum, type MesajKanal } from "@/types/mesajlasma";
import { mesajKuraliKaydet, mesajTestGonder } from "./actions";

const KANAL_ALAN = { sms: "sms_aktif", whatsapp: "whatsapp_aktif", mail: "mail_aktif" } as const;

// İkon bileşenleri sunucudan istemciye prop olarak geçirilemez; bölüm görünümü burada, istemci paketinde çözülür.
const BOLUM_GORUNUM: Record<MesajBolum, { icon: LucideIcon; tone: IconTileTone }> = {
  musteri: { icon: Users, tone: "blue" },
  randevu: { icon: CalendarDays, tone: "cyan" },
  personel: { icon: UserCog, tone: "violet" },
  muhasebe: { icon: Wallet, tone: "amber" },
};

function offsetParcala(dakika: number | null): { deger: string; birim: "dakika" | "saat" | "gun" } {
  if (dakika === null) return { deger: "", birim: "saat" };
  if (dakika % 1440 === 0) return { deger: String(dakika / 1440), birim: "gun" };
  if (dakika % 60 === 0) return { deger: String(dakika / 60), birim: "saat" };
  return { deger: String(dakika), birim: "dakika" };
}

export function KuralSatiri({ kural }: { kural: EtkinMesajKurali }) {
  const [acik, setAcik] = useState(false);
  const [durum, eylem, bekliyor] = useActionState(mesajKuraliKaydet, null);
  const [testDurum, testEylem, testBekliyor] = useActionState(mesajTestGonder, null);
  const [metin, setMetin] = useState(kural.mesaj_metni);
  const tanim = tetikleyiciGetir(kural.tetikleyici_kodu);
  const { icon: Ikon, tone } = BOLUM_GORUNUM[kural.bolum];
  const offset = offsetParcala(kural.zamanlama_offset_dakika);
  const metniBos = kural.mesaj_metni.trim().length === 0;
  const zamanlanmis = tanim?.tetiklemeTipi === "zamanlanmis";
  const on = `mk_${kural.tetikleyici_kodu}_`;

  return (
    <li className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        aria-expanded={acik}
        className={cn("flex w-full flex-col gap-3 p-3 text-left sm:flex-row sm:items-center", !kural.aktif && "opacity-70")}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <IconTile icon={Ikon} tone={tone} className="shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate font-medium">{kural.tetikleyici_adi}</span>
            <span className="flex flex-wrap items-center gap-1">
              {!kural.aktif && <StatusBadge tone="slate">Pasif</StatusBadge>}
              {kural.aktif && metniBos && <StatusBadge tone="amber">Öneri metni kullanılır</StatusBadge>}
              {!kural.bagli && <StatusBadge tone="slate">Henüz bağlı değil</StatusBadge>}
              {tanim?.icerikTipi === "ticari" && <StatusBadge tone="sky">Ticari · izin gerekir</StatusBadge>}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5 pl-[52px] sm:pl-0">
          {KANAL_SIRASI.map((kanal) => {
            const aktif = kural[KANAL_ALAN[kanal]];
            return (
              <StatusBadge key={kanal} tone={aktif ? "emerald" : "slate"}>
                {aktif ? <Check className="size-3" aria-hidden /> : <Minus className="size-3" aria-hidden />}
                {KANAL_ETIKET[kanal]}
              </StatusBadge>
            );
          })}
          <ChevronDown className={cn("ml-1 size-4 text-muted-foreground transition-transform", acik && "rotate-180")} aria-hidden />
        </span>
      </button>

      {acik && tanim && (
        <div className="flex flex-col gap-5 border-t border-border p-4">
          {tanim.baglanmaNotu && <p className="text-xs text-muted-foreground">{tanim.baglanmaNotu}</p>}

          <form action={eylem} className="flex flex-col gap-4">
            <input type="hidden" name="tetikleyici_kodu" value={kural.tetikleyici_kodu} />
            <OnayKutusu id={`${on}aktif`} name="aktif" etiket="Kural aktif" varsayilan={kural.aktif} />
            <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
              <legend className="mb-2 text-sm font-medium">Kanallar</legend>
              {KANAL_SIRASI.map((kanal: MesajKanal) => (
                <OnayKutusu key={kanal} id={`${on}${kanal}`} name={KANAL_ALAN[kanal]} etiket={KANAL_ETIKET[kanal]} varsayilan={kural[KANAL_ALAN[kanal]]} />
              ))}
            </fieldset>

            {zamanlanmis && (
              <div className="flex flex-wrap items-end gap-3">
                <Alan etiket="Zamanlama" htmlFor={`${on}offset`} ipucu={tanim.zamanlamaAciklamasi}>
                  <Input id={`${on}offset`} name="offset_deger" inputMode="numeric" defaultValue={offset.deger} className="w-28" autoComplete="off" />
                </Alan>
                <SecimKutusu name="offset_birim" defaultValue={offset.birim} className="w-32" aria-label="Zamanlama birimi">
                  <option value="dakika">dakika</option>
                  <option value="saat">saat</option>
                  <option value="gun">gün</option>
                </SecimKutusu>
              </div>
            )}

            <Alan etiket="Mesaj metni" htmlFor={`${on}metin`} ipucu={`Boş bırakılırsa öneri metni kullanılır. En fazla 1000 karakter; ${metin.length}/1000.`}>
              <Textarea id={`${on}metin`} name="mesaj_metni" rows={4} maxLength={1000} value={metin} onChange={(e) => setMetin(e.target.value)} placeholder={tanim.varsayilanMesajMetni} />
            </Alan>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Değişkenler (tıklayınca eklenir):</span>
              {tanim.gecerliDegiskenler.map((d) => (
                <button key={d} type="button" onClick={() => setMetin((m) => `${m}{{${d}}}`)} className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs hover:bg-surface-3">
                  {`{{${d}}}`}
                </button>
              ))}
              {metin.trim() === "" && (
                <button type="button" onClick={() => setMetin(tanim.varsayilanMesajMetni)} className="text-xs font-semibold text-primary hover:underline">
                  Öneri metnini kullan
                </button>
              )}
            </div>

            {durum && (
              <p role={durum.success ? "status" : "alert"} className={cn("rounded-lg border px-3 py-2 text-sm font-medium", durum.success ? "border-success-border bg-success-soft text-success" : "border-destructive-border bg-destructive-soft text-destructive")}>
                {durum.message}
              </p>
            )}
            <Button type="submit" disabled={bekliyor} className="w-fit">
              {bekliyor ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </form>

          <form action={testEylem} className="flex flex-col gap-2 border-t border-border pt-4">
            <input type="hidden" name="tetikleyici_kodu" value={kural.tetikleyici_kodu} />
            <p className="text-sm font-medium">Test gönder</p>
            <div className="flex flex-wrap items-end gap-2">
              <SecimKutusu name="kanal" defaultValue="sms" className="w-36" aria-label="Test kanalı">
                {KANAL_SIRASI.map((k) => (
                  <option key={k} value={k}>
                    {KANAL_ETIKET[k]}
                  </option>
                ))}
              </SecimKutusu>
              <Input name="adres" placeholder="Telefon veya e-posta" className="w-64" autoComplete="off" aria-label="Test alıcısı" />
              <Button type="submit" variant="outline" disabled={testBekliyor}>
                {testBekliyor ? "Gönderiliyor..." : "Gönder"}
              </Button>
            </div>
            {testDurum && (
              <p role={testDurum.success ? "status" : "alert"} className={cn("text-xs font-medium", testDurum.success ? "text-success" : "text-destructive")}>
                {testDurum.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Kayıtlı metin örnek değerlerle doldurulur ve başına [TEST] eklenir; gerçek krediden düşer.</p>
          </form>
        </div>
      )}
    </li>
  );
}

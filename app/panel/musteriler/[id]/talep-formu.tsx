"use client";

import { useState } from "react";
import { CalendarClock, CalendarPlus, CalendarX, MessageCircle, MessageSquareText, type LucideIcon } from "lucide-react";
import { Alan } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { talepOneriGonder, talepYanitla } from "./talep-actions";

type Tur = "ders_talebi" | "ders_iptali" | "ders_ertele" | "antrenor_yorumu" | "ders_yorumu";

const TURLER: { deger: Tur; etiket: string; ikon: LucideIcon }[] = [
  { deger: "ders_talebi", etiket: "Ders Talebi", ikon: CalendarPlus },
  { deger: "ders_iptali", etiket: "Ders İptali", ikon: CalendarX },
  { deger: "ders_ertele", etiket: "Ders Ertele", ikon: CalendarClock },
  { deger: "antrenor_yorumu", etiket: "Antrenör Yorumu", ikon: MessageCircle },
  { deger: "ders_yorumu", etiket: "Ders Hakkında Yorum", ikon: MessageSquareText },
];

const PUANLAR = [
  { deger: 1, emoji: "😟", etiket: "Çok Yetersiz" },
  { deger: 2, emoji: "🙁", etiket: "Yetersiz" },
  { deger: 3, emoji: "😐", etiket: "Orta" },
  { deger: 4, emoji: "🙂", etiket: "İyi" },
  { deger: 5, emoji: "😊", etiket: "Çok İyi" },
];

export type DersSecenegi = { id: string; etiket: string };

function DersSecimi({ dersler, bos }: { dersler: DersSecenegi[]; bos: string }) {
  if (dersler.length === 0) return <p className="text-sm text-muted-foreground">{bos}</p>;
  return (
    <Alan etiket="Ders" htmlFor="talep_ders">
      <SecimKutusu id="talep_ders" name="ders_id" required defaultValue="">
        <option value="" disabled>
          Ders seçin
        </option>
        {dersler.map((d) => (
          <option key={d.id} value={d.id}>
            {d.etiket}
          </option>
        ))}
      </SecimKutusu>
    </Alan>
  );
}

export function TalepFormu({
  musteriId,
  bugun,
  antrenorler,
  planliDersler,
  katildiDersler,
}: {
  musteriId: string;
  bugun: string;
  antrenorler: { id: string; ad: string }[];
  planliDersler: DersSecenegi[];
  katildiDersler: DersSecenegi[];
}) {
  const [tur, setTur] = useState<Tur>("ders_talebi");
  const yorumMu = tur === "antrenor_yorumu" || tur === "ders_yorumu";
  const gonderEtiketi = tur === "ders_iptali" ? "Dersi İptal Et" : tur === "ders_ertele" ? "Dersi Taşı" : yorumMu ? "Yorumu Kaydet" : "Talebi Kaydet";

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Talep türü" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {TURLER.map((t) => {
          const secili = tur === t.deger;
          const Ikon = t.ikon;
          return (
            <button
              key={t.deger}
              type="button"
              role="radio"
              aria-checked={secili}
              onClick={() => setTur(t.deger)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs font-medium transition-colors",
                secili ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground hover:text-foreground"
              )}
            >
              <Ikon className="size-5" strokeWidth={1.5} aria-hidden />
              {t.etiket}
            </button>
          );
        })}
      </div>

      <EylemFormu
        key={tur}
        eylem={talepOneriGonder}
        gonder={gonderEtiketi}
        varyant={tur === "ders_iptali" ? "destructive" : "default"}
        onay={tur === "ders_iptali" ? "Ders iptal edilsin mi?" : undefined}
        gonderSinifi="w-fit"
      >
        <input type="hidden" name="tur" value={tur} />
        <input type="hidden" name="musteri_id" value={musteriId} />

        {tur === "ders_talebi" && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Alan etiket="Tercih edilen tarih" htmlFor="talep_tarih">
                <Input id="talep_tarih" name="tarih" type="date" min={bugun} defaultValue={bugun} required />
              </Alan>
              <Alan etiket="Tercih edilen saat (isteğe bağlı)" htmlFor="talep_saat">
                <Input id="talep_saat" name="saat" type="time" />
              </Alan>
              <Alan etiket="Antrenör (isteğe bağlı)" htmlFor="talep_antrenor">
                <SecimKutusu id="talep_antrenor" name="antrenor_id" defaultValue="">
                  <option value="">Fark etmez</option>
                  {antrenorler.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.ad}
                    </option>
                  ))}
                </SecimKutusu>
              </Alan>
            </div>
            <Alan etiket="Not (isteğe bağlı)" htmlFor="talep_not">
              <Textarea id="talep_not" name="not" rows={2} maxLength={500} placeholder="Örn. akşam saatlerini tercih ediyor" />
            </Alan>
          </>
        )}

        {tur === "ders_iptali" && <DersSecimi dersler={planliDersler} bos="İptal edilebilecek planlanmış ders yok." />}

        {tur === "ders_ertele" && (
          <>
            <DersSecimi dersler={planliDersler} bos="Ertelenebilecek planlanmış ders yok." />
            {planliDersler.length > 0 && (
              <Alan etiket="Yeni tarih ve saat" htmlFor="talep_baslangic">
                <Input id="talep_baslangic" name="baslangic" type="datetime-local" required />
              </Alan>
            )}
          </>
        )}

        {yorumMu && (
          <>
            <DersSecimi dersler={katildiDersler} bos="Müşterinin katıldığı bir ders yok; yorum yalnızca katılınan ders için yazılır." />
            {katildiDersler.length > 0 && (
              <>
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="text-sm font-medium">Puan</legend>
                  <div className="flex gap-1.5">
                    {PUANLAR.map((p) => (
                      <label
                        key={p.deger}
                        className="flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl border border-border bg-surface px-1 py-2 text-center has-checked:border-primary has-checked:bg-primary/10"
                      >
                        <input type="radio" name="puan" value={p.deger} required className="sr-only" />
                        <span className="text-xl leading-none" aria-hidden>
                          {p.emoji}
                        </span>
                        <span className="text-[10px] leading-tight font-medium text-muted-foreground">{p.etiket}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Alan etiket={tur === "antrenor_yorumu" ? "Antrenör hakkındaki yorum" : "Ders hakkındaki yorum"} htmlFor="talep_yorum">
                  <Textarea id="talep_yorum" name="yorum" rows={3} maxLength={1000} required />
                </Alan>
              </>
            )}
          </>
        )}
      </EylemFormu>
    </div>
  );
}

/** Bekleyen ders talebi için "Planlandı" / "Reddet" düğmeleri. */
export function TalepYanitDugmeleri({ musteriId, talepId }: { musteriId: string; talepId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(
        [
          ["planlandi", "Planlandı"],
          ["reddedildi", "Reddet"],
        ] as const
      ).map(([durum, etiket]) => (
        <EylemFormu
          key={durum}
          eylem={talepYanitla}
          gonder={etiket}
          boyut="sm"
          varyant="outline"
          onay={durum === "reddedildi" ? "Talep reddedilsin mi?" : undefined}
          className="gap-1"
        >
          <input type="hidden" name="musteri_id" value={musteriId} />
          <input type="hidden" name="talep_id" value={talepId} />
          <input type="hidden" name="durum" value={durum} />
        </EylemFormu>
      ))}
    </div>
  );
}

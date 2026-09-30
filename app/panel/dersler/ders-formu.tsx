"use client";

import { Alan } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dersOlustur } from "./actions";

const SURELER = [30, 45, 60, 90, 120] as const;

export function DersFormu({
  musteriId,
  antrenorler,
  alanlar,
  varsayilanBaslangic,
}: {
  musteriId: string;
  antrenorler: { id: string; ad_soyad: string }[];
  alanlar: { id: string; ad: string }[];
  varsayilanBaslangic: string;
}) {
  return (
    <EylemFormu eylem={dersOlustur} gonder="Dersi Planla" yukleniyor="Planlanıyor..." anahtarli>
      <input type="hidden" name="musteri_id" value={musteriId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Antrenör" htmlFor="d_antrenor">
          <SecimKutusu id="d_antrenor" name="antrenor_id" required defaultValue="">
            <option value="" disabled>
              Seçin
            </option>
            {antrenorler.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ad_soyad}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        <Alan etiket="Alan / stüdyo" htmlFor="d_alan">
          <SecimKutusu id="d_alan" name="alan_id" required defaultValue="">
            <option value="" disabled>
              Seçin
            </option>
            {alanlar.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ad}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        <Alan etiket="Tarih ve saat" htmlFor="d_baslangic">
          <Input id="d_baslangic" name="baslangic" type="datetime-local" defaultValue={varsayilanBaslangic} required />
        </Alan>
        <Alan etiket="Süre" htmlFor="d_sure">
          <SecimKutusu id="d_sure" name="sure" defaultValue="60">
            {SURELER.map((s) => (
              <option key={s} value={s}>
                {s} dakika
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        <Alan etiket="Ders ücreti (₺)" htmlFor="d_ucret" ipucu="Müşterinin ders paketi yoksa bu tutar cariye borç yazılır. Boşsa ücretsiz.">
          <Input id="d_ucret" name="ucret" inputMode="decimal" autoComplete="off" />
        </Alan>
        <Alan etiket="Not" htmlFor="d_not">
          <Textarea id="d_not" name="not" rows={2} maxLength={300} />
        </Alan>
      </div>
    </EylemFormu>
  );
}

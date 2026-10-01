"use client";

import { useActionState, useState } from "react";
import { Alan, IsimGirdisi } from "@/components/panel/form-alanlari";
import { SecimKutusu } from "@/components/panel/eylem-formu";
import { YontemHesapSecimi, type HesapSecenegi } from "@/components/panel/yontem-hesap-secimi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GIDER_KATEGORI_ETIKETLERI, GIDER_YONTEMLERI } from "@/lib/panel/finans";
import { cn } from "@/lib/utils";
import { giderEkle } from "./actions";

/**
 * Yeni gider formu (Yeni Gider penceresinde). `tur`: Genel Giderler "gider", Kamusal Giderler "kamusal" — sekmeye göre sabittir.
 * Ödendi → yöntem (+hesap) zorunlu, kasa/bankayı hemen etkiler; Ödenecek → vade zorunlu, ödenene kadar hesaplara yansımaz.
 */
export function GiderFormu({ tur, hesaplar, bugun, basariliOlunca }: { tur: "gider" | "kamusal"; hesaplar: HesapSecenegi[]; bugun: string; basariliOlunca?: () => void }) {
  const [sonuc, formAction, bekliyor] = useActionState(giderEkle, null);
  const [gorulenSonuc, setGorulenSonuc] = useState(sonuc);
  const [ilkAnahtar] = useState(() => crypto.randomUUID());
  const [durum, setDurum] = useState<"odendi" | "bekliyor">("odendi");
  const kamusal = tur === "kamusal";

  if (sonuc !== gorulenSonuc) {
    setGorulenSonuc(sonuc);
    if (sonuc?.success) basariliOlunca?.();
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="anahtar" value={sonuc?.anahtar ?? ilkAnahtar} suppressHydrationWarning />
      <input type="hidden" name="tur" value={tur} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Gider tarihi" htmlFor="g_tarih" ipucu="Boşsa bugün.">
          <Input id="g_tarih" name="tarih" type="date" max={bugun} disabled={bekliyor} />
        </Alan>
        <Alan etiket="Kategori" htmlFor="g_kategori">
          <SecimKutusu id="g_kategori" name="kategori" required defaultValue={kamusal ? "vergi_sgk" : ""} disabled={bekliyor}>
            <option value="" disabled>
              Seçin
            </option>
            {Object.entries(GIDER_KATEGORI_ETIKETLERI).map(([k, e]) => (
              <option key={k} value={k}>
                {e}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        <Alan etiket={kamusal ? "Kurum" : "Tedarikçi"} htmlFor="g_tedarikci">
          <IsimGirdisi id="g_tedarikci" name="tedarikci" placeholder={kamusal ? "Vergi dairesi, SGK, belediye…" : "Tedarikçi / satıcı adı"} disabled={bekliyor} />
        </Alan>
        <Alan etiket="Tutar (₺)" htmlFor="g_tutar" ipucu="KDV dahil toplam.">
          <Input id="g_tutar" name="tutar" inputMode="decimal" required autoComplete="off" placeholder="0,00" disabled={bekliyor} />
        </Alan>
        <Alan etiket="Belge / fatura no" htmlFor="g_belge">
          <Input id="g_belge" name="belge_no" maxLength={60} autoComplete="off" disabled={bekliyor} />
        </Alan>
        <Alan etiket="KDV oranı (%)" htmlFor="g_kdv">
          <Input id="g_kdv" name="kdv_orani" inputMode="numeric" defaultValue="0" autoComplete="off" disabled={bekliyor} />
        </Alan>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium">Durum</span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Ödeme durumu">
            {(
              [
                ["odendi", "Ödendi"],
                ["bekliyor", "Ödenecek (vadeli)"],
              ] as const
            ).map(([kod, etiket]) => (
              <Button
                key={kod}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={durum === kod}
                disabled={bekliyor}
                className={cn(durum === kod && "!border-primary !bg-primary !text-primary-foreground hover:!bg-primary-hover")}
                onClick={() => setDurum(kod)}
              >
                {etiket}
              </Button>
            ))}
          </div>
          <input type="hidden" name="durum" value={durum} />
        </div>

        {durum === "bekliyor" ? (
          <Alan etiket="Vade tarihi" htmlFor="g_vade">
            <Input id="g_vade" name="vade" type="date" required disabled={bekliyor} />
          </Alan>
        ) : (
          <YontemHesapSecimi id="g" yontemler={GIDER_YONTEMLERI} hesaplar={hesaplar} yontemEtiketi="Ödeme yöntemi" />
        )}
      </div>
      <Alan etiket="Açıklama" htmlFor="g_aciklama">
        <Textarea id="g_aciklama" name="aciklama" rows={2} maxLength={300} disabled={bekliyor} />
      </Alan>

      {sonuc && !sonuc.success && (
        <p role="alert" className="rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
          {sonuc.message}
        </p>
      )}

      <Button type="submit" disabled={bekliyor} className="w-fit">
        {bekliyor ? "Kaydediliyor..." : "Kaydet"}
      </Button>
    </form>
  );
}

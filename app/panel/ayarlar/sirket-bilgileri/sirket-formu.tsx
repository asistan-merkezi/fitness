"use client";

import { useActionState, useRef, useState } from "react";
import { Alan, IsimGirdisi } from "@/components/panel/form-alanlari";
import { AdresSecici } from "@/components/ui/adres-secici";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TelefonGirisi } from "@/components/ui/telefon-girisi";
import { Textarea } from "@/components/ui/textarea";
import type { SirketBilgileri } from "@/types/veritabani";
import { cn } from "@/lib/utils";
import { sirketBilgileriKaydet } from "./actions";
import { logoHazirla } from "./logo-hazirla";

// Veritabanı "HH:MM:SS" döndürür; <input type="time"> saniyesiz gösterir.
const saatKisalt = (deger: string | null | undefined) => (deger ? deger.slice(0, 5) : "");

function LogoSecici({ etiket, ad, mevcut, koyu, hazirla }: { etiket: string; ad: string; mevcut: string | null; koyu?: boolean; hazirla: (ad: string, dosya: File | null) => void }) {
  const [onizleme, setOnizleme] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const girdiRef = useRef<HTMLInputElement>(null);

  async function sec(dosya: File | undefined) {
    setHata(null);
    if (!dosya) {
      setOnizleme(null);
      hazirla(ad, null);
      return;
    }
    setMesgul(true);
    try {
      const hazir = await logoHazirla(dosya);
      hazirla(ad, hazir);
      setOnizleme(URL.createObjectURL(hazir));
    } catch (e) {
      console.error("Logo hazırlanamadı:", e);
      setHata("Görsel hazırlanamadı, başka bir dosya deneyin.");
      hazirla(ad, null);
      setOnizleme(null);
      if (girdiRef.current) girdiRef.current.value = "";
    } finally {
      setMesgul(false);
    }
  }

  const kaynak = onizleme ?? mevcut;
  return (
    <div className="flex items-center gap-4">
      <div className={cn("flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border", koyu ? "bg-[#121316]" : "bg-white")}>
        {kaynak ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={kaynak} alt={etiket} className="size-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">Yok</span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`logo_${ad}`} className="text-sm font-medium">
          {etiket}
        </label>
        <input
          ref={girdiRef}
          id={`logo_${ad}`}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          disabled={mesgul}
          onChange={(e) => void sec(e.target.files?.[0])}
          className="text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm"
        />
        {mesgul && <p className="text-xs text-muted-foreground">Hazırlanıyor...</p>}
        {hata && <p className="text-xs text-destructive">{hata}</p>}
      </div>
    </div>
  );
}

export function SirketFormu({ bilgiler }: { bilgiler: SirketBilgileri | null }) {
  const [durum, eylem, bekliyor] = useActionState(sirketBilgileriKaydet, null);
  // Seçilen logolar (işlenmiş File) state'te tutulur: form eylemi sonrası dosya girişleri sıfırlanabildiğinden
  // FormData her gönderimde elle kurulur ve dosyalar yeniden eklenir.
  const logolar = useRef<Record<string, File | null>>({ logo: null, logo_koyu: null });

  function gonder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const veri = new FormData(e.currentTarget);
    for (const [ad, dosya] of Object.entries(logolar.current)) {
      if (dosya) veri.set(ad, dosya, dosya.name);
    }
    eylem(veri);
  }

  return (
    <form onSubmit={gonder} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <LogoSecici etiket="Logo (açık tema)" ad="logo" mevcut={bilgiler?.logo_url ?? null} hazirla={(ad, dosya) => (logolar.current[ad] = dosya)} />
        <LogoSecici etiket="Logo (koyu tema)" ad="logo_koyu" mevcut={bilgiler?.logo_url_koyu ?? null} koyu hazirla={(ad, dosya) => (logolar.current[ad] = dosya)} />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">Logo otomatik küçültülüp optimize edilir. Yalnız tek logo yüklenirse her iki temada o gösterilir.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Alan etiket="Şirket adı (PDF, e-posta ve mesajlarda kullanılır)" htmlFor="sb_ad">
            <IsimGirdisi id="sb_ad" name="ad" varsayilan={bilgiler?.ad ?? ""} required disabled={bekliyor} />
          </Alan>
        </div>
        <div className="sm:col-span-2">
          <Alan etiket="Şirket fatura ünvanı" htmlFor="sb_unvan">
            <IsimGirdisi id="sb_unvan" name="unvan" varsayilan={bilgiler?.unvan ?? ""} disabled={bekliyor} />
          </Alan>
        </div>

        <fieldset className="flex flex-col gap-3 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Adres</legend>
          <AdresSecici prefix="adres" defaultIl={bilgiler?.il} defaultIlce={bilgiler?.ilce} defaultMahalle={bilgiler?.mahalle} disabled={bekliyor} />
          <Alan etiket="Sokak / cadde, bina no, daire" htmlFor="sb_adres">
            <Textarea id="sb_adres" name="adres" rows={2} maxLength={300} defaultValue={bilgiler?.adres ?? ""} disabled={bekliyor} />
          </Alan>
        </fieldset>

        <Alan etiket="Vergi dairesi" htmlFor="sb_vd">
          <IsimGirdisi id="sb_vd" name="vergi_dairesi" varsayilan={bilgiler?.vergi_dairesi ?? ""} disabled={bekliyor} />
        </Alan>
        <Alan etiket="Vergi numarası" htmlFor="sb_vn" ipucu="10 (vergi no) veya 11 (T.C. kimlik no) hane.">
          <Input id="sb_vn" name="vergi_no" inputMode="numeric" maxLength={11} defaultValue={bilgiler?.vergi_no ?? ""} autoComplete="off" disabled={bekliyor} />
        </Alan>

        <TelefonGirisi ad="telefon" label="Şirket telefonu" varsayilanTelefon={bilgiler?.telefon} disabled={bekliyor} />
        <TelefonGirisi ad="whatsapp_no" label="WhatsApp numarası" varsayilanTelefon={bilgiler?.whatsapp_no} disabled={bekliyor} />
        <Alan etiket="E-posta" htmlFor="sb_eposta">
          <Input id="sb_eposta" name="eposta" type="email" defaultValue={bilgiler?.eposta ?? ""} autoComplete="off" disabled={bekliyor} />
        </Alan>
        <div />

        <div className="sm:col-span-2">
          <Alan etiket="Yetkili kişi" htmlFor="sb_yk">
            <IsimGirdisi id="sb_yk" name="yetkili_kisi" varsayilan={bilgiler?.yetkili_kisi ?? ""} disabled={bekliyor} />
          </Alan>
        </div>
        <TelefonGirisi ad="yetkili_telefon" label="Yetkili telefon numarası" varsayilanTelefon={bilgiler?.yetkili_telefon} disabled={bekliyor} />
        <Alan etiket="Yetkili e-posta adresi" htmlFor="sb_ye">
          <Input id="sb_ye" name="yetkili_eposta" type="email" defaultValue={bilgiler?.yetkili_eposta ?? ""} autoComplete="off" disabled={bekliyor} />
        </Alan>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Çalışma saatleri</legend>
        <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-x-3 gap-y-3 sm:grid-cols-[120px_1fr_auto_1fr]">
          {(
            [
              ["Hafta içi", "hafta_ici_baslangic", "hafta_ici_bitis"],
              ["Cumartesi", "cumartesi_baslangic", "cumartesi_bitis"],
              ["Pazar", "pazar_baslangic", "pazar_bitis"],
            ] as const
          ).map(([gun, bas, bit]) => (
            <SaatSatiri key={gun} gun={gun} bas={bas} bit={bit} bilgiler={bilgiler} bekliyor={bekliyor} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Kapalı olan bir gün için başlangıç ve bitiş saatlerini boş bırakın.</p>
      </fieldset>

      {durum && (
        <p role={durum.success ? "status" : "alert"} className={cn("rounded-lg border px-3 py-2 text-sm font-medium", durum.success ? "border-success-border bg-success-soft text-success" : "border-destructive-border bg-destructive-soft text-destructive")}>
          {durum.message}
        </p>
      )}
      <Button type="submit" disabled={bekliyor} className="w-fit">
        {bekliyor ? "Kaydediliyor..." : "Kaydet"}
      </Button>
    </form>
  );
}

function SaatSatiri({ gun, bas, bit, bilgiler, bekliyor }: { gun: string; bas: keyof SirketBilgileri; bit: keyof SirketBilgileri; bilgiler: SirketBilgileri | null; bekliyor: boolean }) {
  return (
    <>
      <span className="text-sm text-muted-foreground">{gun}</span>
      <Input name={bas} type="time" aria-label={`${gun} başlangıç`} defaultValue={saatKisalt(bilgiler?.[bas] as string | null)} disabled={bekliyor} />
      <span className="text-sm text-muted-foreground">–</span>
      <Input name={bit} type="time" aria-label={`${gun} bitiş`} defaultValue={saatKisalt(bilgiler?.[bit] as string | null)} disabled={bekliyor} />
    </>
  );
}

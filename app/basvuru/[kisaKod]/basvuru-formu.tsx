"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Alan, IsimGirdisi, OnayKutusu } from "@/components/panel/form-alanlari";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TelefonGirisi } from "@/components/ui/telefon-girisi";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { isBasvurusuGonder } from "./actions";

export function BasvuruFormu({ kisaKod, kvkkMetni }: { kisaKod: string; kvkkMetni: string }) {
  const [durum, eylem, bekliyor] = useActionState(isBasvurusuGonder, null);

  if (durum?.success) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-10 text-success" strokeWidth={1.5} aria-hidden />
        <p className="font-semibold">{durum.message}</p>
        <p className="text-sm text-muted-foreground">Bu sayfayı kapatabilirsiniz.</p>
      </div>
    );
  }

  return (
    <form action={eylem} className="flex flex-col gap-4">
      <input type="hidden" name="kisa_kod" value={kisaKod} />
      {/* Bot tuzağı: görünmez, klavye ve ekran okuyucudan gizli; insanlar doldurmaz. */}
      <div className="absolute -left-[9999px] size-px overflow-hidden" aria-hidden>
        <label htmlFor="ib_website">Web sitesi</label>
        <input id="ib_website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <Alan etiket="Ad soyad" htmlFor="ib_ad">
        <IsimGirdisi id="ib_ad" name="ad_soyad" required disabled={bekliyor} />
      </Alan>
      <TelefonGirisi ad="telefon" label="Cep telefonu" disabled={bekliyor} />
      <Alan etiket="E-posta (isteğe bağlı)" htmlFor="ib_eposta">
        <Input id="ib_eposta" name="eposta" type="email" autoComplete="off" disabled={bekliyor} />
      </Alan>
      <Alan etiket="Doğum tarihi" htmlFor="ib_dogum" ipucu="Yalnız 18 yaş ve üzeri başvurabilir.">
        <Input id="ib_dogum" name="dogum_tarihi" type="date" required disabled={bekliyor} />
      </Alan>
      <Alan etiket="Başvurulan pozisyon" htmlFor="ib_pozisyon" ipucu="Ör. Personal trainer, resepsiyonist, temizlik.">
        <Input id="ib_pozisyon" name="basvurulan_pozisyon" maxLength={100} autoComplete="off" disabled={bekliyor} />
      </Alan>
      <Alan etiket="Deneyiminiz" htmlFor="ib_deneyim">
        <Textarea id="ib_deneyim" name="deneyim" rows={3} maxLength={1000} disabled={bekliyor} />
      </Alan>
      <Alan etiket="Sertifika ve belgeleriniz" htmlFor="ib_sertifika" ipucu="Ör. antrenör sertifikası, ilk yardım belgesi.">
        <Textarea id="ib_sertifika" name="sertifikalar" rows={2} maxLength={500} disabled={bekliyor} />
      </Alan>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <p className="text-xs leading-relaxed text-muted-foreground">{kvkkMetni}</p>
        <OnayKutusu id="ib_kvkk" name="kvkk" etiket="Aydınlatma metnini okudum, anladım." />
      </div>

      {durum && !durum.success && (
        <p role="alert" className={cn("rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive")}>
          {durum.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={bekliyor} className="w-full">
        {bekliyor ? "Gönderiliyor..." : "Başvuruyu Gönder"}
      </Button>
    </form>
  );
}

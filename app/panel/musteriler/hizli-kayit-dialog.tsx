"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Alan, IsimGirdisi, OnayKutusu } from "@/components/panel/form-alanlari";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ONAM_METINLERI } from "@/lib/onam-metinleri";
import { cn } from "@/lib/utils";
import { musteriOlustur } from "./actions";

/**
 * Hızlı Kayıt (klinikteki "Yeni Hasta Ekle" penceresi): yalnız temel bilgiler + KVKK aydınlatma. Başarıda müşteri kartına gidilir;
 * adres, sağlık beyanı, veli bilgisi ve diğer onaylar kartta / ayrıntılı kayıt formunda tamamlanır.
 * 18 yaş altı için veli bilgisi gerekir: sunucu bunu reddeder, ayrıntılı kayıt formuna yönlendirilir.
 */
export function HizliKayitDialog() {
  const [acik, setAcik] = useState(false);
  const [durum, eylem, bekliyor] = useActionState(musteriOlustur, null);

  return (
    <>
      <Button type="button" onClick={() => setAcik(true)}>
        <Plus aria-hidden /> Yeni Müşteri
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Yeni Müşteri</DialogTitle>
            <DialogDescription>Hızlı kayıt — yalnız temel bilgiler. Adres, sağlık beyanı ve veli bilgisi için ayrıntılı kayıt formunu kullanın.</DialogDescription>
          </DialogHeader>
          <form action={eylem} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Alan etiket="Ad soyad *" htmlFor="hk_ad">
                <IsimGirdisi id="hk_ad" name="ad_soyad" required />
              </Alan>
              <Alan etiket="Telefon *" htmlFor="hk_tel" ipucu="Örn. 0532 123 45 67">
                <Input id="hk_tel" name="telefon" type="tel" inputMode="tel" autoComplete="off" required />
              </Alan>
              <Alan etiket="E-posta" htmlFor="hk_eposta">
                <Input id="hk_eposta" name="eposta" type="email" autoComplete="off" />
              </Alan>
              <Alan etiket="Doğum tarihi" htmlFor="hk_dogum">
                <Input id="hk_dogum" name="dogum_tarihi" type="date" />
              </Alan>
            </div>
            <div className="flex flex-col gap-3">
              <OnayKutusu id="hk_kvkk" name="onay_kvkk_aydinlatma" etiket={`${ONAM_METINLERI.kvkk_aydinlatma.etiket} *`} aciklama={ONAM_METINLERI.kvkk_aydinlatma.metin} />
              <OnayKutusu id="hk_ticari" name="onay_ticari_ileti" etiket={ONAM_METINLERI.ticari_ileti.etiket} />
            </div>
            {durum && (
              <p role="alert" className={cn("rounded-lg border px-3 py-2 text-sm font-medium", "border-destructive-border bg-destructive-soft text-destructive")}>
                {durum.message}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={bekliyor}>
                {bekliyor ? "Kaydediliyor..." : "Müşteriyi Kaydet"}
              </Button>
              <Link href="/panel/musteriler/yeni" className="text-sm font-semibold text-primary hover:underline">
                Ayrıntılı kayıt formu
              </Link>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

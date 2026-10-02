"use client";

import { useActionState, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Alan } from "@/components/panel/form-alanlari";
import { SecimKutusu } from "@/components/panel/eylem-formu";
import type { HesapSecenegi } from "@/components/panel/yontem-hesap-secimi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EylemSonucu } from "@/lib/eylem";
import { GiderFormu } from "../giderler/gider-formu";
import type { AracSecenegi } from "../giderler/sorgular";
import { personelHareketEkle } from "../personel/actions";
import { manuelHareketEkle } from "./actions";
import type { HesapSecimSatiri } from "./manuel-formlar";

type Eylem = (onceki: EylemSonucu | null, formData: FormData) => Promise<EylemSonucu | null>;

/** Pencere içindeki form: tek kullanımlık idempotency anahtarı, hata mesajı; başarıda `basariliOlunca` (pencereyi kapatır). */
function DiyalogFormu({ eylem, gizli, gonder, basariliOlunca, children }: { eylem: Eylem; gizli: Record<string, string>; gonder: string; basariliOlunca: () => void; children: React.ReactNode }) {
  const [sonuc, formAction, bekliyor] = useActionState(eylem, null);
  const [gorulen, setGorulen] = useState(sonuc);
  const [ilkAnahtar] = useState(() => crypto.randomUUID());
  if (sonuc !== gorulen) {
    setGorulen(sonuc);
    if (sonuc?.success) basariliOlunca();
  }
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="anahtar" value={sonuc?.anahtar ?? ilkAnahtar} suppressHydrationWarning />
      {Object.entries(gizli).map(([ad, deger]) => (
        <input key={ad} type="hidden" name={ad} value={deger} />
      ))}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      {sonuc && !sonuc.success && (
        <p role="alert" className="rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
          {sonuc.message}
        </p>
      )}
      <Button type="submit" disabled={bekliyor} className="w-fit">
        {bekliyor ? "Kaydediliyor..." : gonder}
      </Button>
    </form>
  );
}

function TutarAlani({ on }: { on: string }) {
  return (
    <Alan etiket="Tutar (₺)" htmlFor={`${on}_tutar`}>
      <Input id={`${on}_tutar`} name="tutar" inputMode="decimal" required autoComplete="off" placeholder="0,00" />
    </Alan>
  );
}

function TarihAlani({ on, bugun }: { on: string; bugun: string }) {
  return (
    <Alan etiket="Tarih" htmlFor={`${on}_tarih`} ipucu="Boşsa bugün.">
      <Input id={`${on}_tarih`} name="tarih" type="date" max={bugun} />
    </Alan>
  );
}

function AciklamaAlani({ on }: { on: string }) {
  return (
    <div className="sm:col-span-2">
      <Alan etiket="Açıklama" htmlFor={`${on}_aciklama`}>
        <Textarea id={`${on}_aciklama`} name="aciklama" rows={2} maxLength={300} />
      </Alan>
    </div>
  );
}

/** "Kasaya Giren" / "Bankaya Giren": hesaba manuel giriş; banka hesabında gönderen banka ve IBAN da girilebilir. */
export function GirenDiyalog({ hesap, bankaMi, bugun }: { hesap: string; bankaMi: boolean; bugun: string }) {
  const [acik, setAcik] = useState(false);
  const baslik = bankaMi ? "Bankaya Giren" : "Kasaya Giren";
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAcik(true)} className="border-success-border bg-success-soft text-success hover:bg-success-soft hover:text-success">
        <ArrowDownToLine aria-hidden /> {baslik}
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{baslik}</DialogTitle>
          </DialogHeader>
          <DiyalogFormu eylem={manuelHareketEkle} gizli={{ tip: "giren", hesap }} gonder="Kaydet" basariliOlunca={() => setAcik(false)}>
            <div className="sm:col-span-2">
              <Alan etiket="Gönderen" htmlFor="gr_karsi">
                <Input id="gr_karsi" name="karsi_taraf" maxLength={100} required autoComplete="off" />
              </Alan>
            </div>
            {bankaMi && (
              <>
                <Alan etiket="Gönderen banka (isteğe bağlı)" htmlFor="gr_banka">
                  <Input id="gr_banka" name="karsi_banka" maxLength={100} autoComplete="off" />
                </Alan>
                <Alan etiket="Gönderen IBAN (isteğe bağlı)" htmlFor="gr_iban">
                  <Input id="gr_iban" name="karsi_iban" autoComplete="off" spellCheck={false} className="font-mono" />
                </Alan>
              </>
            )}
            <TutarAlani on="gr" />
            <TarihAlani on="gr" bugun={bugun} />
            <AciklamaAlani on="gr" />
          </DiyalogFormu>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Adim = "gider" | "personel" | "transfer" | "kamusal" | "diger";

/**
 * "Kasadan Çıkan" / "Bankadan Çıkan": önce çıkışın türü seçilir (klinikteki gibi) — Tedarikçi gideri, Personel ödemesi,
 * Hesaplar arası transfer, (yalnız bankada) Kamu ödemesi, Diğer. Kayıtlar seçili hesaba düşer.
 */
export function CikanDiyalog({
  hesap,
  bankaMi,
  hesaplar,
  hesapSecenekleri,
  personel,
  araclar,
  bugun,
}: {
  hesap: string;
  bankaMi: boolean;
  /** Transfer hedefi olabilecek tüm hesaplar (kasa + bankalar); seçili hesap hariç tutulur. */
  hesaplar: HesapSecimSatiri[];
  hesapSecenekleri: HesapSecenegi[];
  personel: { id: string; ad_soyad: string }[];
  araclar: AracSecenegi[];
  bugun: string;
}) {
  const [acik, setAcik] = useState(false);
  const [adim, setAdim] = useState<Adim | null>(null);
  const baslik = bankaMi ? "Bankadan Çıkan" : "Kasadan Çıkan";
  const etiketler: Record<Adim, string> = { gider: "Tedarikçi / Gider", personel: "Personel", transfer: "Hesaplar Arası Transfer", kamusal: "Kamu Ödemesi", diger: "Diğer" };
  const secenekler = (Object.keys(etiketler) as Adim[]).filter((a) => bankaMi || a !== "kamusal");
  const kapat = () => {
    setAcik(false);
    setAdim(null);
  };
  const yontem = bankaMi ? "havale" : "nakit";
  const personelGizli: Record<string, string> = bankaMi ? { yontem, banka_hesap_id: hesap } : { yontem };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAcik(true)} className="border-destructive-border bg-destructive-soft text-destructive hover:bg-destructive-soft hover:text-destructive">
        <ArrowUpFromLine aria-hidden /> {baslik}
      </Button>
      <Dialog
        open={acik}
        onOpenChange={(a) => {
          setAcik(a);
          if (!a) setAdim(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{adim ? etiketler[adim] : baslik}</DialogTitle>
          </DialogHeader>

          {adim === null && (
            <div className="grid grid-cols-2 gap-2">
              {secenekler.map((a) => (
                <Button key={a} type="button" variant="outline" onClick={() => setAdim(a)}>
                  {etiketler[a]}
                </Button>
              ))}
            </div>
          )}

          {(adim === "gider" || adim === "kamusal") && (
            <GiderFormu tur={adim === "kamusal" ? "kamusal" : "gider"} hesaplar={hesapSecenekleri} araclar={araclar} bugun={bugun} sabitYontem={yontem} sabitHesapId={bankaMi ? hesap : undefined} basariliOlunca={kapat} />
          )}

          {adim === "personel" && (
            <DiyalogFormu eylem={personelHareketEkle} gizli={personelGizli} gonder="Kaydet" basariliOlunca={kapat}>
              <Alan etiket="Personel" htmlFor="po_kisi">
                <SecimKutusu id="po_kisi" name="kullanici_id" required defaultValue="">
                  <option value="" disabled>
                    Seçin
                  </option>
                  {personel.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.ad_soyad}
                    </option>
                  ))}
                </SecimKutusu>
              </Alan>
              <Alan etiket="Tür" htmlFor="po_tur">
                <SecimKutusu id="po_tur" name="tur" defaultValue="odeme">
                  <option value="odeme">Maaş / hakediş ödemesi</option>
                  <option value="avans">Avans</option>
                </SecimKutusu>
              </Alan>
              <TutarAlani on="po" />
              <AciklamaAlani on="po" />
            </DiyalogFormu>
          )}

          {adim === "transfer" && (
            <DiyalogFormu eylem={manuelHareketEkle} gizli={{ tip: "transfer", hesap }} gonder="Transfer Et" basariliOlunca={kapat}>
              <Alan etiket="Hedef hesap" htmlFor="tr_hedef">
                <SecimKutusu id="tr_hedef" name="hedef" required defaultValue="">
                  <option value="" disabled>
                    Seçin
                  </option>
                  {hesaplar
                    .filter((h) => h.kod !== hesap)
                    .map((h) => (
                      <option key={h.kod} value={h.kod}>
                        {h.ad}
                      </option>
                    ))}
                </SecimKutusu>
              </Alan>
              <TutarAlani on="tr" />
              <TarihAlani on="tr" bugun={bugun} />
              <AciklamaAlani on="tr" />
            </DiyalogFormu>
          )}

          {adim === "diger" && (
            <DiyalogFormu eylem={manuelHareketEkle} gizli={{ tip: "cikan", hesap }} gonder="Kaydet" basariliOlunca={kapat}>
              <div className="sm:col-span-2">
                <Alan etiket="Alıcı" htmlFor="dg_karsi">
                  <Input id="dg_karsi" name="karsi_taraf" maxLength={100} required autoComplete="off" />
                </Alan>
              </div>
              <TutarAlani on="dg" />
              <TarihAlani on="dg" bugun={bugun} />
              <AciklamaAlani on="dg" />
            </DiyalogFormu>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

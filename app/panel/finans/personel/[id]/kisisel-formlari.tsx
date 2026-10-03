"use client";

import { useActionState } from "react";
import { Alan, IsimGirdisi } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { AdresSecici } from "@/components/ui/adres-secici";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TelefonGirisi } from "@/components/ui/telefon-girisi";
import { Textarea } from "@/components/ui/textarea";
import { CALISMA_TIPLERI, CINSIYETLER, PERSONEL_BELGE_TURU } from "@/lib/panel/etiketler";
import { personelBelgeEkle, personelBelgeKaldir, personelKisiselKaydet } from "../actions";

export type KisiselBilgi = {
  telefon: string | null;
  dogum_tarihi: string | null;
  tc_kimlik_no: string | null;
  il: string | null;
  ilce: string | null;
  mahalle: string | null;
  adres_detay: string | null;
  acil_durum_ad_soyad: string | null;
  acil_durum_telefon: string | null;
  dogum_yeri: string | null;
  cinsiyet: string | null;
  pasaport_no: string | null;
  sgk_sicil_no: string | null;
  calisma_tipi: string | null;
};

/** Kişisel bilgiler (yalnız işletme yöneticisi). Form tüm alanları gönderir; boş alan "temizle" demektir. */
export function KisiselFormu({ kullaniciId, bilgi, basariliOlunca }: { kullaniciId: string; bilgi: KisiselBilgi | null; basariliOlunca?: () => void }) {
  return (
    <EylemFormu eylem={personelKisiselKaydet} gonder="Kaydet" basariliOlunca={basariliOlunca}>
      <input type="hidden" name="kullanici_id" value={kullaniciId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TelefonGirisi ad="telefon" label="Cep telefonu" varsayilanTelefon={bilgi?.telefon} />
        <Alan etiket="Doğum tarihi" htmlFor="pk_dogum" ipucu="50 yaş ve üzeri personelin yıllık izin hakkı en az 20 gündür.">
          <Input id="pk_dogum" name="dogum_tarihi" type="date" defaultValue={bilgi?.dogum_tarihi ?? ""} />
        </Alan>
        <Alan etiket="Doğum yeri" htmlFor="pk_dogum_yeri">
          <Input id="pk_dogum_yeri" name="dogum_yeri" maxLength={100} autoComplete="off" defaultValue={bilgi?.dogum_yeri ?? ""} />
        </Alan>
        <Alan etiket="Cinsiyet" htmlFor="pk_cinsiyet">
          <SecimKutusu id="pk_cinsiyet" name="cinsiyet" defaultValue={bilgi?.cinsiyet ?? ""}>
            <option value="">—</option>
            {Object.entries(CINSIYETLER).map(([kod, etiket]) => (
              <option key={kod} value={kod}>
                {etiket}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        <Alan etiket="Çalışma tipi" htmlFor="pk_calisma">
          <SecimKutusu id="pk_calisma" name="calisma_tipi" defaultValue={bilgi?.calisma_tipi ?? ""}>
            <option value="">—</option>
            {Object.entries(CALISMA_TIPLERI).map(([kod, etiket]) => (
              <option key={kod} value={kod}>
                {etiket}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        <Alan etiket="SGK sicil no" htmlFor="pk_sgk">
          <Input id="pk_sgk" name="sgk_sicil_no" maxLength={30} autoComplete="off" defaultValue={bilgi?.sgk_sicil_no ?? ""} />
        </Alan>
        <Alan etiket="Pasaport no" htmlFor="pk_pasaport" ipucu="Yabancı uyruklu personel için.">
          <Input id="pk_pasaport" name="pasaport_no" maxLength={20} autoComplete="off" defaultValue={bilgi?.pasaport_no ?? ""} />
        </Alan>
        <Alan etiket="T.C. kimlik no" htmlFor="pk_tc">
          <Input id="pk_tc" name="tc_kimlik_no" inputMode="numeric" maxLength={11} pattern="[0-9]*" autoComplete="off" defaultValue={bilgi?.tc_kimlik_no ?? ""} />
        </Alan>
      </div>
      <AdresSecici prefix="adres" defaultIl={bilgi?.il} defaultIlce={bilgi?.ilce} defaultMahalle={bilgi?.mahalle} />
      <Alan etiket="Açık adres" htmlFor="pk_adres">
        <Textarea id="pk_adres" name="adres_detay" rows={2} maxLength={500} defaultValue={bilgi?.adres_detay ?? ""} />
      </Alan>
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Acil durumda aranacak kişi" htmlFor="pk_acil_ad">
          <IsimGirdisi id="pk_acil_ad" name="acil_durum_ad_soyad" varsayilan={bilgi?.acil_durum_ad_soyad ?? ""} />
        </Alan>
        <TelefonGirisi ad="acil_durum_telefon" label="Acil durum telefonu" varsayilanTelefon={bilgi?.acil_durum_telefon} />
      </div>
    </EylemFormu>
  );
}

export function BelgeEkleFormu({ kullaniciId }: { kullaniciId: string }) {
  return (
    <EylemFormu eylem={personelBelgeEkle} gonder="Belge Ekle" yukleniyor="Kaydediliyor...">
      <input type="hidden" name="kullanici_id" value={kullaniciId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Belge türü" htmlFor="pb_tur">
          <SecimKutusu id="pb_tur" name="tur" required defaultValue="sertifika">
            {Object.entries(PERSONEL_BELGE_TURU).map(([k, e]) => (
              <option key={k} value={k}>
                {e}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        <Alan etiket="Belge adı" htmlFor="pb_ad" ipucu="Ör. ACE Personal Trainer, Temel İlk Yardım.">
          <Input id="pb_ad" name="ad" maxLength={150} required autoComplete="off" />
        </Alan>
        <Alan etiket="Veren kurum" htmlFor="pb_kurum">
          <Input id="pb_kurum" name="veren_kurum" maxLength={150} autoComplete="off" />
        </Alan>
        <Alan etiket="Belge no" htmlFor="pb_no">
          <Input id="pb_no" name="belge_no" maxLength={60} autoComplete="off" />
        </Alan>
        <Alan etiket="Veriliş tarihi" htmlFor="pb_verilis">
          <Input id="pb_verilis" name="verilis_tarihi" type="date" />
        </Alan>
        <Alan etiket="Geçerlilik bitişi" htmlFor="pb_bitis" ipucu="Süresiz belgede boş bırakın; bitişe 60 gün kala uyarı çıkar.">
          <Input id="pb_bitis" name="gecerlilik_bitis" type="date" />
        </Alan>
      </div>
      <Alan etiket="Not" htmlFor="pb_not">
        <Textarea id="pb_not" name="not_metni" rows={1} maxLength={300} />
      </Alan>
      <p className="text-xs text-muted-foreground">Yalnız belge KAYDI tutulur; dosya yüklenmez. Asıl belgeyi personel dosyasında saklayın.</p>
    </EylemFormu>
  );
}

export function BelgeKaldirButonu({ kullaniciId, belgeId }: { kullaniciId: string; belgeId: string }) {
  const [durum, eylem, bekliyor] = useActionState(personelBelgeKaldir, null);
  return (
    <form action={eylem} className="flex flex-col items-end gap-1">
      <input type="hidden" name="kullanici_id" value={kullaniciId} />
      <input type="hidden" name="belge_id" value={belgeId} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={bekliyor}
        onClick={(e) => {
          if (!window.confirm("Belge listeden kaldırılsın mı?")) e.preventDefault();
        }}
      >
        Kaldır
      </Button>
      {durum && !durum.success && <span className="text-xs font-medium text-destructive">{durum.message}</span>}
    </form>
  );
}

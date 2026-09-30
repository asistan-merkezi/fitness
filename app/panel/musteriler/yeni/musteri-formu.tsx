"use client";

import { Alan, IsimGirdisi, OnayKutusu } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ONAM_METINLERI } from "@/lib/onam-metinleri";
import { KATEGORI_ETIKETLERI, SAGLIK_ETIKETLERI } from "@/lib/panel/etiketler";
import { musteriOlustur } from "../actions";

export function MusteriFormu() {
  return (
    <EylemFormu eylem={musteriOlustur} gonder="Müşteriyi Kaydet" yukleniyor="Kaydediliyor..." className="gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Temel bilgiler</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Alan etiket="Ad soyad *" htmlFor="ad_soyad">
            <IsimGirdisi id="ad_soyad" name="ad_soyad" required />
          </Alan>
          <Alan etiket="Telefon *" htmlFor="telefon" ipucu="Örn. 0532 123 45 67">
            <Input id="telefon" name="telefon" type="tel" inputMode="tel" autoComplete="off" required />
          </Alan>
          <Alan etiket="E-posta" htmlFor="eposta">
            <Input id="eposta" name="eposta" type="email" autoComplete="off" />
          </Alan>
          <Alan etiket="Doğum tarihi" htmlFor="dogum_tarihi" ipucu="18 yaş altıysa veli bilgisi ve onayı zorunludur.">
            <Input id="dogum_tarihi" name="dogum_tarihi" type="date" />
          </Alan>
          <Alan etiket="Cinsiyet" htmlFor="cinsiyet">
            <SecimKutusu id="cinsiyet" name="cinsiyet" defaultValue="belirtilmemis">
              <option value="belirtilmemis">Belirtilmemiş</option>
              <option value="kadin">Kadın</option>
              <option value="erkek">Erkek</option>
            </SecimKutusu>
          </Alan>
          <Alan etiket="Kategori" htmlFor="kategori">
            <SecimKutusu id="kategori" name="kategori" defaultValue="standart">
              {Object.entries(KATEGORI_ETIKETLERI).map(([k, e]) => (
                <option key={k} value={k}>
                  {e}
                </option>
              ))}
            </SecimKutusu>
          </Alan>
          <div className="sm:col-span-2">
            <Alan etiket="Not" htmlFor="not_metni" ipucu="Serbest metin; olduğu gibi saklanır.">
              <Textarea id="not_metni" name="not_metni" rows={2} maxLength={1000} />
            </Alan>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Veli / vasi</CardTitle>
          <CardDescription>Yalnızca 18 yaşından küçük müşteriler için.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Alan etiket="Veli ad soyad" htmlFor="veli_ad_soyad">
            <IsimGirdisi id="veli_ad_soyad" name="veli_ad_soyad" />
          </Alan>
          <Alan etiket="Veli telefon" htmlFor="veli_telefon">
            <Input id="veli_telefon" name="veli_telefon" type="tel" inputMode="tel" autoComplete="off" />
          </Alan>
          <Alan etiket="Yakınlık" htmlFor="veli_yakinlik">
            <SecimKutusu id="veli_yakinlik" name="veli_yakinlik" defaultValue="diger">
              <option value="anne">Anne</option>
              <option value="baba">Baba</option>
              <option value="vasi">Vasi</option>
              <option value="diger">Diğer</option>
            </SecimKutusu>
          </Alan>
          <div className="sm:col-span-3">
            <OnayKutusu id="onay_veli" name="onay_veli" etiket={ONAM_METINLERI.veli_onayi.etiket} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kimlik, adres ve acil durum</CardTitle>
          <CardDescription>İsteğe bağlı; yalnızca yetkili personel görür.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Alan etiket="T.C. kimlik no" htmlFor="tc_kimlik_no" ipucu="Fatura kesilecekse gereklidir.">
            <Input id="tc_kimlik_no" name="tc_kimlik_no" inputMode="numeric" maxLength={11} autoComplete="off" />
          </Alan>
          <div />
          <Alan etiket="İl" htmlFor="il">
            <Input id="il" name="il" autoComplete="off" />
          </Alan>
          <Alan etiket="İlçe" htmlFor="ilce">
            <Input id="ilce" name="ilce" autoComplete="off" />
          </Alan>
          <Alan etiket="Mahalle" htmlFor="mahalle">
            <Input id="mahalle" name="mahalle" autoComplete="off" />
          </Alan>
          <Alan etiket="Sokak / apartman / no" htmlFor="adres_detay">
            <Input id="adres_detay" name="adres_detay" autoComplete="off" />
          </Alan>
          <Alan etiket="Acil durum kişisi" htmlFor="acil_durum_ad_soyad">
            <IsimGirdisi id="acil_durum_ad_soyad" name="acil_durum_ad_soyad" />
          </Alan>
          <Alan etiket="Acil durum telefonu" htmlFor="acil_durum_telefon">
            <Input id="acil_durum_telefon" name="acil_durum_telefon" type="tel" inputMode="tel" autoComplete="off" />
          </Alan>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sağlık beyanı</CardTitle>
          <CardDescription>Özel nitelikli kişisel veri: yalnızca açık rıza ile kaydedilir.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <fieldset className="grid gap-2 sm:grid-cols-3">
            <legend className="sr-only">Sağlık bayrakları</legend>
            {Object.entries(SAGLIK_ETIKETLERI).map(([k, e]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="saglik_bayraklari" value={k} className="size-4 rounded border-input accent-primary" />
                {e}
              </label>
            ))}
          </fieldset>
          <Alan etiket="Sağlık notu" htmlFor="saglik_notu">
            <Textarea id="saglik_notu" name="saglik_notu" rows={2} maxLength={1000} />
          </Alan>
          <OnayKutusu id="onay_acik_riza_saglik" name="onay_acik_riza_saglik" etiket={ONAM_METINLERI.acik_riza_saglik.etiket} aciklama={ONAM_METINLERI.acik_riza_saglik.metin} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>KVKK ve onaylar</CardTitle>
          <CardDescription>Metinler TASLAKTIR; avukat onayı olmadan canlıda kullanmayın.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <OnayKutusu id="onay_kvkk_aydinlatma" name="onay_kvkk_aydinlatma" etiket={`${ONAM_METINLERI.kvkk_aydinlatma.etiket} *`} aciklama={ONAM_METINLERI.kvkk_aydinlatma.metin} />
          <OnayKutusu id="onay_ticari_ileti" name="onay_ticari_ileti" etiket={ONAM_METINLERI.ticari_ileti.etiket} aciklama={ONAM_METINLERI.ticari_ileti.metin} />
          <OnayKutusu id="onay_taahhutname" name="onay_taahhutname" etiket={ONAM_METINLERI.taahhutname.etiket} />
        </CardContent>
      </Card>
    </EylemFormu>
  );
}

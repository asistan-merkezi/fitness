"use client";

import { useState } from "react";
import { Alan, IsimGirdisi, OnayKutusu } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { YontemHesapSecimi, type HesapSecenegi } from "@/components/panel/yontem-hesap-secimi";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { kurusGirdiYazi, kurusTLyazi } from "@/lib/para";
import { KATEGORI_ETIKETLERI, SAGLIK_ETIKETLERI, YONTEM_ETIKETLERI } from "@/lib/panel/etiketler";
import { ONAM_METINLERI } from "@/lib/onam-metinleri";
import type { MusteriHassasSatiri, MusteriSatiri, PaketSatiri, UyelikGorunumSatiri } from "@/types/veritabani";
import { musteriGuncelle, hassasBilgiGuncelle } from "../actions";
import { dondurmayiBitir, iadeYap, odemeAl, satisYap, uyelikDondur, uyelikIptal } from "./actions";

const yerelTelefon = (t: string) => (t.startsWith("+90") ? `0${t.slice(3)}` : t);

function YontemSecimi({ id, hesaplar, yontemEtiketi }: { id: string; hesaplar: HesapSecenegi[]; yontemEtiketi: string }) {
  return <YontemHesapSecimi id={id} yontemler={YONTEM_ETIKETLERI} hesaplar={hesaplar} yontemEtiketi={yontemEtiketi} />;
}

export function MusteriBilgiFormu({ musteri }: { musteri: MusteriSatiri }) {
  return (
    <EylemFormu eylem={musteriGuncelle} gonder="Bilgileri Kaydet">
      <input type="hidden" name="musteri_id" value={musteri.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Ad soyad" htmlFor="ad_soyad">
          <IsimGirdisi id="ad_soyad" name="ad_soyad" varsayilan={musteri.ad_soyad} required />
        </Alan>
        <Alan etiket="Telefon" htmlFor="telefon">
          <Input id="telefon" name="telefon" type="tel" defaultValue={yerelTelefon(musteri.telefon)} required autoComplete="off" />
        </Alan>
        <Alan etiket="E-posta" htmlFor="eposta">
          <Input id="eposta" name="eposta" type="email" defaultValue={musteri.eposta ?? ""} autoComplete="off" />
        </Alan>
        <Alan etiket="Kategori" htmlFor="kategori">
          <SecimKutusu id="kategori" name="kategori" defaultValue={musteri.kategori}>
            {Object.entries(KATEGORI_ETIKETLERI).map(([k, e]) => (
              <option key={k} value={k}>
                {e}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        <div className="sm:col-span-2">
          <Alan etiket="Not" htmlFor="not_metni">
            <Textarea id="not_metni" name="not_metni" rows={2} maxLength={1000} defaultValue={musteri.not_metni ?? ""} />
          </Alan>
        </div>
      </div>
      <OnayKutusu id="aktif" name="aktif" etiket="Aktif müşteri" varsayilan={musteri.aktif} aciklama="Pasif müşteri check-in yapamaz; geçmiş kayıtları korunur." />
    </EylemFormu>
  );
}

export function HassasBilgiFormu({ musteriId, hassas }: { musteriId: string; hassas: MusteriHassasSatiri | null }) {
  const secili = new Set(hassas?.saglik_bayraklari ?? []);
  return (
    <EylemFormu eylem={hassasBilgiGuncelle} gonder="Hassas Bilgileri Kaydet">
      <input type="hidden" name="musteri_id" value={musteriId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="T.C. kimlik no" htmlFor="h_tc">
          <Input id="h_tc" name="tc_kimlik_no" inputMode="numeric" maxLength={11} defaultValue={hassas?.tc_kimlik_no ?? ""} autoComplete="off" />
        </Alan>
        <div />
        <Alan etiket="İl" htmlFor="h_il">
          <Input id="h_il" name="il" defaultValue={hassas?.il ?? ""} autoComplete="off" />
        </Alan>
        <Alan etiket="İlçe" htmlFor="h_ilce">
          <Input id="h_ilce" name="ilce" defaultValue={hassas?.ilce ?? ""} autoComplete="off" />
        </Alan>
        <Alan etiket="Mahalle" htmlFor="h_mahalle">
          <Input id="h_mahalle" name="mahalle" defaultValue={hassas?.mahalle ?? ""} autoComplete="off" />
        </Alan>
        <Alan etiket="Sokak / apartman / no" htmlFor="h_adres">
          <Input id="h_adres" name="adres_detay" defaultValue={hassas?.adres_detay ?? ""} autoComplete="off" />
        </Alan>
        <Alan etiket="Acil durum kişisi" htmlFor="h_acil_ad">
          <IsimGirdisi id="h_acil_ad" name="acil_durum_ad_soyad" varsayilan={hassas?.acil_durum_ad_soyad ?? ""} />
        </Alan>
        <Alan etiket="Acil durum telefonu" htmlFor="h_acil_tel">
          <Input id="h_acil_tel" name="acil_durum_telefon" type="tel" defaultValue={hassas?.acil_durum_telefon ? yerelTelefon(hassas.acil_durum_telefon) : ""} autoComplete="off" />
        </Alan>
      </div>
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium">Sağlık bayrakları</legend>
        {Object.entries(SAGLIK_ETIKETLERI).map(([k, e]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="saglik_bayraklari" value={k} defaultChecked={secili.has(k)} className="size-4 rounded border-input accent-primary" />
            {e}
          </label>
        ))}
      </fieldset>
      <Alan etiket="Sağlık notu" htmlFor="h_saglik_notu">
        <Textarea id="h_saglik_notu" name="saglik_notu" rows={2} maxLength={1000} defaultValue={hassas?.saglik_notu ?? ""} />
      </Alan>
      <OnayKutusu id="h_riza" name="onay_acik_riza_saglik" etiket={ONAM_METINLERI.acik_riza_saglik.etiket} aciklama="Sağlık bilgisi ilk kez giriliyorsa rıza alınmalıdır; daha önce alındıysa işaretlemek gerekmez." />
    </EylemFormu>
  );
}

export function SatisFormu({ musteriId, paketler, bugun, kategoriYuzdesi = 0, varsayilanPaketId }: { musteriId: string; paketler: PaketSatiri[]; bugun: string; varsayilanPaketId?: string; /** Müşteri kategorisinin önerilen iskonto yüzdesi (Finans > Kategori / İskonto Oranları). */ kategoriYuzdesi?: number }) {
  const [paketId, setPaketId] = useState(varsayilanPaketId ?? "");
  const [iskonto, setIskonto] = useState(() => {
    const paket = paketler.find((p) => p.id === varsayilanPaketId);
    return paket && kategoriYuzdesi > 0 ? kurusGirdiYazi(Math.round((paket.fiyat_kurus * kategoriYuzdesi) / 100)) : "";
  });
  const [dokunuldu, setDokunuldu] = useState(false);

  function paketSecildi(id: string) {
    setPaketId(id);
    // Kullanıcı iskonto alanına elle dokunmadıysa kategori oranı önerilir; elle girilen değer asla ezilmez.
    if (dokunuldu) return;
    const paket = paketler.find((p) => p.id === id);
    if (!paket || kategoriYuzdesi <= 0) return setIskonto("");
    setIskonto(kurusGirdiYazi(Math.round((paket.fiyat_kurus * kategoriYuzdesi) / 100)));
  }

  return (
    <EylemFormu eylem={satisYap} gonder="Üyeliği Sat" yukleniyor="Kaydediliyor..." anahtarli>
      <input type="hidden" name="musteri_id" value={musteriId} />
      <Alan etiket="Paket" htmlFor="s_paket">
        <SecimKutusu id="s_paket" name="paket_id" required value={paketId} onChange={(e) => paketSecildi(e.target.value)}>
          <option value="" disabled>
            Paket seçin
          </option>
          {paketler.map((p) => (
            <option key={p.id} value={p.id}>
              {p.ad} — {kurusTLyazi(p.fiyat_kurus)} ({p.tur === "sure" ? `${p.sure_gun} gün` : `${p.seans_sayisi} seans`})
            </option>
          ))}
        </SecimKutusu>
      </Alan>
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Başlangıç tarihi" htmlFor="s_baslangic">
          <Input id="s_baslangic" name="baslangic" type="date" defaultValue={bugun} min={bugun} />
        </Alan>
        <Alan etiket="İskonto (₺)" htmlFor="s_iskonto" ipucu={kategoriYuzdesi > 0 ? `Müşteri kategorisi için %${String(kategoriYuzdesi).replace(".", ",")} iskonto önerilir; değiştirebilirsiniz.` : "Boş bırakılırsa iskonto yok."}>
          <Input
            id="s_iskonto"
            name="iskonto"
            inputMode="decimal"
            placeholder="0,00"
            autoComplete="off"
            value={iskonto}
            onChange={(e) => {
              setDokunuldu(true);
              setIskonto(e.target.value);
            }}
          />
        </Alan>
        <Alan etiket="Şimdi alınan ödeme (₺)" htmlFor="s_odeme" ipucu="Boş bırakılırsa tutar cariye borç yazılır.">
          <Input id="s_odeme" name="odeme" inputMode="decimal" placeholder="0,00" autoComplete="off" />
        </Alan>
        <Alan etiket="Ödeme yöntemi" htmlFor="s_yontem">
          <SecimKutusu id="s_yontem" name="odeme_yontemi" defaultValue="">
            <option value="">Ödeme yok</option>
            {Object.entries(YONTEM_ETIKETLERI).map(([k, e]) => (
              <option key={k} value={k}>
                {e}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
      </div>
    </EylemFormu>
  );
}

export function OdemeFormu({ musteriId, hesaplar }: { musteriId: string; hesaplar: HesapSecenegi[] }) {
  return (
    <EylemFormu eylem={odemeAl} gonder="Ödemeyi Kaydet" anahtarli>
      <input type="hidden" name="musteri_id" value={musteriId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Tutar (₺)" htmlFor="o_tutar">
          <Input id="o_tutar" name="tutar" inputMode="decimal" placeholder="0,00" required autoComplete="off" />
        </Alan>
        <YontemSecimi id="o_yontem" hesaplar={hesaplar} yontemEtiketi="Yöntem" />
      </div>
      <Alan etiket="Açıklama" htmlFor="o_aciklama">
        <Input id="o_aciklama" name="aciklama" maxLength={300} autoComplete="off" />
      </Alan>
    </EylemFormu>
  );
}

export function IadeFormu({ musteriId, odemeler, hesaplar }: { musteriId: string; odemeler: { id: string; etiket: string }[]; hesaplar: HesapSecenegi[] }) {
  if (odemeler.length === 0) {
    return <p className="text-sm text-muted-foreground">İade edilebilecek ödeme kaydı yok.</p>;
  }
  return (
    <EylemFormu eylem={iadeYap} gonder="İadeyi Kaydet" varyant="destructive" anahtarli onay="İade kaydı geri alınamaz. Devam edilsin mi?">
      <input type="hidden" name="musteri_id" value={musteriId} />
      <Alan etiket="İade edilecek ödeme" htmlFor="i_odeme">
        <SecimKutusu id="i_odeme" name="iade_edilen_hareket_id" required defaultValue="">
          <option value="" disabled>
            Ödeme seçin
          </option>
          {odemeler.map((o) => (
            <option key={o.id} value={o.id}>
              {o.etiket}
            </option>
          ))}
        </SecimKutusu>
      </Alan>
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="İade tutarı (₺)" htmlFor="i_tutar">
          <Input id="i_tutar" name="tutar" inputMode="decimal" placeholder="0,00" required autoComplete="off" />
        </Alan>
        <YontemSecimi id="i_yontem" hesaplar={hesaplar} yontemEtiketi="İade yöntemi" />
      </div>
      <Alan etiket="Açıklama" htmlFor="i_aciklama">
        <Input id="i_aciklama" name="aciklama" maxLength={300} autoComplete="off" />
      </Alan>
    </EylemFormu>
  );
}

/** Üyelik satırı işlemleri: dondur / dondurmayı bitir / iptal. */
export function UyelikIslemleri({ uyelik, musteriId, yonetici }: { uyelik: UyelikGorunumSatiri; musteriId: string; yonetici: boolean }) {
  const dondurulabilir = uyelik.dondurma_izni && uyelik.gecerli_durum === "aktif" && uyelik.bitis_tarihi !== null;
  const dondurulmus = uyelik.gecerli_durum === "dondurulmus";
  const iptalEdilebilir = yonetici && uyelik.gecerli_durum !== "iptal";
  if (!dondurulabilir && !dondurulmus && !iptalEdilebilir) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <details className="group">
      <summary className="cursor-pointer text-sm text-primary select-none">İşlemler</summary>
      <div className="mt-3 flex min-w-64 flex-col gap-4 rounded-lg border border-border p-3">
        {dondurulabilir && (
          <EylemFormu eylem={uyelikDondur} gonder="Dondur" varyant="outline">
            <input type="hidden" name="uyelik_id" value={uyelik.id} />
            <input type="hidden" name="musteri_id" value={musteriId} />
            <Alan etiket={`Dondurma günü (en fazla ${uyelik.azami_dondurma_gun})`} htmlFor={`d_${uyelik.id}`}>
              <Input id={`d_${uyelik.id}`} name="gun" inputMode="numeric" required autoComplete="off" />
            </Alan>
          </EylemFormu>
        )}
        {dondurulmus && (
          <EylemFormu eylem={dondurmayiBitir} gonder="Dondurmayı Bitir" varyant="outline" onay="Dondurma bugün bitirilsin mi? Kullanılmayan günler bitiş tarihinden düşülür.">
            <input type="hidden" name="uyelik_id" value={uyelik.id} />
            <input type="hidden" name="musteri_id" value={musteriId} />
          </EylemFormu>
        )}
        {iptalEdilebilir && (
          <EylemFormu eylem={uyelikIptal} gonder="Üyeliği İptal Et" varyant="destructive" onay="Üyelik iptal edilsin mi? Bu işlem para iadesi yapmaz.">
            <input type="hidden" name="uyelik_id" value={uyelik.id} />
            <input type="hidden" name="musteri_id" value={musteriId} />
            <Alan etiket="İptal nedeni" htmlFor={`n_${uyelik.id}`}>
              <Input id={`n_${uyelik.id}`} name="neden" maxLength={300} autoComplete="off" />
            </Alan>
          </EylemFormu>
        )}
      </div>
    </details>
  );
}

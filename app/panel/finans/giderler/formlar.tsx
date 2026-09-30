"use client";

import { useActionState, useState } from "react";
import { Alan, IsimGirdisi } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { YontemHesapSecimi, type HesapSecenegi } from "@/components/panel/yontem-hesap-secimi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GIDER_KATEGORI_ETIKETLERI, GIDER_YONTEMLERI } from "@/lib/panel/finans";
import { giderIptal, giderOde, giderEkle } from "./actions";

export function GiderFormu({ hesaplar, bugun }: { hesaplar: HesapSecenegi[]; bugun: string }) {
  const [durum, setDurum] = useState<"odendi" | "bekliyor">("odendi");
  return (
    <EylemFormu eylem={giderEkle} gonder="Gideri Kaydet" anahtarli>
      <div className="grid gap-4 sm:grid-cols-3">
        <Alan etiket="Tür" htmlFor="g_tur">
          <SecimKutusu id="g_tur" name="tur" defaultValue="gider">
            <option value="gider">Gider</option>
            <option value="kamusal">Kamu ödemesi (vergi, SGK vb.)</option>
          </SecimKutusu>
        </Alan>
        <Alan etiket="Kategori" htmlFor="g_kategori">
          <SecimKutusu id="g_kategori" name="kategori" required defaultValue="">
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
        <Alan etiket="Tutar (₺)" htmlFor="g_tutar" ipucu="KDV dahil toplam.">
          <Input id="g_tutar" name="tutar" inputMode="decimal" required autoComplete="off" placeholder="0,00" />
        </Alan>
        <Alan etiket="Tedarikçi / alıcı" htmlFor="g_tedarikci">
          <IsimGirdisi id="g_tedarikci" name="tedarikci" />
        </Alan>
        <Alan etiket="Belge / fatura no" htmlFor="g_belge">
          <Input id="g_belge" name="belge_no" maxLength={60} autoComplete="off" />
        </Alan>
        <Alan etiket="KDV oranı (%)" htmlFor="g_kdv">
          <Input id="g_kdv" name="kdv_orani" inputMode="numeric" defaultValue="0" autoComplete="off" />
        </Alan>
        <Alan etiket="Gider tarihi" htmlFor="g_tarih" ipucu="Boşsa bugün.">
          <Input id="g_tarih" name="tarih" type="date" max={bugun} />
        </Alan>
        <Alan etiket="Durum" htmlFor="g_durum">
          <SecimKutusu id="g_durum" name="durum" value={durum} onChange={(e) => setDurum(e.target.value as "odendi" | "bekliyor")}>
            <option value="odendi">Ödendi</option>
            <option value="bekliyor">Ödenecek (vadeli)</option>
          </SecimKutusu>
        </Alan>
        {durum === "bekliyor" ? (
          <Alan etiket="Vade tarihi" htmlFor="g_vade">
            <Input id="g_vade" name="vade" type="date" required />
          </Alan>
        ) : (
          <YontemHesapSecimi id="g" yontemler={GIDER_YONTEMLERI} hesaplar={hesaplar} yontemEtiketi="Ödeme yöntemi" />
        )}
      </div>
      <Alan etiket="Açıklama" htmlFor="g_aciklama">
        <Textarea id="g_aciklama" name="aciklama" rows={2} maxLength={300} />
      </Alan>
    </EylemFormu>
  );
}

/** Bekleyen gider satırında: yöntem (ve hesap) seçip öde. */
export function GiderOdeFormu({ giderId, hesaplar }: { giderId: string; hesaplar: HesapSecenegi[] }) {
  const [durum, eylem, bekliyor] = useActionState(giderOde, null);
  const [yontem, setYontem] = useState("");
  return (
    <form action={eylem} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="gider_id" value={giderId} />
      <SecimKutusu name="yontem" required value={yontem} onChange={(e) => setYontem(e.target.value)} className="h-8 w-40" aria-label="Ödeme yöntemi">
        <option value="" disabled>
          Yöntem
        </option>
        {Object.entries(GIDER_YONTEMLERI).map(([k, e]) => (
          <option key={k} value={k}>
            {e}
          </option>
        ))}
      </SecimKutusu>
      {(yontem === "havale" || yontem === "kredi_karti") && hesaplar.length > 0 && (
        <SecimKutusu name="banka_hesap_id" defaultValue="" className="h-8 w-44" aria-label="Banka hesabı">
          <option value="">Hesap seçilmedi</option>
          {hesaplar.map((h) => (
            <option key={h.id} value={h.id}>
              {h.ad}
            </option>
          ))}
        </SecimKutusu>
      )}
      <Button type="submit" size="sm" disabled={bekliyor}>
        Öde
      </Button>
      {durum && !durum.success && <span className="basis-full text-xs font-medium text-destructive">{durum.message}</span>}
    </form>
  );
}

export function GiderIptalFormu({ giderId }: { giderId: string }) {
  const [durum, eylem, bekliyor] = useActionState(giderIptal, null);
  return (
    <details>
      <summary className="cursor-pointer text-xs font-semibold text-destructive select-none">İptal et</summary>
      <form action={eylem} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="gider_id" value={giderId} />
        <Input name="neden" required minLength={3} maxLength={300} placeholder="İptal nedeni" aria-label="İptal nedeni" className="h-8 w-56" autoComplete="off" />
        <Button type="submit" size="sm" variant="destructive" disabled={bekliyor}>
          İptal Et
        </Button>
        {durum && !durum.success && <span className="basis-full text-xs font-medium text-destructive">{durum.message}</span>}
      </form>
    </details>
  );
}

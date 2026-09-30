"use client";

import { Alan } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { kurusGirdiYazi } from "@/lib/para";
import { personelDonemKapat, personelHareketEkle, personelProfilKaydet } from "./actions";

export function ProfilFormu({
  kullaniciId,
  profil,
}: {
  kullaniciId: string;
  profil: { maas_kurus: number; ders_prim_kurus: number; ise_giris_tarihi: string | null; isten_cikis_tarihi: string | null } | null;
}) {
  return (
    <EylemFormu eylem={personelProfilKaydet} gonder="Kaydet">
      <input type="hidden" name="kullanici_id" value={kullaniciId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Aylık sabit maaş (₺)" htmlFor="pp_maas" ipucu="Kısmi ayda çalışılan gün oranında hesaplanır.">
          <Input id="pp_maas" name="maas" inputMode="decimal" defaultValue={profil?.maas_kurus ? kurusGirdiYazi(profil.maas_kurus) : ""} autoComplete="off" />
        </Alan>
        <Alan etiket="Tamamlanan ders başı prim (₺)" htmlFor="pp_prim" ipucu="Yalnız 'Tamamlandı' dersler sayılır.">
          <Input id="pp_prim" name="ders_prim" inputMode="decimal" defaultValue={profil?.ders_prim_kurus ? kurusGirdiYazi(profil.ders_prim_kurus) : ""} autoComplete="off" />
        </Alan>
        <Alan etiket="İşe giriş tarihi" htmlFor="pp_giris">
          <Input id="pp_giris" name="ise_giris_tarihi" type="date" defaultValue={profil?.ise_giris_tarihi ?? ""} />
        </Alan>
        <Alan etiket="İşten çıkış tarihi" htmlFor="pp_cikis" ipucu="Çıkış günü dahil çalışılır. Girilirse hesap pasife alınır, giriş engellenir.">
          <Input id="pp_cikis" name="isten_cikis_tarihi" type="date" defaultValue={profil?.isten_cikis_tarihi ?? ""} />
        </Alan>
      </div>
    </EylemFormu>
  );
}

export function HareketFormu({ kullaniciId }: { kullaniciId: string }) {
  return (
    <EylemFormu eylem={personelHareketEkle} gonder="Kaydet" anahtarli>
      <input type="hidden" name="kullanici_id" value={kullaniciId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Alan etiket="Tür" htmlFor="ph_tur">
          <SecimKutusu id="ph_tur" name="tur" defaultValue="odeme">
            <option value="odeme">Maaş / hakediş ödemesi</option>
            <option value="avans">Avans</option>
          </SecimKutusu>
        </Alan>
        <Alan etiket="Tutar (₺)" htmlFor="ph_tutar">
          <Input id="ph_tutar" name="tutar" inputMode="decimal" required autoComplete="off" />
        </Alan>
        <Alan etiket="Yöntem" htmlFor="ph_yontem">
          <SecimKutusu id="ph_yontem" name="yontem" defaultValue="havale">
            <option value="havale">Havale / EFT</option>
            <option value="nakit">Nakit</option>
          </SecimKutusu>
        </Alan>
      </div>
      <Alan etiket="Açıklama" htmlFor="ph_aciklama">
        <Textarea id="ph_aciklama" name="aciklama" rows={2} maxLength={300} />
      </Alan>
    </EylemFormu>
  );
}

export function DonemKapatFormu({ ay }: { ay: string }) {
  return (
    <EylemFormu eylem={personelDonemKapat} gonder="Dönemi Kapat" yukleniyor="Kapatılıyor..." onay="Bu dönemin hakediş ve primleri deftere yazılacak ve artık değişmeyecek. Devam edilsin mi?" varyant="outline" boyut="sm">
      <input type="hidden" name="ay" value={ay} />
    </EylemFormu>
  );
}

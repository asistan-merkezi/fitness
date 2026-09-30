"use client";

import { Alan, IsimGirdisi, OnayKutusu } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { Input } from "@/components/ui/input";
import { ROL_ETIKETLERI } from "@/lib/panel/roller";
import { isletmeAdiGuncelle, personelEkle, personelGuncelle } from "./actions";

const ATANABILIR_ROLLER = ["isletme_admin", "resepsiyon", "antrenor", "muhasebe"] as const;

function RolSecimi({ id, varsayilan }: { id: string; varsayilan: string }) {
  return (
    <SecimKutusu id={id} name="rol" defaultValue={varsayilan} required>
      {ATANABILIR_ROLLER.map((r) => (
        <option key={r} value={r}>
          {ROL_ETIKETLERI[r]}
        </option>
      ))}
    </SecimKutusu>
  );
}

export function PersonelEkleFormu() {
  return (
    <EylemFormu eylem={personelEkle} gonder="Hesap Oluştur" yukleniyor="Oluşturuluyor...">
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Ad soyad" htmlFor="pe_ad">
          <IsimGirdisi id="pe_ad" name="ad_soyad" required />
        </Alan>
        <Alan etiket="Rol" htmlFor="pe_rol">
          <RolSecimi id="pe_rol" varsayilan="resepsiyon" />
        </Alan>
        <Alan etiket="Telefon" htmlFor="pe_telefon" ipucu="Yönetici dışındaki roller bu numarayla giriş yapar; yönetici için boş bırakılabilir.">
          <Input id="pe_telefon" name="telefon" type="tel" autoComplete="off" placeholder="05xx xxx xx xx" />
        </Alan>
        <Alan etiket="E-posta" htmlFor="pe_eposta">
          <Input id="pe_eposta" name="eposta" type="email" autoComplete="off" required />
        </Alan>
        <Alan etiket="Geçici şifre" htmlFor="pe_sifre" ipucu="En az 10 karakter, harf ve rakam içermeli. Kişiye güvenli bir yolla iletin.">
          <Input id="pe_sifre" name="sifre" type="password" autoComplete="new-password" minLength={10} required />
        </Alan>
      </div>
    </EylemFormu>
  );
}

export function PersonelSatiriFormu({ kullaniciId, rol, aktif, benMiyim }: { kullaniciId: string; rol: string; aktif: boolean; benMiyim: boolean }) {
  if (benMiyim) return <span className="text-xs text-muted-foreground">Kendi hesabınız</span>;
  return (
    <EylemFormu eylem={personelGuncelle} gonder="Kaydet" varyant="outline" className="sm:flex-row sm:items-end sm:gap-3">
      <input type="hidden" name="kullanici_id" value={kullaniciId} />
      <Alan etiket="Rol" htmlFor={`r_${kullaniciId}`}>
        <RolSecimi id={`r_${kullaniciId}`} varsayilan={rol} />
      </Alan>
      <OnayKutusu id={`a_${kullaniciId}`} name="aktif" etiket="Aktif" varsayilan={aktif} />
    </EylemFormu>
  );
}

export function IsletmeAdiFormu({ ad }: { ad: string }) {
  return (
    <EylemFormu eylem={isletmeAdiGuncelle} gonder="Kaydet" className="sm:max-w-md">
      <Alan etiket="İşletme adı" htmlFor="isletme_ad">
        <IsimGirdisi id="isletme_ad" name="ad" varsayilan={ad} required />
      </Alan>
    </EylemFormu>
  );
}

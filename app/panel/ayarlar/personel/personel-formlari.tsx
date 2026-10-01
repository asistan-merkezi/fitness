"use client";

import { useState } from "react";
import { CirclePlus } from "lucide-react";
import { Alan, IsimGirdisi, OnayKutusu } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { Input } from "@/components/ui/input";
import { type Pozisyon, pozisyonGruplari } from "@/lib/panel/pozisyon";
import { ROL_ETIKETLERI } from "@/lib/panel/roller";
import { isletmeAdiGuncelle, ozelPozisyonOlustur, personelEkle, personelGuncelle } from "./actions";

const ATANABILIR_ROLLER = ["isletme_admin", "resepsiyon", "antrenor", "muhasebe"] as const;

/**
 * Pozisyon + rol alanı. Pozisyon seçilince rol pozisyonun varsayılan rolüne bağlanır (sunucu da aynısını uygular);
 * pozisyon seçilmediyse rol elle seçilir.
 */
function PozisyonRolAlani({ idOnek, pozisyonlar, pozisyonId, rol }: { idOnek: string; pozisyonlar: Pozisyon[]; pozisyonId: string | null; rol: string }) {
  const [secili, setSecili] = useState(pozisyonId ?? "");
  const pozisyon = pozisyonlar.find((p) => p.id === secili);

  return (
    <>
      <Alan etiket="Pozisyon" htmlFor={`${idOnek}_pozisyon`} ipucu={pozisyonlar.length === 0 ? "Atanabilir pozisyon yok: Pozisyonlar sekmesinden pozisyonu aktifleştirip sistem erişimini açın." : undefined}>
        <SecimKutusu id={`${idOnek}_pozisyon`} name="pozisyon_id" value={secili} onChange={(e) => setSecili(e.target.value)}>
          <option value="">Pozisyon yok (yalnız rol)</option>
          {pozisyonGruplari(pozisyonlar).map(({ grup, pozisyonlar: liste }) => (
            <optgroup key={grup} label={grup}>
              {liste.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.ad}
                </option>
              ))}
            </optgroup>
          ))}
        </SecimKutusu>
      </Alan>
      <Alan etiket="Rol" htmlFor={`${idOnek}_rol`} ipucu={pozisyon ? "Rol pozisyondan gelir." : undefined}>
        {pozisyon ? (
          <Input id={`${idOnek}_rol`} value={ROL_ETIKETLERI[pozisyon.varsayilan_rol]} readOnly aria-readonly />
        ) : (
          <SecimKutusu id={`${idOnek}_rol`} name="rol" defaultValue={rol} required>
            {ATANABILIR_ROLLER.map((r) => (
              <option key={r} value={r}>
                {ROL_ETIKETLERI[r]}
              </option>
            ))}
          </SecimKutusu>
        )}
      </Alan>
    </>
  );
}

export function PersonelEkleFormu({ pozisyonlar }: { pozisyonlar: Pozisyon[] }) {
  return (
    <EylemFormu eylem={personelEkle} gonder="Hesap Oluştur" yukleniyor="Oluşturuluyor...">
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Ad soyad" htmlFor="pe_ad">
          <IsimGirdisi id="pe_ad" name="ad_soyad" required />
        </Alan>
        <Alan etiket="E-posta" htmlFor="pe_eposta">
          <Input id="pe_eposta" name="eposta" type="email" autoComplete="off" required />
        </Alan>
        <PozisyonRolAlani idOnek="pe" pozisyonlar={pozisyonlar} pozisyonId={null} rol="resepsiyon" />
        <Alan etiket="Geçici şifre" htmlFor="pe_sifre" ipucu="En az 10 karakter, harf ve rakam içermeli. Kişiye güvenli bir yolla iletin.">
          <Input id="pe_sifre" name="sifre" type="password" autoComplete="new-password" minLength={10} required />
        </Alan>
      </div>
    </EylemFormu>
  );
}

export function PersonelSatiriFormu({
  kullaniciId,
  rol,
  aktif,
  pozisyonId,
  pozisyonlar,
  benMiyim,
}: {
  kullaniciId: string;
  rol: string;
  aktif: boolean;
  pozisyonId: string | null;
  pozisyonlar: Pozisyon[];
  benMiyim: boolean;
}) {
  if (benMiyim) return <span className="text-xs text-muted-foreground">Kendi hesabınız</span>;
  return (
    <EylemFormu eylem={personelGuncelle} gonder="Kaydet" varyant="outline" className="sm:flex-row sm:items-end sm:gap-3">
      <input type="hidden" name="kullanici_id" value={kullaniciId} />
      <PozisyonRolAlani idOnek={`p_${kullaniciId}`} pozisyonlar={pozisyonlar} pozisyonId={pozisyonId} rol={rol} />
      <OnayKutusu id={`a_${kullaniciId}`} name="aktif" etiket="Aktif" varsayilan={aktif} />
    </EylemFormu>
  );
}

export function OzelPozisyonFormu({ departmanlar }: { departmanlar: string[] }) {
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold select-none">
        <CirclePlus className="size-4 text-primary" strokeWidth={1.5} aria-hidden /> Özel Pozisyon Ekle
      </summary>
      <div className="border-t border-border p-4">
        <EylemFormu eylem={ozelPozisyonOlustur} gonder="Ekle" yukleniyor="Ekleniyor..." gonderSinifi="w-fit">
          <div className="grid gap-4 sm:grid-cols-2">
            <Alan etiket="Departman" htmlFor="oz_grup">
              <SecimKutusu id="oz_grup" name="grup" defaultValue={departmanlar[0]} required>
                {departmanlar.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </SecimKutusu>
            </Alan>
            <Alan etiket="Ünvan" htmlFor="oz_ad" ipucu="Rol, ücret tipi ve puantaj modu departmandaki ilk pozisyondan devralınır; pasif ve sistem erişimsiz başlar.">
              <Input id="oz_ad" name="ad" required minLength={2} maxLength={100} placeholder="Örn. Franchise Koordinatörü" autoComplete="off" />
            </Alan>
          </div>
        </EylemFormu>
      </div>
    </details>
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

"use client";

import { useRouter } from "next/navigation";
import { Alan } from "@/components/panel/form-alanlari";
import { EylemFormu, SecimKutusu } from "@/components/panel/eylem-formu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PUANTAJ_DURUMU } from "@/lib/panel/etiketler";
import { puantajKaydet, puantajSil } from "../actions";

export type HucreKaydi = { durum: string; giris: string | null; cikis: string | null; fazlaMesaiDk: number; not: string | null };

const SECILEBILIR = ["geldi", "yarim_gun", "gelmedi", "raporlu"] as const;

/**
 * Puantaj hücresi penceresi (cetvelde bir personel × gün). Açık/kapalı durum URL'den (`?hucre=`) gelir.
 * Kaydet günü yazar/günceller; "Kaydı Temizle" günü boşaltır. Hakedişi kapatılmış aylar bu pencereye hiç gelmez (salt-okunur hücre).
 */
export function HucreDialog({ kapatHref, kullaniciId, personelAdi, tarih, tarihEtiketi, kayit }: { kapatHref: string; kullaniciId: string; personelAdi: string; tarih: string; tarihEtiketi: string; kayit: HucreKaydi | null }) {
  const router = useRouter();
  const kapat = () => router.replace(kapatHref, { scroll: false });

  return (
    <Dialog open onOpenChange={(acik) => !acik && kapat()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{personelAdi}</DialogTitle>
          <DialogDescription>{tarihEtiketi} · puantaj kaydı</DialogDescription>
        </DialogHeader>
        <EylemFormu eylem={puantajKaydet} gonder="Kaydet" yukleniyor="Kaydediliyor..." basariliOlunca={kapat}>
          <input type="hidden" name="kullanici_id" value={kullaniciId} />
          <input type="hidden" name="tarih" value={tarih} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Alan etiket="Durum" htmlFor="pc_durum">
              <SecimKutusu id="pc_durum" name="durum" required defaultValue={kayit?.durum ?? "geldi"}>
                {SECILEBILIR.map((d) => (
                  <option key={d} value={d}>
                    {PUANTAJ_DURUMU[d].etiket}
                  </option>
                ))}
              </SecimKutusu>
            </Alan>
            <Alan etiket="Fazla mesai (dk)" htmlFor="pc_fm" ipucu="Yalnız kayıt amaçlıdır; hakedişi değiştirmez.">
              <Input id="pc_fm" name="fazla_mesai_dk" type="number" min={0} max={960} step={5} inputMode="numeric" defaultValue={kayit?.fazlaMesaiDk ?? 0} />
            </Alan>
            <Alan etiket="Giriş saati" htmlFor="pc_giris">
              <Input id="pc_giris" name="giris" type="time" defaultValue={kayit?.giris?.slice(0, 5) ?? ""} />
            </Alan>
            <Alan etiket="Çıkış saati" htmlFor="pc_cikis">
              <Input id="pc_cikis" name="cikis" type="time" defaultValue={kayit?.cikis?.slice(0, 5) ?? ""} />
            </Alan>
          </div>
          <Alan etiket="Not" htmlFor="pc_not">
            <Input id="pc_not" name="not_metni" maxLength={200} autoComplete="off" defaultValue={kayit?.not ?? ""} />
          </Alan>
        </EylemFormu>
        {kayit && (
          <EylemFormu eylem={puantajSil} gonder="Kaydı Temizle" yukleniyor="Temizleniyor..." varyant="outline" boyut="sm" onay="Bu günün puantaj kaydı temizlensin mi?" basariliOlunca={kapat} className="border-t border-border pt-3">
            <input type="hidden" name="kullanici_id" value={kullaniciId} />
            <input type="hidden" name="tarih" value={tarih} />
          </EylemFormu>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useActionState, useState } from "react";
import { Alan } from "@/components/panel/form-alanlari";
import { SecimKutusu } from "@/components/panel/eylem-formu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { gunEkle, haftaGunuIlkTarih } from "@/lib/donem";
import { cn, telefonGoster } from "@/lib/utils";
import { periyodikDersOlustur } from "./actions";
import { ilkGerceklesenTarih, saatAdaylari, saatMusaitMi } from "@/lib/panel/musait-saatler";
import { useMesgulAraliklar, type MusteriSecenegi } from "./ders-sorgulari";
import { MusteriArama } from "./musteri-arama";

const SURELER = [30, 45, 60, 90, 120] as const;
const GUNLER = [
  { deger: "1", etiket: "Pazartesi" },
  { deger: "2", etiket: "Salı" },
  { deger: "3", etiket: "Çarşamba" },
  { deger: "4", etiket: "Perşembe" },
  { deger: "5", etiket: "Cuma" },
  { deger: "6", etiket: "Cumartesi" },
  { deger: "0", etiket: "Pazar" },
] as const;

type GunSaat = { gun: string; saat: string };

/** Bugünden (İstanbul) itibaren verilen haftanın gününe (0=Pazar) denk gelen ilk tarih, "yyyy-MM-dd". */
const sonrakiTarih = (haftaninGunu: number) => haftaGunuIlkTarih(bugunIstanbulTarihi(), haftaninGunu);

/**
 * Periyodik ders formu (klinikteki Periyodik Randevu düzeni): Müşteri → Haftada kaç gün → Günler → Süre → Antrenör → Alan → her gün için müsait saat butonları.
 * Saat serbest girilmez; her günün müsaitliği o günün İLK gerçekleşecek tarihine göre hesaplanır (bugünse ve saat geçmişse bir sonraki hafta).
 * Seçilen gün+saatlerde ≈5 aylık haftalık dersler açılır; dolu haftalar atlanır.
 */
export function PeriyodikDersFormu({
  antrenorler,
  alanlar,
  sabitMusteri,
}: {
  antrenorler: { id: string; ad_soyad: string }[];
  alanlar: { id: string; ad: string }[];
  sabitMusteri?: MusteriSecenegi;
}) {
  const [durum, formAction, bekliyor] = useActionState(periyodikDersOlustur, null);
  const [musteriId, setMusteriId] = useState(sabitMusteri?.id ?? "");
  const [gunler, setGunler] = useState<GunSaat[]>([{ gun: "1", saat: "" }]);
  const [sure, setSure] = useState(60);
  const [antrenorId, setAntrenorId] = useState("");
  const [alanId, setAlanId] = useState("");

  const eksikTanim = antrenorler.length === 0 || alanlar.length === 0;
  const efektifAntrenorId = antrenorler.some((a) => a.id === antrenorId) ? antrenorId : "";
  const efektifAlanId = alanlar.some((a) => a.id === alanId) ? alanId : "";
  const kaynakHazir = efektifAntrenorId !== "" && efektifAlanId !== "";

  // Tek sorgu: her günün ilk tarihinden (+7 gün payı, geçmiş saat için kayan hafta) arasını kapsar.
  const ilkTarihler = gunler.map((g) => sonrakiTarih(Number(g.gun))).sort();
  const { veri: mesgul, yukleniyor } = useMesgulAraliklar(
    kaynakHazir ? ilkTarihler[0] : "",
    kaynakHazir ? gunEkle(ilkTarihler[ilkTarihler.length - 1], 7) : "",
    efektifAntrenorId,
    efektifAlanId,
    musteriId
  );
  const adaylar = saatAdaylari();
  const saatMusait = (gun: string, saat: string) => Boolean(mesgul) && saatMusaitMi(ilkGerceklesenTarih(sonrakiTarih(Number(gun)), saat), saat, sure, mesgul!);
  const zamanHazir = kaynakHazir && gunler.every((g) => g.saat !== "" && saatMusait(g.gun, g.saat));

  function gunSayisiDegisti(n: number) {
    setGunler((m) => (n <= m.length ? m.slice(0, n) : [...m, ...Array.from({ length: n - m.length }, () => ({ gun: "1", saat: "" }))]));
  }
  const satirGuncelle = (i: number, d: Partial<GunSaat>) => setGunler((m) => m.map((g, j) => (j === i ? { ...g, ...d } : g)));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Seçilen gün(ler) + saat(ler)de ileriye dönük 5 aylık dersler tek seferde oluşturulur. Antrenör, alan ya da müşteri o saatte doluysa o hafta atlanır.
      </p>
      <input type="hidden" name="gunler_json" value={JSON.stringify(gunler.map((g) => ({ ...g, saat: kaynakHazir && g.saat !== "" && saatMusait(g.gun, g.saat) ? g.saat : "" })))} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Alan etiket="Müşteri" htmlFor="p_musteri">
            {sabitMusteri ? (
              <>
                <Input id="p_musteri" value={`${sabitMusteri.ad_soyad} · #${sabitMusteri.uye_no} · ${telefonGoster(sabitMusteri.telefon)}`} disabled readOnly />
                <input type="hidden" name="musteri_id" value={sabitMusteri.id} />
              </>
            ) : (
              <MusteriArama id="p_musteri" disabled={bekliyor} onSecim={(m) => setMusteriId(m.id)} onTemizle={() => setMusteriId("")} />
            )}
          </Alan>
        </div>

        <Alan etiket="Haftada Kaç Gün" htmlFor="p_gun_sayisi">
          <SecimKutusu id="p_gun_sayisi" value={gunler.length} onChange={(e) => gunSayisiDegisti(Number(e.target.value))} disabled={bekliyor}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                Haftada {n} gün
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        <Alan etiket="Süre" htmlFor="p_sure">
          <SecimKutusu id="p_sure" name="sure" value={sure} onChange={(e) => setSure(Number(e.target.value))} disabled={bekliyor}>
            {SURELER.map((s) => (
              <option key={s} value={s}>
                {s} dakika
              </option>
            ))}
          </SecimKutusu>
        </Alan>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-sm font-medium">Günler</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {gunler.map((g, i) => (
              <SecimKutusu key={i} aria-label={`${i + 1}. gün`} value={g.gun} onChange={(e) => satirGuncelle(i, { gun: e.target.value, saat: "" })} disabled={bekliyor}>
                {GUNLER.map((x) => (
                  <option key={x.deger} value={x.deger}>
                    {x.etiket}
                  </option>
                ))}
              </SecimKutusu>
            ))}
          </div>
        </div>

        <Alan etiket="Antrenör" htmlFor="p_antrenor">
          <SecimKutusu id="p_antrenor" name="antrenor_id" required value={efektifAntrenorId} onChange={(e) => setAntrenorId(e.target.value)} disabled={bekliyor || antrenorler.length === 0}>
            <option value="" disabled>
              {antrenorler.length === 0 ? "Önce Ayarlar > Personel Tanımlama'dan antrenör ekleyin" : "Seçin"}
            </option>
            {antrenorler.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ad_soyad}
              </option>
            ))}
          </SecimKutusu>
        </Alan>
        <Alan etiket="Alan / stüdyo" htmlFor="p_alan">
          <SecimKutusu id="p_alan" name="alan_id" required value={efektifAlanId} onChange={(e) => setAlanId(e.target.value)} disabled={bekliyor || alanlar.length === 0}>
            <option value="" disabled>
              {alanlar.length === 0 ? "Önce Yönetim > Donanım'dan alan ekleyin" : "Seçin"}
            </option>
            {alanlar.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ad}
              </option>
            ))}
          </SecimKutusu>
        </Alan>

        <div className="flex flex-col gap-3 sm:col-span-2">
          <span className="text-sm font-medium">Saatler</span>
          {!kaynakHazir ? (
            <p className="text-sm text-muted-foreground">Müsait saatleri görmek için gün(ler), antrenör ve alan seçin.</p>
          ) : yukleniyor || !mesgul ? (
            <p className="text-sm text-muted-foreground">Müsait saatler kontrol ediliyor…</p>
          ) : (
            gunler.map((g, i) => {
              const gunAd = GUNLER.find((x) => x.deger === g.gun)?.etiket ?? "";
              const saatler = adaylar.filter(
                (a) => saatMusait(g.gun, a) && !gunler.some((d, j) => j !== i && d.gun === g.gun && d.saat === a)
              );
              const secili = saatler.includes(g.saat) ? g.saat : "";
              return (
                <div key={i} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {i + 1}. gün · {gunAd}
                  </span>
                  {saatler.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Bu gün için müsait saat yok.</p>
                  ) : (
                    <div role="radiogroup" aria-label={`${gunAd} müsait saatler`} className="flex flex-wrap gap-2">
                      {saatler.map((a) => (
                        <Button
                          key={a}
                          type="button"
                          role="radio"
                          aria-checked={secili === a}
                          variant={secili === a ? "default" : "outline"}
                          size="sm"
                          disabled={bekliyor}
                          onClick={() => satirGuncelle(i, { saat: a })}
                          className="tabular"
                        >
                          {a}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {musteriId && (
          <div className="sm:col-span-2">
            <Alan etiket="Ders ücreti (₺)" htmlFor="p_ucret" ipucu="Boşsa ücretsiz. Girilirse her ders için ayrı uygulanır.">
              <Input id="p_ucret" name="ucret" inputMode="decimal" autoComplete="off" className="w-40" disabled={bekliyor} />
            </Alan>
          </div>
        )}

        <div className="sm:col-span-2">
          <Alan etiket="Not" htmlFor="p_not">
            <Textarea id="p_not" name="not" rows={2} maxLength={300} disabled={bekliyor} />
          </Alan>
        </div>
      </div>

      {durum && (
        <p
          role={durum.success ? "status" : "alert"}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm font-medium",
            durum.success ? "border-success-border bg-success-soft text-success" : "border-destructive-border bg-destructive-soft text-destructive"
          )}
        >
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={bekliyor || !musteriId || eksikTanim || !zamanHazir} className="w-fit">
        {bekliyor ? "Planlanıyor..." : "Periyodik ders oluştur"}
      </Button>
    </form>
  );
}

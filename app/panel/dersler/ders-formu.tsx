"use client";

import { useActionState, useState } from "react";
import { Alan } from "@/components/panel/form-alanlari";
import { SecimKutusu } from "@/components/panel/eylem-formu";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { bugunIstanbulTarihi, gunYazi, toUTC } from "@/lib/datetime";
import { musaitSaatler } from "@/lib/panel/musait-saatler";
import { cn, telefonGoster } from "@/lib/utils";
import { dersOlustur } from "./actions";
import { useMesgulAraliklar, useMusteriDersPaketleri, type MusteriSecenegi } from "./ders-sorgulari";
import { MusteriArama } from "./musteri-arama";

const SURELER = [30, 45, 60, 90, 120] as const;

const saatYazi = (tarih: string, saat: string, sureDk: number) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(new Date(toUTC(`${tarih}T${saat}:00`)).getTime() + sureDk * 60_000)
  );

/**
 * Yeni ders formu (klinikteki Yeni Randevu düzeni): Müşteri → ders paketi → Tarih → Süre → Antrenör → Alan → müsait saat butonları.
 * Saat serbest girilmez: antrenör + alan seçilince 30 dk'lık ızgaradan yalnız antrenör, alan ve müşterinin boş olduğu saatler listelenir.
 */
export function DersFormu({
  antrenorler,
  alanlar,
  varsayilanTarih,
  varsayilanSaat,
  sabitMusteri,
}: {
  antrenorler: { id: string; ad_soyad: string }[];
  alanlar: { id: string; ad: string }[];
  varsayilanTarih: string;
  varsayilanSaat?: string;
  /** Müşteri kartından açılınca müşteri sabit gelir (arama yerine salt-okunur gösterilir). */
  sabitMusteri?: MusteriSecenegi;
}) {
  const [durum, formAction, bekliyor] = useActionState(dersOlustur, null);
  const [ilkAnahtar] = useState(() => crypto.randomUUID());
  const [musteriId, setMusteriId] = useState(sabitMusteri?.id ?? "");
  const [tarih, setTarih] = useState(varsayilanTarih);
  const [saat, setSaat] = useState(varsayilanSaat ?? "");
  const [sure, setSure] = useState(60);
  const [antrenorId, setAntrenorId] = useState("");
  const [alanId, setAlanId] = useState("");

  const { veri: paketler } = useMusteriDersPaketleri(musteriId);
  const eksikTanim = antrenorler.length === 0 || alanlar.length === 0;
  const bugun = bugunIstanbulTarihi();
  const efektifAntrenorId = antrenorler.some((a) => a.id === antrenorId) ? antrenorId : "";
  const efektifAlanId = alanlar.some((a) => a.id === alanId) ? alanId : "";
  const saatlerHazir = tarih !== "" && efektifAntrenorId !== "" && efektifAlanId !== "";
  const { veri: mesgul, yukleniyor: musaitlikYukleniyor } = useMesgulAraliklar(saatlerHazir ? tarih : "", saatlerHazir ? tarih : "", efektifAntrenorId, efektifAlanId, musteriId);
  const saatler = saatlerHazir && mesgul ? musaitSaatler(tarih, sure, mesgul, varsayilanSaat ?? "") : [];
  // Seçili saat, antrenör/alan/tarih/süre değişince dolu hâle gelirse sessizce sıfırlanır.
  const efektifSaat = saatler.includes(saat) ? saat : "";
  const zamanHazir = efektifSaat !== "";

  const paketVar = (paketler?.length ?? 0) > 0;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="anahtar" value={durum?.anahtar ?? ilkAnahtar} suppressHydrationWarning />
      <input type="hidden" name="baslangic" value={zamanHazir ? `${tarih}T${efektifSaat}` : ""} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Alan etiket="Müşteri" htmlFor="d_musteri">
            {sabitMusteri ? (
              <>
                <Input id="d_musteri" value={`${sabitMusteri.ad_soyad} · #${sabitMusteri.uye_no} · ${telefonGoster(sabitMusteri.telefon)}`} disabled readOnly />
                <input type="hidden" name="musteri_id" value={sabitMusteri.id} />
              </>
            ) : (
              <MusteriArama id="d_musteri" disabled={bekliyor} onSecim={(m) => setMusteriId(m.id)} onTemizle={() => setMusteriId("")} />
            )}
          </Alan>
        </div>

        {musteriId && paketler && (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            {paketVar ? (
              <>
                <span className="text-xs font-medium text-muted-foreground">Ders paketi — müşteri derse gelince en eski paketten 1 hak düşer</span>
                <div className="flex flex-wrap gap-1.5">
                  {paketler.map((p) => (
                    <StatusBadge key={p.id} tone="emerald">
                      {p.paket_adi} · {p.kalan_hak} hak kaldı{p.bitis_tarihi ? ` · ${gunYazi(p.bitis_tarihi)}` : ""}
                    </StatusBadge>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Bu müşterinin ders paketi yok. Ders ücreti girerseniz, derse gelindiğinde cariye borç yazılır.</p>
            )}
          </div>
        )}

        <Alan etiket="Tarih" htmlFor="d_tarih">
          <Input id="d_tarih" type="date" value={tarih} min={bugun} onChange={(e) => setTarih(e.target.value)} required disabled={bekliyor} />
        </Alan>
        <Alan etiket="Süre" htmlFor="d_sure">
          <SecimKutusu id="d_sure" name="sure" value={sure} onChange={(e) => setSure(Number(e.target.value))} disabled={bekliyor}>
            {SURELER.map((s) => (
              <option key={s} value={s}>
                {s} dakika
              </option>
            ))}
          </SecimKutusu>
        </Alan>

        <Alan etiket="Antrenör" htmlFor="d_antrenor">
          <SecimKutusu
            id="d_antrenor"
            name="antrenor_id"
            required
            value={efektifAntrenorId}
            onChange={(e) => setAntrenorId(e.target.value)}
            disabled={bekliyor || tarih === "" || antrenorler.length === 0}
          >
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
        <Alan etiket="Alan / stüdyo" htmlFor="d_alan">
          <SecimKutusu
            id="d_alan"
            name="alan_id"
            required
            value={efektifAlanId}
            onChange={(e) => setAlanId(e.target.value)}
            disabled={bekliyor || tarih === "" || alanlar.length === 0}
          >
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

        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-sm font-medium">Saat</span>
          {!saatlerHazir ? (
            <p className="text-sm text-muted-foreground">Müsait saatleri görmek için tarih, antrenör ve alan seçin.</p>
          ) : musaitlikYukleniyor ? (
            <p className="text-sm text-muted-foreground">Müsait saatler kontrol ediliyor…</p>
          ) : saatler.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bu gün için müsait saat yok.</p>
          ) : (
            <>
              <div role="radiogroup" aria-label="Müsait saatler" className="flex flex-wrap gap-2">
                {saatler.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={efektifSaat === s}
                    variant={efektifSaat === s ? "default" : "outline"}
                    size="sm"
                    disabled={bekliyor}
                    onClick={() => setSaat(s)}
                    className="tabular"
                  >
                    {s}
                  </Button>
                ))}
              </div>
              {zamanHazir && <p className="text-xs text-muted-foreground">Bitiş: {saatYazi(tarih, efektifSaat, sure)}</p>}
            </>
          )}
        </div>

        {musteriId && !paketVar && paketler && (
          <div className="sm:col-span-2">
            <Alan etiket="Ders ücreti (₺)" htmlFor="d_ucret" ipucu="Boşsa ücretsiz. Müşteri derse geldiğinde bu tutar cariye borç yazılır.">
              <Input id="d_ucret" name="ucret" inputMode="decimal" autoComplete="off" className="w-40" disabled={bekliyor} />
            </Alan>
          </div>
        )}

        <div className="sm:col-span-2">
          <Alan etiket="Not" htmlFor="d_not">
            <Textarea id="d_not" name="not" rows={2} maxLength={300} disabled={bekliyor} />
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

      <Button type="submit" disabled={bekliyor || !zamanHazir || eksikTanim} className="w-fit">
        {bekliyor ? "Planlanıyor..." : "Ders oluştur"}
      </Button>
    </form>
  );
}

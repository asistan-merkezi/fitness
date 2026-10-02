"use client";

import { useActionState, useState } from "react";
import { Alan } from "@/components/panel/form-alanlari";
import { SecimKutusu } from "@/components/panel/eylem-formu";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { gunYazi, toUTC } from "@/lib/datetime";
import { cn, telefonGoster } from "@/lib/utils";
import { dersOlustur } from "./actions";
import { useDoluKaynaklar, useMusteriDersPaketleri, type MusteriSecenegi } from "./ders-sorgulari";
import { MusteriArama } from "./musteri-arama";

const SURELER = [30, 45, 60, 90, 120] as const;

const saatYazi = (tarih: string, saat: string, sureDk: number) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(new Date(toUTC(`${tarih}T${saat}:00`)).getTime() + sureDk * 60_000)
  );

/**
 * Yeni ders formu (klinikteki Yeni Randevu düzeni): Müşteri → ders paketi → Tarih → Saat → Süre → Antrenör → Alan.
 * Antrenör ve alan listeleri tarih+saat girilince yalnız o aralıkta MÜSAİT olanları gösterir.
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
  const zamanHazir = tarih !== "" && saat !== "";
  const { veri: dolu, yukleniyor: musaitlikYukleniyor } = useDoluKaynaklar(tarih, saat, sure);

  const musaitAntrenorler = dolu ? antrenorler.filter((a) => !dolu.antrenorler.has(a.id)) : antrenorler;
  const musaitAlanlar = dolu ? alanlar.filter((a) => !dolu.alanlar.has(a.id)) : alanlar;
  // Zaman değişince seçili antrenör/alan doluya düşerse seçim sessizce boşalır (gönderilen değer buna göre türer).
  const efektifAntrenorId = musaitAntrenorler.some((a) => a.id === antrenorId) ? antrenorId : "";
  const efektifAlanId = musaitAlanlar.some((a) => a.id === alanId) ? alanId : "";
  const musteriMesgul = Boolean(dolu && musteriId && dolu.musteriler.has(musteriId));

  const paketVar = (paketler?.length ?? 0) > 0;
  const bosYerMetni = (ad: string, bos: boolean) =>
    !zamanHazir ? "Önce tarih ve saat seçin" : musaitlikYukleniyor ? "Müsaitlik kontrol ediliyor…" : bos ? `Bu saatte müsait ${ad} yok` : "Seçin";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="anahtar" value={durum?.anahtar ?? ilkAnahtar} suppressHydrationWarning />
      <input type="hidden" name="baslangic" value={zamanHazir ? `${tarih}T${saat}` : ""} />

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
          <Input id="d_tarih" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} required disabled={bekliyor} />
        </Alan>
        <Alan etiket="Saat" htmlFor="d_saat" ipucu={zamanHazir ? `Bitiş: ${saatYazi(tarih, saat, sure)}` : undefined}>
          <Input id="d_saat" type="time" value={saat} onChange={(e) => setSaat(e.target.value)} required disabled={bekliyor} />
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
        <div className="hidden sm:block" aria-hidden />

        <Alan etiket="Antrenör" htmlFor="d_antrenor">
          <SecimKutusu
            id="d_antrenor"
            name="antrenor_id"
            required
            value={efektifAntrenorId}
            onChange={(e) => setAntrenorId(e.target.value)}
            disabled={bekliyor || !zamanHazir || musaitAntrenorler.length === 0}
          >
            <option value="" disabled>
              {antrenorler.length === 0 ? "Önce Ayarlar > Personel Tanımlama'dan antrenör ekleyin" : bosYerMetni("antrenör", musaitAntrenorler.length === 0)}
            </option>
            {musaitAntrenorler.map((a) => (
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
            disabled={bekliyor || !zamanHazir || musaitAlanlar.length === 0}
          >
            <option value="" disabled>
              {alanlar.length === 0 ? "Önce Yönetim > Donanım'dan alan ekleyin" : bosYerMetni("alan", musaitAlanlar.length === 0)}
            </option>
            {musaitAlanlar.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ad}
              </option>
            ))}
          </SecimKutusu>
        </Alan>

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

      {musteriMesgul && (
        <p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          Bu müşterinin seçilen saatte başka bir dersi var — başka bir saat seçin.
        </p>
      )}

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

      <Button type="submit" disabled={bekliyor || musteriMesgul || eksikTanim} className="w-fit">
        {bekliyor ? "Planlanıyor..." : "Ders oluştur"}
      </Button>
    </form>
  );
}

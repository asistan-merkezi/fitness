"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Alan } from "@/components/panel/form-alanlari";
import { SecimKutusu } from "@/components/panel/eylem-formu";
import type { HesapSecenegi } from "@/components/panel/yontem-hesap-secimi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EylemSonucu } from "@/lib/eylem";
import { kurusGirdiYazi, kurusTLyazi } from "@/lib/para";
import { ODEME_KATEGORI_ETIKET, ODEME_KATEGORI_TUR, ODEME_YONTEMLI_TURLER, PERSONEL_ODEME_YONTEMLERI, type OdemeKategori } from "@/lib/panel/personel-odeme";
import { cn } from "@/lib/utils";
import { personelHareketEkle, personelTopluOdemeEkle } from "./actions";

export type OdemeSatiri = {
  id: string;
  adSoyad: string;
  /** Pozisyon adı (yoksa rol etiketi). */
  gorev: string;
  /** Pozitif = işletmenin personele borcu. */
  bakiyeKurus: number;
  /** Tanımlı aylık sabit maaş; yoksa null (yalnız yönetici görür, diğer rollerde öneri çıkmaz). */
  maasKurus: number | null;
  /** Görüntülenen ayda bu personele verilmiş avans toplamı (maaş önerisinden düşülür). */
  buAykiAvansKurus: number;
};

type YontemKodu = keyof typeof PERSONEL_ODEME_YONTEMLERI;
type Mod = "tekil" | "toplu";

const SECILI = "!border-primary !bg-primary !text-primary-foreground hover:!bg-primary/90";

/** Maaş önerisi: sabit maaş eksi bu ay verilen avans (avans ikinci kez ödenmesin). */
const maasOnerisi = (s: OdemeSatiri) => Math.max(0, (s.maasKurus ?? 0) - s.buAykiAvansKurus);

/**
 * "Ödeme Ekle" penceresi (klinik düzeni). Hesap sekmesinde personel seçilir (Tekil) veya birden çok personele maaş ödenir (Toplu);
 * personel kartında `sabitPersonelId` verilir ve yalnız o kişi için Tekil çalışır.
 * Kategoriler: Maaş, Diğer Ödeme, Avans, Prim, Yol, Yemek, Fazla Mesai, Kesinti. Yalnız ödeme ve avansta para kasa/bankadan çıkar → ödeme tipi (+ banka hesabı) sorulur.
 */
export function OdemeEkleDiyalog({ satirlar, hesaplar, bugun, sabitPersonelId }: { satirlar: OdemeSatiri[]; hesaplar: HesapSecenegi[]; bugun: string; sabitPersonelId?: string }) {
  const [acik, setAcik] = useState(false);
  const [mod, setMod] = useState<Mod>("tekil");
  const [kategori, setKategori] = useState<OdemeKategori>("maas");
  const [personelId, setPersonelId] = useState(sabitPersonelId ?? "");
  const [tutar, setTutar] = useState("");
  const [tarih, setTarih] = useState(bugun);
  const [aciklama, setAciklama] = useState("Maaş");
  const [yontem, setYontem] = useState<YontemKodu>("havale");
  const [hesapId, setHesapId] = useState("");
  const [secilen, setSecilen] = useState<Set<string>>(new Set());
  const [ilkAnahtar] = useState(() => crypto.randomUUID());

  const [sonuc, formAction, bekliyor] = useActionState(
    (onceki: EylemSonucu | null, formData: FormData) => (mod === "toplu" ? personelTopluOdemeEkle(onceki, formData) : personelHareketEkle(onceki, formData)),
    null
  );
  const [gorulen, setGorulen] = useState(sonuc);

  const etkinKategori: OdemeKategori = mod === "toplu" ? "maas" : kategori;
  const tur = ODEME_KATEGORI_TUR[etkinKategori];
  const yontemGerekli = ODEME_YONTEMLI_TURLER.includes(tur);
  const secilenSatir = satirlar.find((s) => s.id === personelId) ?? null;

  function oneriUygula(k: OdemeKategori, satir: OdemeSatiri | null) {
    if (k === "maas") {
      setTutar(satir ? kurusGirdiYazi(maasOnerisi(satir)) : "");
      setAciklama("Maaş");
    } else if (k === "odeme") {
      setTutar(satir ? kurusGirdiYazi(Math.max(0, satir.bakiyeKurus)) : "");
      setAciklama("");
    } else {
      setTutar("");
      setAciklama("");
    }
  }

  function sifirla() {
    setMod("tekil");
    setKategori("maas");
    const ilk = sabitPersonelId ? (satirlar.find((s) => s.id === sabitPersonelId) ?? null) : null;
    setPersonelId(sabitPersonelId ?? "");
    oneriUygula("maas", ilk);
    setTarih(bugun);
    setYontem("havale");
    setHesapId("");
    setSecilen(new Set());
  }

  function ac() {
    sifirla();
    setAcik(true);
  }

  if (sonuc !== gorulen) {
    setGorulen(sonuc);
    if (sonuc?.success) {
      setAcik(false);
      sifirla();
    }
  }

  const topluKalemler = satirlar.filter((s) => secilen.has(s.id)).map((s) => ({ kullanici_id: s.id, tutar_kurus: maasOnerisi(s) })).filter((k) => k.tutar_kurus > 0);
  const topluToplam = topluKalemler.reduce((t, k) => t + k.tutar_kurus, 0);
  const gonderilebilir = mod === "toplu" ? topluKalemler.length > 0 : Boolean(personelId) && tutar.trim() !== "";
  const on = "pe";

  return (
    <>
      <Button type="button" onClick={ac}>
        <Plus aria-hidden /> Ödeme Ekle
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ödeme Ekle</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="anahtar" value={sonuc?.anahtar ?? ilkAnahtar} suppressHydrationWarning />
            <input type="hidden" name="tur" value={tur} />
            {yontemGerekli && <input type="hidden" name="yontem" value={yontem} />}
            {mod === "tekil" ? <input type="hidden" name="kullanici_id" value={personelId} /> : <input type="hidden" name="kalemler" value={JSON.stringify(topluKalemler)} />}

            {!sabitPersonelId && (
              <div className="flex flex-col gap-1.5">
                <Label>Mod</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={bekliyor} className={cn(mod === "tekil" && SECILI)} onClick={() => setMod("tekil")}>
                    Tekil
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={bekliyor}
                    className={cn(mod === "toplu" && SECILI)}
                    onClick={() => {
                      setMod("toplu");
                      setKategori("maas");
                      setAciklama("Maaş");
                    }}
                  >
                    Toplu Ödeme (Maaş)
                  </Button>
                </div>
              </div>
            )}

            {mod === "tekil" && (
              <>
                {!sabitPersonelId && (
                  <Alan etiket="Personel" htmlFor={`${on}_personel`}>
                    <SecimKutusu
                      id={`${on}_personel`}
                      value={personelId}
                      disabled={bekliyor}
                      onChange={(e) => {
                        setPersonelId(e.target.value);
                        oneriUygula(kategori, satirlar.find((s) => s.id === e.target.value) ?? null);
                      }}
                    >
                      <option value="">Personel seçin</option>
                      {satirlar.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.adSoyad} · {s.gorev}
                        </option>
                      ))}
                    </SecimKutusu>
                  </Alan>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label>Kategori</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(ODEME_KATEGORI_ETIKET) as OdemeKategori[]).map((k) => (
                      <Button
                        key={k}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={bekliyor}
                        className={cn(kategori === k && SECILI)}
                        onClick={() => {
                          setKategori(k);
                          oneriUygula(k, secilenSatir);
                        }}
                      >
                        {ODEME_KATEGORI_ETIKET[k]}
                      </Button>
                    ))}
                  </div>
                </div>

                <Alan
                  etiket="Tutar (₺)"
                  htmlFor={`${on}_tutar`}
                  ipucu={
                    kategori === "maas" && secilenSatir
                      ? `${secilenSatir.maasKurus == null ? "Bu personelin sabit maaşı tanımlı değil" : secilenSatir.buAykiAvansKurus > 0 ? `Sabit maaş (${kurusTLyazi(secilenSatir.maasKurus)}) − bu ay verilen avans (${kurusTLyazi(secilenSatir.buAykiAvansKurus)}) önerisi` : "Sabit maaş önerisi"} — istersen değiştir.`
                      : kategori === "odeme" && secilenSatir
                        ? "Güncel bakiye önerisi — istersen değiştir."
                        : kategori === "kesinti"
                          ? "Kesinti bakiyeden düşer; kasa/bankadan para çıkmaz."
                          : undefined
                  }
                >
                  <Input id={`${on}_tutar`} name="tutar" inputMode="decimal" required autoComplete="off" placeholder="0,00" disabled={bekliyor || !personelId} value={tutar} onChange={(e) => setTutar(e.target.value)} />
                </Alan>
              </>
            )}

            {mod === "toplu" && (
              <div className="flex flex-col gap-1.5">
                <Label>Personel Seç {secilen.size > 0 && `(${secilen.size} seçili)`}</Label>
                <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto rounded-xl border border-border p-2">
                  {satirlar.map((s) => {
                    const oneri = maasOnerisi(s);
                    const secilebilir = s.maasKurus != null && oneri > 0;
                    const secili = secilen.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={bekliyor || !secilebilir}
                        onClick={() =>
                          setSecilen((m) => {
                            const yeni = new Set(m);
                            if (yeni.has(s.id)) yeni.delete(s.id);
                            else yeni.add(s.id);
                            return yeni;
                          })
                        }
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-50",
                          secili ? "border-primary bg-primary/10" : "border-border hover:bg-surface-2"
                        )}
                      >
                        <span className="flex flex-col">
                          <span className="font-medium">{s.adSoyad}</span>
                          <span className="text-xs text-muted-foreground">
                            {s.gorev}
                            {!secilebilir && (s.maasKurus == null ? " · Sabit maaş tanımlı değil" : " · Ödenecek tutar yok")}
                          </span>
                        </span>
                        {secilebilir && <span className="font-medium tabular-nums">{kurusTLyazi(oneri)}</span>}
                      </button>
                    );
                  })}
                </div>
                {topluKalemler.length > 0 && (
                  <p className="text-sm font-medium">
                    Toplam: {kurusTLyazi(topluToplam)} ({topluKalemler.length} personel)
                  </p>
                )}
              </div>
            )}

            <Alan etiket="Tarih" htmlFor={`${on}_tarih`}>
              <Input id={`${on}_tarih`} name="tarih" type="date" max={bugun} required disabled={bekliyor} value={tarih} onChange={(e) => setTarih(e.target.value)} />
            </Alan>

            {yontemGerekli && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label>Ödeme Tipi</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(PERSONEL_ODEME_YONTEMLERI) as YontemKodu[]).map((k) => (
                      <Button key={k} type="button" variant="outline" size="sm" disabled={bekliyor} className={cn(yontem === k && SECILI)} onClick={() => setYontem(k)}>
                        {PERSONEL_ODEME_YONTEMLERI[k]}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Nakit kasadan, havale bankadan çıkar (Kasa/Banka mutabakatı).</p>
                </div>
                {yontem === "havale" && (
                  <Alan etiket="Banka Hesabı" htmlFor={`${on}_hesap`} ipucu={hesaplar.length === 0 ? "Kayıtlı banka hesabı yok — Ayarlar > Şirket Bilgileri'nden hesap ekleyin." : "İsteğe bağlı; seçilmezse 'hesap atanmamış' olarak izlenir."}>
                    <SecimKutusu id={`${on}_hesap`} name="banka_hesap_id" disabled={bekliyor || hesaplar.length === 0} value={hesapId} onChange={(e) => setHesapId(e.target.value)}>
                      <option value="">Hesap seçilmedi</option>
                      {hesaplar.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.ad}
                        </option>
                      ))}
                    </SecimKutusu>
                  </Alan>
                )}
              </>
            )}

            <Alan etiket="Açıklama (isteğe bağlı)" htmlFor={`${on}_aciklama`}>
              <Input id={`${on}_aciklama`} name="aciklama" maxLength={300} disabled={bekliyor} value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
            </Alan>

            {sonuc && !sonuc.success && (
              <p role="alert" className="rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
                {sonuc.message}
              </p>
            )}

            <Button type="submit" disabled={bekliyor || !gonderilebilir} className="w-fit">
              {bekliyor ? "Kaydediliyor..." : mod === "toplu" ? `Öde (${topluKalemler.length} personel · ${kurusTLyazi(topluToplam)})` : "Kaydet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

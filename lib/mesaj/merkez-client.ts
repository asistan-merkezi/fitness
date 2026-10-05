import "server-only";
import type { MesajKanal } from "@/types/mesajlasma";

/**
 * ============================================================================
 * MERKEZ SÖZLEŞMESİ (mesaj.asistanmerkezi tarafında UYGULANMASI ZORUNLU) — klinikle aynı ilkeler
 * ============================================================================
 * Bu dosya yalnız İSTEMCİ (fitness) tarafıdır; merkez servisi bu repoda YOK.
 *  1. IDEMPOTENCY: POST /api/gonder `Idempotency-Key` başlığını okumalı. Aynı anahtarla tekrar gelen istekte kredi yeniden
 *     DÜŞÜLMEMELİ, ilk çağrının sonucu aynen dönmeli (ağ hatası sonrası güvenli yeniden deneme bunun garantisine dayanır).
 *  2. VERSİYON: her yanıt (başarılı/başarısız) güncel `kalanBakiye` ve monoton artan `bakiyeVersiyonu` içermeli. Yerel ayna,
 *     `mesaj_kredi_senkronla` ile yalnız daha yeni versiyonu yazar.
 *  3. HATA KODLARI: `hata` alanı lib/mesaj/hata-kodlari.ts'teki kodlardan biri olmalı (kredi_yetersiz, izin_yok, gecersiz_alici,
 *     saglayici_hatasi, rate_limit, zaman_asimi). Yeni kalıcı hata türü HEM merkezde HEM burada eklenmeli.
 *  4. ÖDEME DOĞRULAMASI (kredi yükleme): /api/kredi-yukle yalnız API anahtarıyla korunması YETERLİ DEĞİL; merkez `odemeReferansi`'nı
 *     gerçek bir ödeme kaydına karşı doğrulamak ZORUNDA, yoksa anahtarı olan biri sınırsız "bedava" kredi tanımlayabilir.
 *  5. KREDİ SATIŞI: fiyatı HER ZAMAN merkez `paketId`'den çözer (istemciden fiyat/adet gelmez). /api/odeme-oturumu `donusUrl`'yi
 *     işletmenin kayıtlı alan adlarına karşı doğrulamalı (whitelist); aksi halde open redirect olur. Kredi merkezin defterine
 *     ödeme DOĞRULANDIKTAN sonra eklenir; fitness yalnız bakiyeyi senkronlar. Uçlar:
 *       POST /api/kredi-paketleri  { tenantId, kanal }                     -> { paketler: [{ paketId, adet, fiyatKurus, paraBirimi }] }
 *       POST /api/odeme-oturumu    { tenantId, kanal, paketId, donusUrl }  -> { odemeUrl }
 * ============================================================================
 * MESAJ_MERKEZ_BASE_URL / MESAJ_MERKEZ_API_KEY tanımlı değilse `merkezYapilandirildiMi()` false döner ve kuyruk satırları
 * "beklemede" kalır (deneme sayacı artmaz, mesaj kaybolmaz); merkez bağlandığında sıradakiler gönderilir.
 */

type MerkezYaniti<T> = { ulasildi: true; veri: T } | { ulasildi: false; hata: string };

export type MerkezGonderGirdi = {
  isletmeId: string;
  kanal: MesajKanal;
  aliciAdres: string;
  metin: string;
  idempotencyKey: string;
  testMi: boolean;
  tetikleyiciKodu: string;
};

export type MerkezGonderSonucu =
  | { ulasildi: true; basarili: true; saglayiciMesajId?: string; kalanBakiye: number; bakiyeVersiyonu: number }
  | { ulasildi: true; basarili: false; hata: string; kalanBakiye: number; bakiyeVersiyonu: number }
  | { ulasildi: false; hata: string };

export type MerkezBakiyeSonucu = { ulasildi: true; bakiye: number; bakiyeVersiyonu: number } | { ulasildi: false; hata: string };

export type MerkezKrediPaketi = { paketId: string; adet: number; fiyatKurus: number; paraBirimi: string };
export type MerkezKrediPaketleriSonucu = { ulasildi: true; paketler: MerkezKrediPaketi[] } | { ulasildi: false; hata: string };
export type MerkezOdemeOturumuSonucu = { ulasildi: true; odemeUrl: string } | { ulasildi: false; hata: string };

function tabanUrl(): string | null {
  const url = process.env.MESAJ_MERKEZ_BASE_URL;
  return url && url.trim().length > 0 ? url.replace(/\/$/, "") : null;
}

export function merkezYapilandirildiMi(): boolean {
  return tabanUrl() !== null && !!process.env.MESAJ_MERKEZ_API_KEY;
}

async function merkezeIstekAt<T>(yol: string, govde: unknown, ekBaslik?: Record<string, string>): Promise<MerkezYaniti<T>> {
  const taban = tabanUrl();
  const anahtar = process.env.MESAJ_MERKEZ_API_KEY;
  if (!taban || !anahtar) return { ulasildi: false, hata: "merkez_yapilandirilmadi" };

  try {
    const yanit = await fetch(`${taban}${yol}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${anahtar}`, ...ekBaslik },
      body: JSON.stringify(govde),
      // Merkez geç yanıtlarsa kuyruk işleyici sonsuza kadar bloklanmasın: geçici hata sayılıp normal geri çekilmeye girer.
      signal: AbortSignal.timeout(15_000),
    });
    if (!yanit.ok) return { ulasildi: false, hata: `merkez_http_${yanit.status}` };
    return { ulasildi: true, veri: (await yanit.json()) as T };
  } catch (e) {
    return { ulasildi: false, hata: e instanceof Error ? e.message : "merkez_baglanti_hatasi" };
  }
}

export async function merkezeGonder(girdi: MerkezGonderGirdi): Promise<MerkezGonderSonucu> {
  const sonuc = await merkezeIstekAt<{ basarili: boolean; saglayiciMesajId?: string; hata?: string; kalanBakiye: number; bakiyeVersiyonu: number }>(
    "/api/gonder",
    { tenantId: girdi.isletmeId, kanal: girdi.kanal, aliciAdres: girdi.aliciAdres, metin: girdi.metin, testMi: girdi.testMi, tetikleyiciKodu: girdi.tetikleyiciKodu },
    { "Idempotency-Key": girdi.idempotencyKey }
  );
  if (!sonuc.ulasildi) return { ulasildi: false, hata: sonuc.hata };

  if (sonuc.veri.basarili) {
    return { ulasildi: true, basarili: true, saglayiciMesajId: sonuc.veri.saglayiciMesajId, kalanBakiye: sonuc.veri.kalanBakiye, bakiyeVersiyonu: sonuc.veri.bakiyeVersiyonu };
  }
  return { ulasildi: true, basarili: false, hata: sonuc.veri.hata ?? "bilinmeyen_hata", kalanBakiye: sonuc.veri.kalanBakiye, bakiyeVersiyonu: sonuc.veri.bakiyeVersiyonu };
}

/** Merkezin güncel "Kredi Adet ve Fiyat Çizelgesi"; adete göre artan sıralı döner. */
export async function merkezdenKrediPaketleriCek(isletmeId: string, kanal: MesajKanal): Promise<MerkezKrediPaketleriSonucu> {
  const sonuc = await merkezeIstekAt<{ paketler: MerkezKrediPaketi[] }>("/api/kredi-paketleri", { tenantId: isletmeId, kanal });
  if (!sonuc.ulasildi) return { ulasildi: false, hata: sonuc.hata };
  const paketler = (sonuc.veri.paketler ?? []).filter((p) => p && typeof p.paketId === "string" && Number.isInteger(p.adet) && p.adet > 0 && Number.isFinite(p.fiyatKurus) && p.fiyatKurus >= 0);
  return { ulasildi: true, paketler: paketler.sort((a, b) => a.adet - b.adet) };
}

/** Seçilen paket için merkezin ödeme sayfası adresini ister. Fiyat/adet göndermez; yalnız paketId. */
export async function merkezdenOdemeOturumuOlustur(girdi: { isletmeId: string; kanal: MesajKanal; paketId: string; donusUrl: string }): Promise<MerkezOdemeOturumuSonucu> {
  const sonuc = await merkezeIstekAt<{ odemeUrl?: string }>("/api/odeme-oturumu", { tenantId: girdi.isletmeId, kanal: girdi.kanal, paketId: girdi.paketId, donusUrl: girdi.donusUrl });
  if (!sonuc.ulasildi) return { ulasildi: false, hata: sonuc.hata };
  if (!sonuc.veri.odemeUrl) return { ulasildi: false, hata: "odeme_url_yok" };
  return { ulasildi: true, odemeUrl: sonuc.veri.odemeUrl };
}

export async function merkezdenBakiyeCek(isletmeId: string, kanal: MesajKanal): Promise<MerkezBakiyeSonucu> {
  const sonuc = await merkezeIstekAt<{ bakiye: number; bakiyeVersiyonu: number }>("/api/bakiye", { tenantId: isletmeId, kanal });
  if (!sonuc.ulasildi) return { ulasildi: false, hata: sonuc.hata };
  return { ulasildi: true, bakiye: sonuc.veri.bakiye, bakiyeVersiyonu: sonuc.veri.bakiyeVersiyonu };
}

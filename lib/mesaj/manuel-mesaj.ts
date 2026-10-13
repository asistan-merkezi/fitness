import type { MesajKanal } from "@/types/mesajlasma";
import { sablonDoldur } from "./degisken-dogrula";
import { TETIKLEYICILER, type TetikleyiciTanimi } from "./tetikleyiciler";

/** Elle gönderimde bağlam gerektirmeyen (yanlış değerle gidemeyecek) değişkenler. */
const MANUEL_DEGISKENLER: ReadonlySet<string> = new Set(["musteri_adi", "isletme_adi"]);

/**
 * Müşteri kartından elle gönderilebilen şablonlar: personel bölümü hariç, yalnız müşteri adı ve işletme adı değişkenlerini kullananlar.
 * Tutar, ders tarihi, paket adı gibi bağlam isteyenler elle gönderilince yanlış değerle gidebilir; onlar ilgili olayda otomatik gider.
 */
export function manuelGonderilebilirTetikleyiciler(): TetikleyiciTanimi[] {
  return TETIKLEYICILER.filter((t) => t.bolum !== "personel" && t.gecerliDegiskenler.every((d) => MANUEL_DEGISKENLER.has(d)));
}

export function manuelMetniDoldur(sablon: string, degerler: { musteri_adi: string; isletme_adi: string }): string {
  return sablonDoldur(sablon, degerler);
}

/** Müşterinin iletişim bilgisine göre hangi kanalların kullanılabildiği. WhatsApp için ayrı müşteri izni alanı yoktur: telefon yeterli. */
export function kanalUygunlugu(adres: { telefon: string | null; eposta: string | null }): Record<MesajKanal, boolean> {
  const tel = Boolean(adres.telefon?.trim());
  return { sms: tel, whatsapp: tel, mail: Boolean(adres.eposta?.trim()) };
}

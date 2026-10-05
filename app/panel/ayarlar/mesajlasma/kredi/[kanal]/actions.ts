"use server";

import { redirect } from "next/navigation";
import { type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { guvenliOdemeUrl } from "@/lib/mesaj/kredi-yardimcilari";
import { merkezdenKrediPaketleriCek, merkezdenOdemeOturumuOlustur, merkezYapilandirildiMi } from "@/lib/mesaj/merkez-client";
import { siteKoku } from "@/lib/qr/isletme-bilgisi";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { KANAL_SIRASI, type MesajKanal } from "@/types/mesajlasma";

type Onceki = EylemSonucu | null;

/**
 * Kredi satın alma: istemci YALNIZ paket_id gönderir. Paket, merkezin güncel listesine karşı doğrulanır; fiyatı/adedi merkez çözer.
 * Kredi fitness tarafında YAZILMAZ — ödeme bitince merkez kendi defterine ekler, bakiye dönüşte senkronlanır.
 */
export async function krediOdemeBaslat(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(YONETICI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const kanal = String(formData.get("kanal") ?? "") as MesajKanal;
  const paketId = String(formData.get("paket_id") ?? "");
  if (!KANAL_SIRASI.includes(kanal)) return hata("Geçersiz kanal.");
  if (!paketId) return hata("Lütfen bir paket seçin.");
  if (!merkezYapilandirildiMi()) return hata("Mesaj altyapısına (Asistan Merkezi) ulaşılamadı.");

  const isletmeId = oturum.kullanici.isletme_id;
  const liste = await merkezdenKrediPaketleriCek(isletmeId, kanal);
  if (!liste.ulasildi) return hata("Kredi paketleri alınamadı; Asistan Merkezi'ne ulaşılamadı.");
  if (!liste.paketler.some((p) => p.paketId === paketId)) return hata("Seçilen paket artık geçerli değil; sayfayı yenileyip tekrar deneyin.");

  const donusUrl = `${await siteKoku()}/panel/ayarlar/mesajlasma/kredi/${kanal}?sekme=takip&odeme=donuldu`;
  const oturumSonucu = await merkezdenOdemeOturumuOlustur({ isletmeId, kanal, paketId, donusUrl });
  if (!oturumSonucu.ulasildi) return hata("Ödeme sayfası açılamadı; Asistan Merkezi'ne ulaşılamadı.");

  const odemeUrl = guvenliOdemeUrl(oturumSonucu.odemeUrl);
  if (!odemeUrl) {
    console.error("[krediOdemeBaslat] güvenli olmayan ödeme adresi reddedildi");
    return hata("Ödeme sayfası adresi geçersiz; işlem durduruldu.");
  }
  redirect(odemeUrl);
}

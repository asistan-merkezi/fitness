import type { EtkinMesajKurali } from "@/types/mesajlasma";
import { TETIKLEYICILER } from "./tetikleyiciler";

/** Veritabanından (mesaj_kurali) gelen ham satırın işimize yarayan alanları. */
export type MesajKuraliDbSatiri = {
  id: string;
  tetikleyici_kodu: string;
  aktif: boolean;
  sms_aktif: boolean;
  whatsapp_aktif: boolean;
  mail_aktif: boolean;
  mesaj_metni: string;
  zamanlama_offset_dakika: number | null;
};

/**
 * Kod kataloğunu, işletmenin veritabanında tuttuğu ayarlarla birleştirir. Bir tetikleyici için satır YOKSA pasif kabul edilir
 * ("kayıt yoksa pasif" kuralı yalnız burada uygulanır; ekran kodu tekrarlamaz).
 */
export function etkinKurallariOlustur(dbSatirlari: MesajKuraliDbSatiri[]): EtkinMesajKurali[] {
  const harita = new Map(dbSatirlari.map((s) => [s.tetikleyici_kodu, s] as const));
  return TETIKLEYICILER.map((tanim) => {
    const db = harita.get(tanim.kod);
    return {
      id: db?.id ?? null,
      bolum: tanim.bolum,
      tetikleyici_kodu: tanim.kod,
      tetikleyici_adi: tanim.ad,
      mesaj_metni: db?.mesaj_metni ?? "",
      sms_aktif: db?.sms_aktif ?? false,
      whatsapp_aktif: db?.whatsapp_aktif ?? false,
      mail_aktif: db?.mail_aktif ?? false,
      aktif: db?.aktif ?? false,
      zamanlama_offset_dakika: db?.zamanlama_offset_dakika ?? tanim.varsayilanOffsetDakika ?? null,
      bagli: tanim.bagli,
    };
  });
}

import type { MesajKuyrukDurum } from "@/types/mesajlasma";

/**
 * Merkezden dönen hata kodlarının kalıcı/geçici sınıflandırması — tek kaynak.
 * kalici=true  → retry YOK, hemen verilen duruma geçer.
 * kalici=false → geçici; geri çekilmeli yeniden deneme devam eder, son denemeden sonra durum='hata'.
 * Bilinmeyen kod GEÇİCİ sayılır: kalıcı bir hatayı boşuna 3 kez denemek, geçici bir hatayı hiç denememekten daha az zararlıdır.
 */
const HATA_KODU_ESLEMESI: Record<string, { kalici: boolean; kaliciDurum?: MesajKuyrukDurum }> = {
  kredi_yetersiz: { kalici: true, kaliciDurum: "iptal" },
  izin_yok: { kalici: true, kaliciDurum: "iptal" },
  gecersiz_alici: { kalici: true, kaliciDurum: "hata" },
  saglayici_hatasi: { kalici: false },
  rate_limit: { kalici: false },
  zaman_asimi: { kalici: false },
};

export function hataDegerlendir(kod: string | undefined): { kalici: boolean; kaliciDurum: MesajKuyrukDurum } {
  const eslesme = kod ? HATA_KODU_ESLEMESI[kod] : undefined;
  if (!eslesme) return { kalici: false, kaliciDurum: "hata" };
  return { kalici: eslesme.kalici, kaliciDurum: eslesme.kaliciDurum ?? "hata" };
}

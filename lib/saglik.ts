/** vercel.json'daki cron işleri: sağlık kontrolü her birinin son başarılı çalışmasını denetler. Yeni cron eklenince buraya da eklenir. */
export const CRON_ISLERI = ["audit-log-bolum-olustur", "mesaj-gunluk"] as const;
export type CronIsi = (typeof CRON_ISLERI)[number];

/** Günlük işler: bir çalışma kaçarsa (26 saat) alarm. */
export const CRON_AZAMI_SESSIZLIK_SAAT = 26;

export type CronKaydi = { ad: string; son_basarili: string | null; son_hata: string | null };
export type SaglikKontrolu = { ad: string; ok: boolean; ayrinti: string };

/**
 * Sağlık kararı (saf): veritabanı erişilebilir olmalı ve her cron işi son 26 saatte en az bir kez BAŞARIYLA bitmiş olmalı.
 * Hiç kaydı olmayan cron da başarısızdır: en sık arıza CRON_SECRET'in Vercel'de tanımlanmaması (cron her gün 401 alır).
 */
export function saglikDegerlendir(girdi: { simdiMs: number; veritabani: boolean; kayitlar: CronKaydi[] }): { ok: boolean; kontroller: SaglikKontrolu[] } {
  const kontroller: SaglikKontrolu[] = [{ ad: "veritabani", ok: girdi.veritabani, ayrinti: girdi.veritabani ? "erişilebilir" : "erişilemedi" }];
  for (const is of CRON_ISLERI) {
    const k = girdi.kayitlar.find((x) => x.ad === is);
    if (!girdi.veritabani) {
      kontroller.push({ ad: `cron:${is}`, ok: false, ayrinti: "veritabanı erişilemediği için okunamadı" });
    } else if (!k?.son_basarili) {
      kontroller.push({ ad: `cron:${is}`, ok: false, ayrinti: k?.son_hata ? `hiç başarılı olmadı (son hata: ${k.son_hata})` : "hiç çalışmadı" });
    } else {
      const saat = (girdi.simdiMs - Date.parse(k.son_basarili)) / 3_600_000;
      const ok = saat <= CRON_AZAMI_SESSIZLIK_SAAT;
      kontroller.push({ ad: `cron:${is}`, ok, ayrinti: `son başarılı ${saat.toFixed(1)} saat önce${!ok && k.son_hata ? ` (son hata: ${k.son_hata})` : ""}` });
    }
  }
  return { ok: kontroller.every((k) => k.ok), kontroller };
}

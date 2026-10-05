import { NextResponse } from "next/server";
import { cronKayitli } from "@/lib/cron-kayit";
import { cronYetkiliMi } from "@/lib/cron-yetki";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { ayDonemi } from "@/lib/donem";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Aylık audit_log bölümleri: her gün 02:00 UTC (= 05:00 İstanbul) çalışır, gelecek iki ayın bölümünün var olduğundan emin olur.
 * Yetki: `cronYetkiliMi` (CRON_SECRET; tanımlı değilse rota kapalı).
 * İş idempotenttir (var olan bölüm atlanır); günlük çalışması ayın 1'ini kaçırma riskini ortadan kaldırır, gecikmeli/çift tetiklenme zararsızdır.
 */
export async function GET(istek: Request) {
  if (!cronYetkiliMi(istek)) {
    return new NextResponse("Yetkisiz", { status: 401 });
  }

  const [yil, ay] = bugunIstanbulTarihi().split("-").map(Number);
  const birinci = ayDonemi(yil, ay).sonrakiParam; // "YYYY-MM"
  const [y1, m1] = birinci.split("-").map(Number);
  const ikinci = ayDonemi(y1, m1).sonrakiParam;

  const admin = createAdminClient();
  return cronKayitli<NextResponse>(admin, "audit-log-bolum-olustur", async () => {
    const olusanlar: string[] = [];
    for (const param of [birinci, ikinci]) {
      const { data, error } = await admin.rpc("audit_log_bolum_olustur", { p_ay: `${param}-01` });
      if (error) {
        console.error("[cron/audit-log-bolum-olustur]", error.code);
        return { basarili: false, hata: `bolum_olusturulamadi:${param}`, sonuc: NextResponse.json({ ok: false, hata: "bolum_olusturulamadi", ay: param }, { status: 500 }) };
      }
      olusanlar.push(String(data));
    }

    // Günlük bakım: KVKK saklama süresi dolan (30 gün) onaylanmamış/reddedilmiş QR ön kayıtlarını siler. Bakım hatası bölüm
    // oluşturmayı başarısız saymaz (migration henüz uygulanmamış olabilir); yalnız loglanır.
    const { data: silinen, error: temizlikHatasi } = await admin.rpc("on_kayit_temizle", { p_gun: 30 });
    if (temizlikHatasi) console.error("[cron/audit-log-bolum-olustur] on_kayit_temizle", temizlikHatasi.code);

    // Saklama süresi (KVKK): süre kararı avukata ait; AUDIT_LOG_SAKLAMA_AY tanımlı değilse HİÇBİR denetim kaydı silinmez.
    const saklamaAy = Number(process.env.AUDIT_LOG_SAKLAMA_AY);
    let kaldirilanBolumler: string[] | null = null;
    if (Number.isInteger(saklamaAy) && saklamaAy >= 12) {
      const { data: kaldirilan, error: saklamaHatasi } = await admin.rpc("audit_log_eski_bolumleri_kaldir", { p_saklama_ay: saklamaAy });
      if (saklamaHatasi) console.error("[cron/audit-log-bolum-olustur] audit_log_eski_bolumleri_kaldir", saklamaHatasi.code);
      else kaldirilanBolumler = (kaldirilan ?? []) as string[];
    }

    return { basarili: true, sonuc: NextResponse.json({ ok: true, bolumler: olusanlar, silinenOnKayit: temizlikHatasi ? null : Number(silinen ?? 0), kaldirilanBolumler }) };
  });
}

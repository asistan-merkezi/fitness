import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { ayDonemi } from "@/lib/donem";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Aylık audit_log bölümleri: her gün 02:00 UTC (= 05:00 İstanbul) çalışır, gelecek iki ayın bölümünün var olduğundan emin olur.
 * Vercel Cron `Authorization: Bearer $CRON_SECRET` gönderir; secret yoksa rota KAPALIDIR.
 * İş idempotenttir (var olan bölüm atlanır); günlük çalışması ayın 1'ini kaçırma riskini ortadan kaldırır, gecikmeli/çift tetiklenme zararsızdır.
 */
function yetkiliMi(istek: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const gelen = Buffer.from(istek.headers.get("authorization") ?? "");
  const beklenen = Buffer.from(`Bearer ${secret}`);
  return gelen.length === beklenen.length && timingSafeEqual(gelen, beklenen);
}

export async function GET(istek: Request) {
  if (!yetkiliMi(istek)) {
    return new NextResponse("Yetkisiz", { status: 401 });
  }

  const [yil, ay] = bugunIstanbulTarihi().split("-").map(Number);
  const birinci = ayDonemi(yil, ay).sonrakiParam; // "YYYY-MM"
  const [y1, m1] = birinci.split("-").map(Number);
  const ikinci = ayDonemi(y1, m1).sonrakiParam;

  const admin = createAdminClient();
  const olusanlar: string[] = [];
  for (const param of [birinci, ikinci]) {
    const { data, error } = await admin.rpc("audit_log_bolum_olustur", { p_ay: `${param}-01` });
    if (error) {
      console.error("[cron/audit-log-bolum-olustur]", error.code);
      return NextResponse.json({ ok: false, hata: "bolum_olusturulamadi", ay: param }, { status: 500 });
    }
    olusanlar.push(String(data));
  }
  return NextResponse.json({ ok: true, bolumler: olusanlar });
}

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { bekleyenleriIsle } from "@/lib/mesaj/kuyruk-isle";
import { zamanlanmisTara } from "@/lib/mesaj/zamanlanmis-tara";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Günlük mesaj işi (05:00 UTC = 08:00 İstanbul): 1) o günün zamanlanmış mesajlarını (üyelik bitiyor, doğum günü, özledik, randevu
 * hatırlatma) kuyruğa yazar, 2) vadesi gelmiş bekleyen satırları (önceki denemelerden kalanlar dahil) merkeze gönderir.
 * Vercel Cron `Authorization: Bearer $CRON_SECRET` gönderir; secret yoksa rota KAPALIDIR. İş idempotenttir: olay anahtarları
 * sayesinde iki kez çalışsa da kuyruğa tek satır düşer.
 */
function yetkiliMi(istek: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const gelen = Buffer.from(istek.headers.get("authorization") ?? "");
  const beklenen = Buffer.from(`Bearer ${secret}`);
  return gelen.length === beklenen.length && timingSafeEqual(gelen, beklenen);
}

export async function GET(istek: Request) {
  if (!yetkiliMi(istek)) return new NextResponse("Yetkisiz", { status: 401 });

  const admin = createAdminClient();
  const taranan = await zamanlanmisTara(admin, bugunIstanbulTarihi());
  const gonderim = await bekleyenleriIsle(admin);
  return NextResponse.json({ ok: true, taranan, gonderim });
}

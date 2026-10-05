import { NextResponse } from "next/server";
import { cronKayitli } from "@/lib/cron-kayit";
import { cronYetkiliMi } from "@/lib/cron-yetki";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { bekleyenleriIsle } from "@/lib/mesaj/kuyruk-isle";
import { zamanlanmisTara } from "@/lib/mesaj/zamanlanmis-tara";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Günlük mesaj işi (05:00 UTC = 08:00 İstanbul): 1) o günün zamanlanmış mesajlarını (üyelik bitiyor, doğum günü, özledik, randevu
 * hatırlatma) kuyruğa yazar, 2) vadesi gelmiş bekleyen satırları (önceki denemelerden kalanlar dahil) merkeze gönderir.
 * Yetki: `cronYetkiliMi` (CRON_SECRET; tanımlı değilse rota kapalı). İş idempotenttir: olay anahtarları
 * sayesinde iki kez çalışsa da kuyruğa tek satır düşer.
 */
export const maxDuration = 300;

export async function GET(istek: Request) {
  if (!cronYetkiliMi(istek)) return new NextResponse("Yetkisiz", { status: 401 });

  const baslangic = Date.now();
  const admin = createAdminClient();
  return cronKayitli<NextResponse>(admin, "mesaj-gunluk", async () => {
    const taranan = await zamanlanmisTara(admin, bugunIstanbulTarihi());
    // Kuyruğu kalan süre içinde boşalt (maxDuration'dan 30 sn pay bırakılır); bitmeyen satırlar yarın sürer.
    const gonderim = await bekleyenleriIsle(admin, Math.max(30_000, (maxDuration - 30) * 1000 - (Date.now() - baslangic)));
    return { basarili: true, sonuc: NextResponse.json({ ok: true, taranan, gonderim }) };
  });
}

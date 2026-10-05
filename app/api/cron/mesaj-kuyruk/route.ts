import { NextResponse } from "next/server";
import { cronYetkiliMi } from "@/lib/cron-yetki";
import { bekleyenleriIsle } from "@/lib/mesaj/kuyruk-isle";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Yalnız kuyruğu merkeze boşaltır (zamanlanmış tarama YOK — o `mesaj-gunluk`'te, günde bir).
 * Vercel cron'u değil, Asistan Merkezi'nin zamanlayıcısı çağırır (asistanmerkezi `deploy/alt-proje-kuyruk.sh`, 5 dk'da bir):
 * Vercel Hobby günde birden sık cron'a izin vermez, merkez "pull modeli"yle tetikler. Yetki `cronYetkiliMi` (Bearer CRON_SECRET).
 * Eşzamanlı çağrılar güvenlidir: satırlar atomik sahiplenilir.
 */
export const maxDuration = 300;

export async function GET(istek: Request) {
  if (!cronYetkiliMi(istek)) return new NextResponse("Yetkisiz", { status: 401 });
  const gonderim = await bekleyenleriIsle(createAdminClient(), (maxDuration - 30) * 1000);
  return NextResponse.json({ ok: true, gonderim });
}

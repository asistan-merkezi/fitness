import { NextResponse } from "next/server";
import { cronYetkiliMi } from "@/lib/cron-yetki";
import { type CronKaydi, saglikDegerlendir } from "@/lib/saglik";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Sağlık kontrolü (dış izleme servisi için, ör. UptimeRobot 5 dk'da bir): sağlıklıysa 200, değilse 503.
 * Herkese açık yanıt yalnız `{ ok }` içerir; ayrıntı (hangi cron, kaç saat önce, hata kodu) yalnız `Authorization: Bearer $CRON_SECRET` ile.
 */
export async function GET(istek: Request) {
  let veritabani = false;
  let kayitlar: CronKaydi[] = [];
  try {
    const { data, error } = await createAdminClient().from("cron_calisma").select("ad, son_basarili, son_hata");
    veritabani = !error;
    kayitlar = (data ?? []) as CronKaydi[];
    if (error) console.error("[saglik]", error.code ?? error.message);
  } catch (e) {
    console.error("[saglik]", e instanceof Error ? e.message : e);
  }

  const sonuc = saglikDegerlendir({ simdiMs: Date.now(), veritabani, kayitlar });
  const govde = cronYetkiliMi(istek) ? sonuc : { ok: sonuc.ok };
  return NextResponse.json(govde, { status: sonuc.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

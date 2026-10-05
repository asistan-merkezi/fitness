import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron `Authorization: Bearer $CRON_SECRET` gönderir. Secret tanımlı değilse rota KAPALIDIR (her istek reddedilir).
 * Karşılaştırma sabit sürelidir (zamanlama saldırısı ile secret tahmin edilemez).
 */
export function cronYetkiliMi(istek: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const gelen = Buffer.from(istek.headers.get("authorization") ?? "");
  const beklenen = Buffer.from(`Bearer ${secret}`);
  return gelen.length === beklenen.length && timingSafeEqual(gelen, beklenen);
}

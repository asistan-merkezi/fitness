import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Herkese açık QR uçları için hız sınırı. Sayaç Postgres'te (`hiz_siniri_kullan`, yalnız service_role).
 *
 * FAIL-OPEN: migration uygulanmamışsa ya da veritabanı hatası varsa istek ENGELLENMEZ (yalnız loglanır); koruma katmanı kendisi
 * kesinti yaratmamalıdır. Bu yüzden asıl ikinci savunma "ön kayıt kuyruğa düşer, müşteri açmaz" tasarımıdır.
 *
 * Salon ağında tüm müşteriler aynı çıkış IP'sini paylaşabilir (NAT): IP limiti gevşek, asıl kaba kuvvet koruması işletme başına toplamdadır.
 */
export type HizSiniriKurali = { anahtar: string; limit: number; pencereSn: number };

const IP_BILINMIYOR = "bilinmiyor";

/** IP düz saklanmaz (KVKK); kısa bir özet yeterlidir. */
async function istemciImzasi(): Promise<string> {
  const h = await headers();
  const ham = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? IP_BILINMIYOR;
  return createHash("sha256").update(ham).digest("hex").slice(0, 16);
}

async function kuralUygula(kural: HizSiniriKurali, artir: boolean): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc("hiz_siniri_kullan", { p_anahtar: kural.anahtar, p_limit: kural.limit, p_pencere_sn: kural.pencereSn, p_artir: artir });
    if (error) {
      console.error("[hiz-siniri] çağrı başarısız:", error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error("[hiz-siniri] çağrı başarısız:", e);
    return true;
  }
}

/** Kuralların hepsini sayar; biri aşılmışsa false. Her çağrı bir hak tüketir. */
export async function hizSiniriTuket(kurallar: HizSiniriKurali[]): Promise<boolean> {
  const sonuclar = await Promise.all(kurallar.map((k) => kuralUygula(k, true)));
  return sonuclar.every(Boolean);
}

/** İşletme kimliği anahtara KOYULMAZ: saldırgan rastgele kimliklerle anahtar uzayını şişirmesin diye IP anahtarı ayrı tutulur. */
export async function ipAnahtari(onEk: string): Promise<string> {
  return `${onEk}:ip:${await istemciImzasi()}`;
}

export function isletmeAnahtari(onEk: string, isletmeId: string): string {
  return `${onEk}:isletme:${isletmeId}`;
}

export const HIZ_SINIRI_MESAJI = "Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.";

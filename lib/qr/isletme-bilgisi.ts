import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QrKodTipi } from "./qr-kod-tanimlari";

/**
 * Herkese açık sayfalar anonimdir; işletme çözümü ve "QR açık mı" kontrolü sunucuda service_role ile yapılır
 * (anonim role hiçbir tablo/fonksiyon yetkisi verilmez). Yalnız kimlik ve ad döner; başka işletme verisi sızmaz.
 */
export async function isletmeQrBilgisiGetir(kisaKod: string): Promise<{ id: string; ad: string } | null> {
  if (!/^[a-z2-9]{8}$/.test(kisaKod)) return null;
  const { data } = await createAdminClient().from("isletme").select("id, ad").eq("qr_kisa_kod", kisaKod).eq("aktif", true).maybeSingle<{ id: string; ad: string }>();
  return data ?? null;
}

/** Ayar satırı yoksa QR AÇIK sayılır (varsayılan). Sorgu hatasında kapalı sayılmaz (fail-open), yalnız loglanır. */
export async function qrKoduAktifMi(isletmeId: string, tip: QrKodTipi): Promise<boolean> {
  const { data, error } = await createAdminClient().from("qr_kod_ayar").select("aktif").eq("isletme_id", isletmeId).eq("tip", tip).maybeSingle<{ aktif: boolean }>();
  if (error) {
    console.error("[qr] qr_kod_ayar okunamadı:", error.message);
    return true;
  }
  return data?.aktif ?? true;
}

/** QR'a gömülecek mutlak adres için sitenin kökü (istek başlıklarından). */
export async function siteKoku(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protokol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protokol}://${host}`;
}

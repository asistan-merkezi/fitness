import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CronIsi } from "@/lib/saglik";

/**
 * Cron işini çalıştırır ve sonucunu `cron_calisma`ya yazar (başlangıç, bitiş, son başarılı, hata kodu). Kayıt yazılamazsa
 * iş yine de sonuçlanır (yalnız loglanır): izleme, asıl işi asla durdurmamalı.
 */
export async function cronKayitli<T>(admin: SupabaseClient, ad: CronIsi, is: () => Promise<{ basarili: boolean; sonuc: T; hata?: string }>): Promise<T> {
  const baslangic = new Date().toISOString();
  await yaz(admin, { ad, son_baslangic: baslangic });
  try {
    const { basarili, sonuc, hata } = await is();
    const bitis = new Date().toISOString();
    await yaz(admin, basarili ? { ad, son_bitis: bitis, son_basarili: bitis, son_hata: null } : { ad, son_bitis: bitis, son_hata: hata ?? "basarisiz" });
    return sonuc;
  } catch (e) {
    await yaz(admin, { ad, son_bitis: new Date().toISOString(), son_hata: e instanceof Error ? e.message.slice(0, 200) : "istisna" });
    throw e;
  }
}

async function yaz(admin: SupabaseClient, satir: Record<string, string | null>) {
  const { error } = await admin.from("cron_calisma").upsert(satir, { onConflict: "ad" });
  if (error) console.error("[cron-kayit]", satir.ad, error.code ?? error.message);
}

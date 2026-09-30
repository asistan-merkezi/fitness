import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate, formatTime, gunYazi } from "@/lib/datetime";
import { gunDonemi, gunEkle } from "@/lib/donem";
import { isletmeAdiGetir, mesajTetikle, musteriIletisimi } from "./anlik-tetikle";

const ZAMANLI_KODLAR = ["uyelik_bitiyor", "musteri_dogum_gunu", "musteri_ozledik", "ders_hatirlatma"] as const;

type KuralSatiri = { isletme_id: string; tetikleyici_kodu: (typeof ZAMANLI_KODLAR)[number]; zamanlama_offset_dakika: number | null };

/** Dakikayı en az `enAz` gün olacak şekilde tam güne çevirir (günlük tarama saat hassasiyeti sunmaz). */
export function gunOffseti(dakika: number | null, varsayilanGun: number, enAz = 0): number {
  if (dakika === null) return Math.max(varsayilanGun, enAz);
  return Math.max(Math.ceil(dakika / 1440), enAz);
}

/**
 * Günlük tarama: aktif zamanlanmış kurallar için o günün mesajlarını kuyruğa yazar. Her mesajın olay anahtarı kimliği + tarihi
 * içerir; cron iki kez çalışsa da kuyruğa tek satır düşer. Her işletme için ayrı, hata bir işletmeyi diğerinden etkilemez.
 */
export async function zamanlanmisTara(admin: SupabaseClient, bugun: string): Promise<Record<string, number>> {
  const sayac: Record<string, number> = Object.fromEntries(ZAMANLI_KODLAR.map((k) => [k, 0]));
  const { data } = await admin.from("mesaj_kurali").select("isletme_id, tetikleyici_kodu, zamanlama_offset_dakika").eq("aktif", true).in("tetikleyici_kodu", [...ZAMANLI_KODLAR]);
  const adOnbellegi = new Map<string, string>();
  const isletmeAdi = async (id: string) => {
    if (!adOnbellegi.has(id)) adOnbellegi.set(id, await isletmeAdiGetir(admin, id));
    return adOnbellegi.get(id) ?? "";
  };

  for (const kural of (data ?? []) as KuralSatiri[]) {
    try {
      const isletmeId = kural.isletme_id;
      const isletme = await isletmeAdi(isletmeId);

      if (kural.tetikleyici_kodu === "uyelik_bitiyor") {
        const hedef = gunEkle(bugun, gunOffseti(kural.zamanlama_offset_dakika, 7));
        const { data: uyelikler } = await admin
          .from("uyelik_gorunum")
          .select("id, musteri_id, paket_adi, bitis_tarihi")
          .eq("isletme_id", isletmeId)
          .eq("gecerli_durum", "aktif")
          .eq("bitis_tarihi", hedef);
        for (const u of (uyelikler ?? []) as { id: string; musteri_id: string; paket_adi: string; bitis_tarihi: string }[]) {
          const m = await musteriIletisimi(admin, u.musteri_id);
          if (!m) continue;
          await mesajTetikle(admin, {
            isletmeId,
            tetikleyiciKodu: "uyelik_bitiyor",
            aliciTipi: "musteri",
            aliciId: u.musteri_id,
            adres: m.adres,
            degiskenler: { musteri_adi: m.ad, paket_adi: u.paket_adi, bitis_tarihi: gunYazi(u.bitis_tarihi), isletme_adi: isletme },
            olayAnahtari: `uyelik_bitiyor:${u.id}:${u.bitis_tarihi}`,
          });
          sayac.uyelik_bitiyor += 1;
        }
      }

      if (kural.tetikleyici_kodu === "musteri_dogum_gunu") {
        const { data: musteriler } = await admin.rpc("mesaj_dogum_gunu_musterileri", { p_isletme_id: isletmeId, p_tarih: bugun });
        for (const m of (musteriler ?? []) as { id: string; ad_soyad: string; telefon: string | null; eposta: string | null }[]) {
          await mesajTetikle(admin, {
            isletmeId,
            tetikleyiciKodu: "musteri_dogum_gunu",
            aliciTipi: "musteri",
            aliciId: m.id,
            adres: { telefon: m.telefon, eposta: m.eposta },
            degiskenler: { musteri_adi: m.ad_soyad, isletme_adi: isletme },
            olayAnahtari: `dogum_gunu:${m.id}:${bugun.slice(0, 4)}`,
          });
          sayac.musteri_dogum_gunu += 1;
        }
      }

      if (kural.tetikleyici_kodu === "musteri_ozledik") {
        const gun = gunOffseti(kural.zamanlama_offset_dakika, 30, 1);
        const { data: musteriler } = await admin.rpc("mesaj_ozledik_musterileri", { p_isletme_id: isletmeId, p_bugun: bugun, p_gun: gun });
        for (const m of (musteriler ?? []) as { id: string; ad_soyad: string; telefon: string | null; eposta: string | null; son_giris: string }[]) {
          await mesajTetikle(admin, {
            isletmeId,
            tetikleyiciKodu: "musteri_ozledik",
            aliciTipi: "musteri",
            aliciId: m.id,
            adres: { telefon: m.telefon, eposta: m.eposta },
            degiskenler: { musteri_adi: m.ad_soyad, isletme_adi: isletme },
            olayAnahtari: `ozledik:${m.id}:${m.son_giris}`,
          });
          sayac.musteri_ozledik += 1;
        }
      }

      if (kural.tetikleyici_kodu === "ders_hatirlatma") {
        // Günlük tarama: en az bir gün sonraki randevular hatırlatılır.
        const hedef = gunEkle(bugun, gunOffseti(kural.zamanlama_offset_dakika, 1, 1));
        const donem = gunDonemi(hedef);
        const { data: dersler } = await admin
          .from("ders_seansi")
          .select("id, musteri_id, antrenor_id, alan_id, baslangic")
          .eq("isletme_id", isletmeId)
          .in("durum", ["planlandi", "ertelendi"])
          .gte("baslangic", donem.baslangic)
          .lt("baslangic", donem.bitis);
        for (const d of (dersler ?? []) as { id: string; musteri_id: string; antrenor_id: string; alan_id: string; baslangic: string }[]) {
          const m = await musteriIletisimi(admin, d.musteri_id);
          if (!m) continue;
          const [{ data: antrenor }, { data: alan }] = await Promise.all([
            admin.from("kullanici").select("ad_soyad").eq("id", d.antrenor_id).maybeSingle<{ ad_soyad: string }>(),
            admin.from("alan_studyo").select("ad").eq("id", d.alan_id).maybeSingle<{ ad: string }>(),
          ]);
          await mesajTetikle(admin, {
            isletmeId,
            tetikleyiciKodu: "ders_hatirlatma",
            aliciTipi: "musteri",
            aliciId: d.musteri_id,
            adres: m.adres,
            degiskenler: { musteri_adi: m.ad, antrenor_adi: antrenor?.ad_soyad ?? "", tarih: formatDate(d.baslangic), saat: formatTime(d.baslangic), alan_adi: alan?.ad ?? "", isletme_adi: isletme },
            // Ders ertelenirse yeni zamana yeni bir hatırlatma gitsin diye başlangıç anahtara katılır.
            olayAnahtari: `ders_hatirlatma:${d.id}:${d.baslangic}`,
          });
          sayac.ders_hatirlatma += 1;
        }
      }
    } catch (e) {
      console.error(`[mesaj-gunluk] ${kural.tetikleyici_kodu} (${kural.isletme_id}):`, e instanceof Error ? e.message : e);
    }
  }
  return sayac;
}

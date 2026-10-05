import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MesajKanal, MesajKuyrukDurum } from "@/types/mesajlasma";
import { sonrakiDeneme } from "./deneme-plani";
import { hataDegerlendir } from "./hata-kodlari";
import { merkezeGonder, merkezYapilandirildiMi } from "./merkez-client";

type KuyrukSatiri = {
  id: string;
  isletme_id: string;
  kanal: MesajKanal;
  alici_adres: string;
  gonderilecek_metin: string;
  tetikleyici_kodu: string;
  test_mi: boolean;
  deneme_sayisi: number;
  idempotency_anahtari: string;
};

export type KuyrukIslemSonucu = { durum: MesajKuyrukDurum; hataMesaji?: string };

/** Satır başka bir işleyicide ya da artık beklemede değil: bu çağrı hiçbir şey yapmadı. */
const SAHIPLENILEMEDI = "satır zaten işleniyor veya beklemede değil";

async function bakiyeyiSenkronla(admin: SupabaseClient, isletmeId: string, kanal: MesajKanal, bakiye: number, versiyon: number) {
  const { error } = await admin.rpc("mesaj_kredi_senkronla", { p_isletme_id: isletmeId, p_kanal: kanal, p_bakiye: bakiye, p_versiyon: versiyon });
  if (error) console.error("[mesaj] mesaj_kredi_senkronla hatası:", error.message);
}

/**
 * Kuyrukta TEK satırı işler: merkeze gönderir, yanıta göre durumu günceller, merkezden dönen kalanBakiye/versiyonu yerel aynaya
 * yazar (yerelde asla hesaplamaz). `admin` YALNIZ service_role istemcisi olmalı; yetki kontrolü çağıran tarafta yapılır.
 * Merkez yapılandırılmamışsa satıra DOKUNULMAZ (beklemede kalır, deneme sayacı artmaz).
 */
export async function kuyrukSatiriniIsle(admin: SupabaseClient, satirId: string): Promise<KuyrukIslemSonucu> {
  if (!merkezYapilandirildiMi()) return { durum: "beklemede", hataMesaji: "merkez_yapilandirilmadi" };

  // Satırı ATOMİK sahiplen: yalnız hâlâ beklemede olan satır "gonderiliyor"a geçer; iki işleyici aynı satırı iki kez işleyemez.
  const { data: satir, error: sahiplenmeHatasi } = await admin
    .from("mesaj_kuyrugu")
    .update({ durum: "gonderiliyor", sahiplenme_zamani: new Date().toISOString() })
    .eq("id", satirId)
    .eq("durum", "beklemede")
    .select("id, isletme_id, kanal, alici_adres, gonderilecek_metin, tetikleyici_kodu, test_mi, deneme_sayisi, idempotency_anahtari")
    .maybeSingle<KuyrukSatiri>();
  if (sahiplenmeHatasi || !satir) return { durum: "beklemede", hataMesaji: SAHIPLENILEMEDI };

  const sonuc = await merkezeGonder({
    isletmeId: satir.isletme_id,
    kanal: satir.kanal,
    aliciAdres: satir.alici_adres,
    metin: satir.gonderilecek_metin,
    idempotencyKey: satir.idempotency_anahtari,
    testMi: satir.test_mi,
    tetikleyiciKodu: satir.tetikleyici_kodu,
  });

  // Merkeze hiç ulaşılamadı: bakiye bilgisi yok, senkronlanmaz; ağ hatası her zaman geçicidir.
  if (!sonuc.ulasildi) return geciciHataIsle(admin, satir, sonuc.hata);

  // Merkez yanıt verdi (başarılı/başarısız fark etmez): kalanBakiye güvenilirdir.
  await bakiyeyiSenkronla(admin, satir.isletme_id, satir.kanal, sonuc.kalanBakiye, sonuc.bakiyeVersiyonu);

  if (sonuc.basarili) {
    await admin.from("mesaj_kuyrugu").update({ durum: "gonderildi", gonderim_zamani: new Date().toISOString(), saglayici_mesaj_id: sonuc.saglayiciMesajId ?? null }).eq("id", satir.id);
    return { durum: "gonderildi" };
  }

  const { kalici, kaliciDurum } = hataDegerlendir(sonuc.hata);
  if (kalici) {
    await admin.from("mesaj_kuyrugu").update({ durum: kaliciDurum, hata_mesaji: sonuc.hata }).eq("id", satir.id);
    return { durum: kaliciDurum, hataMesaji: sonuc.hata };
  }
  return geciciHataIsle(admin, satir, sonuc.hata);
}

async function geciciHataIsle(admin: SupabaseClient, satir: KuyrukSatiri, hataMesaji: string): Promise<KuyrukIslemSonucu> {
  const yeniDeneme = satir.deneme_sayisi + 1;
  const plan = sonrakiDeneme(satir.deneme_sayisi, Date.now());
  if (plan.son) {
    await admin.from("mesaj_kuyrugu").update({ durum: "hata", hata_mesaji: hataMesaji, deneme_sayisi: yeniDeneme }).eq("id", satir.id);
    return { durum: "hata", hataMesaji };
  }
  await admin.from("mesaj_kuyrugu").update({ durum: "beklemede", hata_mesaji: hataMesaji, deneme_sayisi: yeniDeneme, planlanan_zaman: plan.zaman }).eq("id", satir.id);
  return { durum: "beklemede", hataMesaji };
}

/** Sahiplenip bu süreden uzun "gonderiliyor"da kalan satır takılmış sayılır (merkez isteği 15 sn'de zaman aşımına uğrar). */
const TAKILMA_ESIGI_DK = 15;
const PARTI = 50;

/**
 * Gönderim sırasında süreç ölürse (zaman aşımı, deploy) satır "gonderiliyor"da kalır: yeniden kuyruğa alınır.
 * Merkez aynı Idempotency-Key'i tekrar göndermediği için mesaj çift gitmez.
 */
async function takilanlariKurtar(admin: SupabaseClient): Promise<number> {
  const esik = new Date(Date.now() - TAKILMA_ESIGI_DK * 60_000).toISOString();
  const { data, error } = await admin
    .from("mesaj_kuyrugu")
    .update({ durum: "beklemede", sahiplenme_zamani: null })
    .eq("durum", "gonderiliyor")
    .or(`sahiplenme_zamani.is.null,sahiplenme_zamani.lt.${esik}`)
    .select("id");
  if (error) console.error("[mesaj] takılan satırlar kurtarılamadı:", error.message);
  return data?.length ?? 0;
}

/**
 * Vadesi gelmiş bekleyen satırları zaman bütçesi içinde, kuyruk boşalana kadar 50'lik partilerle işler (cron işi kullanır).
 * Tek parti sınırı TÜM işletmeler için günde 50 mesaj demekti; işletme sayısı arttıkça kuyruk sonsuza dek birikirdi.
 */
export async function bekleyenleriIsle(admin: SupabaseClient, butceMs = 200_000): Promise<{ kurtarilan: number; islenen: number; gonderilen: number }> {
  if (!merkezYapilandirildiMi()) return { kurtarilan: 0, islenen: 0, gonderilen: 0 };
  const bitis = Date.now() + butceMs;
  const kurtarilan = await takilanlariKurtar(admin);
  let islenen = 0;
  let gonderilen = 0;
  while (Date.now() < bitis) {
    const { data, error } = await admin.from("mesaj_kuyrugu").select("id").eq("durum", "beklemede").lte("planlanan_zaman", new Date().toISOString()).order("planlanan_zaman").limit(PARTI);
    if (error) {
      console.error("[mesaj] bekleyenler okunamadı:", error.message);
      break;
    }
    const satirlar = (data ?? []) as { id: string }[];
    let ilerledi = false;
    for (const { id } of satirlar) {
      if (Date.now() >= bitis) break;
      const sonuc = await kuyrukSatiriniIsle(admin, id);
      islenen += 1;
      if (sonuc.durum === "gonderildi") gonderilen += 1;
      // Geçici hatada satır ileri bir zamana ertelenir, kalıcıda kuyruktan çıkar: her iki durumda da sonraki okumada gelmez.
      if (sonuc.hataMesaji !== SAHIPLENILEMEDI) ilerledi = true;
    }
    if (satirlar.length < PARTI || !ilerledi) break;
  }
  return { kurtarilan, islenen, gonderilen };
}

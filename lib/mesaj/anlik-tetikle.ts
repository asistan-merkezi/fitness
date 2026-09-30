import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MesajKanal } from "@/types/mesajlasma";
import { sablonDoldur } from "./degisken-dogrula";
import { kuyrukSatiriniIsle } from "./kuyruk-isle";
import { tetikleyiciGetir } from "./tetikleyiciler";

type Adres = { telefon: string | null; eposta: string | null };

export type MesajTetikleGirdisi = {
  isletmeId: string;
  tetikleyiciKodu: string;
  aliciTipi: "musteri" | "personel";
  aliciId: string;
  adres: Adres;
  degiskenler: Record<string, string>;
  /**
   * Olayın kimliği (örn. "uyelik_satis_ozet:<uyelik_id>"). Kanal eki eklenerek idempotency anahtarı olur: aynı olay tekrar
   * tetiklense de kuyruğa TEK satır düşer (UNIQUE ihlali sessizce yutulur). Zamanlanmış taramalar günü de anahtara katmalıdır.
   */
  olayAnahtari: string;
  /** Verilirse mesaj bu zamanda gönderilir (zamanlanmış tetikleyiciler); verilmezse hemen. */
  planlananZaman?: string;
};

/**
 * Bir olay gerçekleştiğinde mesaj_kuyrugu'na satır ekler. Kural yoksa / pasifse / alıcı adresi yoksa SESSİZCE atlar (hata değildir).
 * 'ticari' içerikte müşterinin ticari ileti izni yoksa atlar. Gönderim olayı yapan isteğin DIŞINDA (after) denenir; merkez bağlı
 * değilse satır kuyrukta bekler. `admin` yalnız service_role istemcisidir; isletmeId her zaman OTURUMDAN alınmalıdır, istemciden değil.
 * Bu fonksiyon asla fırlatmaz: mesajlaşma sorunu iş akışını (satış, ödeme, check-in) bozmamalıdır.
 */
export async function mesajTetikle(admin: SupabaseClient, g: MesajTetikleGirdisi): Promise<void> {
  try {
    const tanim = tetikleyiciGetir(g.tetikleyiciKodu);
    if (!tanim) {
      console.error(`[mesaj] bilinmeyen tetikleyici kodu: ${g.tetikleyiciKodu}`);
      return;
    }

    const { data: kural } = await admin
      .from("mesaj_kurali")
      .select("aktif, sms_aktif, whatsapp_aktif, mail_aktif, mesaj_metni")
      .eq("isletme_id", g.isletmeId)
      .eq("tetikleyici_kodu", g.tetikleyiciKodu)
      .maybeSingle<{ aktif: boolean; sms_aktif: boolean; whatsapp_aktif: boolean; mail_aktif: boolean; mesaj_metni: string }>();
    if (!kural || !kural.aktif) return;

    if (tanim.icerikTipi === "ticari" && g.aliciTipi === "musteri") {
      const { data: izinli } = await admin.rpc("musteri_ticari_izin", { p_musteri_id: g.aliciId });
      if (izinli !== true) return;
    }

    const metin = sablonDoldur(kural.mesaj_metni.trim() || tanim.varsayilanMesajMetni, g.degiskenler);
    if (!metin) return;

    const kanallar: { kanal: MesajKanal; aktif: boolean; adres: string | null }[] = [
      { kanal: "sms", aktif: kural.sms_aktif, adres: g.adres.telefon },
      { kanal: "whatsapp", aktif: kural.whatsapp_aktif, adres: g.adres.telefon },
      { kanal: "mail", aktif: kural.mail_aktif, adres: g.adres.eposta },
    ];

    const eklenenler: string[] = [];
    for (const k of kanallar) {
      if (!k.aktif || !k.adres) continue;
      const { data, error } = await admin
        .from("mesaj_kuyrugu")
        .insert({
          isletme_id: g.isletmeId,
          tetikleyici_kodu: g.tetikleyiciKodu,
          kanal: k.kanal,
          alici_tipi: g.aliciTipi,
          alici_id: g.aliciId,
          alici_adres: k.adres,
          gonderilecek_metin: metin,
          idempotency_anahtari: `${g.olayAnahtari}:${k.kanal}`,
          ...(g.planlananZaman ? { planlanan_zaman: g.planlananZaman } : {}),
        })
        .select("id")
        .maybeSingle<{ id: string }>();
      // 23505: aynı olay zaten kuyrukta (beklenen, hata değil).
      if (error && error.code !== "23505") console.error(`[mesaj] kuyruğa yazılamadı (${g.tetikleyiciKodu}/${k.kanal}):`, error.message);
      if (data?.id) eklenenler.push(data.id);
    }

    // Hemen gönderilecekler olayı yapan isteği bekletmeden denenir; planlı olanları cron işi gönderir.
    if (eklenenler.length > 0 && !g.planlananZaman) {
      const gonder = async () => {
        for (const id of eklenenler) await kuyrukSatiriniIsle(admin, id);
      };
      try {
        after(gonder);
      } catch {
        // İstek bağlamı dışında (ör. cron) çağrılırsa satır zaten kuyrukta; işleyici sonra gönderir.
      }
    }
  } catch (e) {
    console.error("[mesaj] tetikleme hatası:", e instanceof Error ? e.message : e);
  }
}

/** Müşterinin ad ve iletişim bilgisi (service_role ile). */
export async function musteriIletisimi(admin: SupabaseClient, musteriId: string): Promise<{ ad: string; adres: Adres } | null> {
  const { data } = await admin.from("musteri").select("ad_soyad, telefon, eposta").eq("id", musteriId).maybeSingle<{ ad_soyad: string; telefon: string | null; eposta: string | null }>();
  return data ? { ad: data.ad_soyad, adres: { telefon: data.telefon, eposta: data.eposta } } : null;
}

/**
 * Personelin iletişim bilgisi: e-posta Auth hesabından; telefon kullanici.telefon kolonu varsa (telefon girişi geldikten sonra) oradan.
 * Kolon henüz yoksa sorgu hatası sessizce yutulur ve yalnız e-posta döner.
 */
export async function personelIletisimi(admin: SupabaseClient, kullaniciId: string): Promise<{ ad: string; adres: Adres } | null> {
  const { data: kisi } = await admin.from("kullanici").select("ad_soyad").eq("id", kullaniciId).maybeSingle<{ ad_soyad: string }>();
  if (!kisi) return null;
  const { data: auth } = await admin.auth.admin.getUserById(kullaniciId);
  let telefon: string | null = null;
  const tel = await admin.from("kullanici").select("telefon").eq("id", kullaniciId).maybeSingle<{ telefon: string | null }>();
  if (!tel.error) telefon = tel.data?.telefon ?? null;
  return { ad: kisi.ad_soyad, adres: { telefon, eposta: auth.user?.email ?? null } };
}

/** İşletme yöneticilerinin iletişim bilgileri (yöneticiye giden bildirimler için). */
export async function yoneticileriGetir(admin: SupabaseClient, isletmeId: string): Promise<{ id: string; ad: string; adres: Adres }[]> {
  const { data } = await admin.from("kullanici").select("id").eq("isletme_id", isletmeId).eq("rol", "isletme_admin").eq("aktif", true);
  const sonuc: { id: string; ad: string; adres: Adres }[] = [];
  for (const { id } of (data ?? []) as { id: string }[]) {
    const kisi = await personelIletisimi(admin, id);
    if (kisi) sonuc.push({ id, ...kisi });
  }
  return sonuc;
}

export async function isletmeAdiGetir(admin: SupabaseClient, isletmeId: string): Promise<string> {
  const { data } = await admin.from("isletme").select("ad").eq("id", isletmeId).maybeSingle<{ ad: string }>();
  return data?.ad ?? "";
}

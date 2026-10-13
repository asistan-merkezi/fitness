"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { isletmeAdiGetir } from "@/lib/mesaj/anlik-tetikle";
import { sablonDoldur } from "@/lib/mesaj/degisken-dogrula";
import { kuyrukSatiriniIsle } from "@/lib/mesaj/kuyruk-isle";
import { kanalUygunlugu, manuelGonderilebilirTetikleyiciler } from "@/lib/mesaj/manuel-mesaj";
import { tetikleyiciGetir } from "@/lib/mesaj/tetikleyiciler";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MesajKanal } from "@/types/mesajlasma";

export type MesajSecenegi = { kod: string; ad: string; ticari: boolean; engelli: boolean; metin: string };
export type MesajSecenekleri = { ok: true; sablonlar: MesajSecenegi[]; kanallar: Record<MesajKanal, boolean> } | { ok: false; hata: string };

type Admin = ReturnType<typeof createAdminClient>;
type YetkiliMusteri = { ok: true; admin: Admin; isletmeId: string; ad: string; telefon: string | null; eposta: string | null; isletmeAdi: string } | { ok: false; hata: string };

/** Rol kontrolü + müşteriyi KULLANICI oturumuyla (RLS) okur: başka işletmenin müşterisi dönmez. */
async function yetkiliMusteriGetir(musteriId: string): Promise<YetkiliMusteri> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return { ok: false, hata: YETKISIZ.message };
  if (!z.uuid().safeParse(musteriId).success) return { ok: false, hata: "Müşteri bulunamadı." };
  const { data: musteri } = await oturum.supabase.from("musteri").select("ad_soyad, telefon, eposta").eq("id", musteriId).maybeSingle<{ ad_soyad: string; telefon: string | null; eposta: string | null }>();
  if (!musteri) return { ok: false, hata: "Müşteri bulunamadı." };
  const admin = createAdminClient();
  const isletmeId = oturum.kullanici.isletme_id;
  return { ok: true, admin, isletmeId, ad: musteri.ad_soyad, telefon: musteri.telefon, eposta: musteri.eposta, isletmeAdi: await isletmeAdiGetir(admin, isletmeId) };
}

async function kuralMetni(admin: Admin, isletmeId: string, kod: string, varsayilan: string): Promise<string> {
  const { data } = await admin.from("mesaj_kurali").select("mesaj_metni").eq("isletme_id", isletmeId).eq("tetikleyici_kodu", kod).maybeSingle<{ mesaj_metni: string }>();
  return data?.mesaj_metni?.trim() || varsayilan;
}

async function ticariIzinli(admin: Admin, musteriId: string): Promise<boolean> {
  const { data } = await admin.rpc("musteri_ticari_izin", { p_musteri_id: musteriId });
  return data === true;
}

/** Modal açılınca çağrılır: elle gönderilebilir şablonlar (işletmenin metni varsa o, yoksa varsayılan; değişkenler doldurulmuş) + kanal uygunluğu. */
export async function musteriMesajSecenekleriGetir(musteriId: string): Promise<MesajSecenekleri> {
  const m = await yetkiliMusteriGetir(musteriId);
  if (!m.ok) return m;
  const izinli = await ticariIzinli(m.admin, musteriId);
  const sablonlar: MesajSecenegi[] = [];
  for (const t of manuelGonderilebilirTetikleyiciler()) {
    const ticari = t.icerikTipi === "ticari";
    const ham = await kuralMetni(m.admin, m.isletmeId, t.kod, t.varsayilanMesajMetni);
    sablonlar.push({ kod: t.kod, ad: t.ad, ticari, engelli: ticari && !izinli, metin: sablonDoldur(ham, { musteri_adi: m.ad, isletme_adi: m.isletmeAdi }) });
  }
  return { ok: true, sablonlar, kanallar: kanalUygunlugu({ telefon: m.telefon, eposta: m.eposta }) };
}

const gonderSemasi = z.object({
  kod: z.string().min(1).max(80),
  metin: z.string().trim().min(1, "Mesaj metni boş olamaz.").max(1000, "Mesaj en fazla 1000 karakter olabilir."),
  kanallar: z.array(z.enum(["sms", "whatsapp", "mail"])).min(1, "En az bir kanal seçin.").max(3),
});

const KANAL_AD: Record<MesajKanal, string> = { sms: "SMS", whatsapp: "WhatsApp", mail: "E-posta" };

/**
 * Seçili her kanal için kuyruğa bir satır yazar ve hemen işlemeyi dener; başarısızsa kuyruğun yeniden deneme düzeni sürer.
 * Elle gönderimde her tıklama ayrı mesajdır (idempotency anahtarında rastgele parça). Kural aktif/pasif ayarı ve sessiz saat uygulanmaz.
 * Ticari şablonda müşterinin ticari ileti izni yoksa reddedilir (arayüzde de engelli).
 */
export async function musteriMesajiGonder(musteriId: string, girdi: { kod: string; metin: string; kanallar: MesajKanal[] }): Promise<EylemSonucu> {
  const a = gonderSemasi.safeParse(girdi);
  if (!a.success) return hata(a.error.issues[0]?.message ?? "Geçersiz istek.");
  const m = await yetkiliMusteriGetir(musteriId);
  if (!m.ok) return hata(m.hata);

  const tanim = tetikleyiciGetir(a.data.kod);
  if (!tanim || !manuelGonderilebilirTetikleyiciler().some((t) => t.kod === tanim.kod)) return hata("Bu şablon elle gönderilemez.");
  if (tanim.icerikTipi === "ticari" && !(await ticariIzinli(m.admin, musteriId))) return hata("Müşterinin ticari ileti onayı yok; bu şablon gönderilemez.");

  const telefon = m.telefon?.trim() || null;
  const adresler: Record<MesajKanal, string | null> = { sms: telefon, whatsapp: telefon, mail: m.eposta?.trim() || null };
  const eklenenler: string[] = [];
  const atlananlar: string[] = [];
  for (const kanal of new Set(a.data.kanallar)) {
    const adres = adresler[kanal];
    if (!adres) {
      atlananlar.push(KANAL_AD[kanal]);
      continue;
    }
    const { data, error } = await m.admin
      .from("mesaj_kuyrugu")
      .insert({
        isletme_id: m.isletmeId,
        tetikleyici_kodu: tanim.kod,
        kanal,
        alici_tipi: "musteri",
        alici_id: musteriId,
        alici_adres: adres,
        gonderilecek_metin: a.data.metin,
        idempotency_anahtari: `manuel:${musteriId}:${tanim.kod}:${kanal}:${randomUUID()}`,
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !data) {
      console.error("[musteriMesajiGonder] kuyruğa yazılamadı", error?.code);
      return hata("Mesaj kuyruğa yazılamadı. Lütfen tekrar deneyin.");
    }
    eklenenler.push(data.id);
  }
  if (eklenenler.length === 0) return hata(`${atlananlar.join(", ")} için müşterinin iletişim bilgisi yok.`);

  let gonderildi = 0;
  for (const id of eklenenler) {
    const sonuc = await kuyrukSatiriniIsle(m.admin, id);
    if (sonuc.durum === "gonderildi") gonderildi++;
  }
  const ek = atlananlar.length ? ` (${atlananlar.join(", ")} atlandı: iletişim bilgisi yok.)` : "";
  return basari(gonderildi === eklenenler.length ? `Mesaj gönderildi.${ek}` : `Mesaj kuyruğa alındı, birazdan gönderilecek.${ek}`);
}

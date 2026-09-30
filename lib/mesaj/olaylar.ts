import "server-only";
import { formatDate, formatTime, gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { IZIN_TIPLERI, YONTEM_ETIKETLERI } from "@/lib/panel/etiketler";
import { createAdminClient } from "@/lib/supabase/admin";
import { isletmeAdiGetir, mesajTetikle, musteriIletisimi, personelIletisimi, yoneticileriGetir } from "./anlik-tetikle";

/**
 * İş olaylarından mesaj üretimi. Her fonksiyon ilgili kaydı okur, değişkenleri hazırlar ve `mesajTetikle` ile kuyruğa yazar.
 * Hiçbiri fırlatmaz: mesajlaşma sorunu satış, ödeme, check-in gibi asıl işlemi bozmamalıdır. `isletmeId` her zaman OTURUMDAN gelir.
 */
async function guvenli(ad: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`[mesaj/olay:${ad}]`, e instanceof Error ? e.message : e);
  }
}

export function musteriKayitMesaji(isletmeId: string, musteriId: string) {
  return guvenli("musteri_kayit", async () => {
    const admin = createAdminClient();
    const m = await musteriIletisimi(admin, musteriId);
    if (!m) return;
    await mesajTetikle(admin, {
      isletmeId,
      tetikleyiciKodu: "musteri_kayit_hosgeldin",
      aliciTipi: "musteri",
      aliciId: musteriId,
      adres: m.adres,
      degiskenler: { musteri_adi: m.ad, isletme_adi: await isletmeAdiGetir(admin, isletmeId) },
      olayAnahtari: `musteri_kayit:${musteriId}`,
    });
  });
}

type UyelikOzeti = { musteri_id: string; paket_adi: string; bitis_tarihi: string | null };

async function uyelikGetir(uyelikId: string): Promise<UyelikOzeti | null> {
  const { data } = await createAdminClient().from("uyelik").select("musteri_id, paket_adi, bitis_tarihi").eq("id", uyelikId).maybeSingle<UyelikOzeti>();
  return data ?? null;
}

export function uyelikSatisMesaji(isletmeId: string, uyelikId: string) {
  return guvenli("uyelik_satis", async () => {
    const admin = createAdminClient();
    const u = await uyelikGetir(uyelikId);
    const m = u ? await musteriIletisimi(admin, u.musteri_id) : null;
    if (!u || !m) return;
    await mesajTetikle(admin, {
      isletmeId,
      tetikleyiciKodu: "uyelik_satis_ozet",
      aliciTipi: "musteri",
      aliciId: u.musteri_id,
      adres: m.adres,
      degiskenler: { musteri_adi: m.ad, paket_adi: u.paket_adi, bitis_tarihi: u.bitis_tarihi ? gunYazi(u.bitis_tarihi) : "süresiz", isletme_adi: await isletmeAdiGetir(admin, isletmeId) },
      olayAnahtari: `uyelik_satis:${uyelikId}`,
    });
  });
}

/** Seans hakkı 2 veya daha az kaldıysa yenileme hatırlatması (her kalan-hak değeri için bir kez). */
export function hakAzaldiMesaji(isletmeId: string, uyelikId: string | null | undefined, kalanHak: number | null | undefined) {
  return guvenli("hak_azaldi", async () => {
    if (!uyelikId || kalanHak === null || kalanHak === undefined || kalanHak < 0 || kalanHak > 2) return;
    const admin = createAdminClient();
    const u = await uyelikGetir(uyelikId);
    const m = u ? await musteriIletisimi(admin, u.musteri_id) : null;
    if (!u || !m) return;
    await mesajTetikle(admin, {
      isletmeId,
      tetikleyiciKodu: "uyelik_hak_azaldi",
      aliciTipi: "musteri",
      aliciId: u.musteri_id,
      adres: m.adres,
      degiskenler: { musteri_adi: m.ad, paket_adi: u.paket_adi, kalan_hak: String(kalanHak), isletme_adi: await isletmeAdiGetir(admin, isletmeId) },
      olayAnahtari: `hak_azaldi:${uyelikId}:${kalanHak}`,
    });
  });
}

export type DersOlayi = "olusturuldu" | "iptal" | "ertelendi";

/** Randevu olayları: müşteriye bilgilendirme; yeni randevuda ayrıca antrenöre bildirim. */
export function dersMesaji(olay: DersOlayi, isletmeId: string, dersId: string) {
  return guvenli(`ders_${olay}`, async () => {
    const admin = createAdminClient();
    const { data: d } = await admin.from("ders_seansi").select("musteri_id, antrenor_id, alan_id, baslangic, updated_at").eq("id", dersId).maybeSingle<{ musteri_id: string; antrenor_id: string; alan_id: string; baslangic: string; updated_at: string }>();
    if (!d) return;
    const [m, antrenor, { data: alan }, isletme] = await Promise.all([
      musteriIletisimi(admin, d.musteri_id),
      personelIletisimi(admin, d.antrenor_id),
      admin.from("alan_studyo").select("ad").eq("id", d.alan_id).maybeSingle<{ ad: string }>(),
      isletmeAdiGetir(admin, isletmeId),
    ]);
    const tarih = formatDate(d.baslangic);
    const saat = formatTime(d.baslangic);

    if (m) {
      const kod = olay === "olusturuldu" ? "ders_olusturuldu" : olay === "iptal" ? "ders_iptal" : "ders_ertelendi";
      // İptal/erteleme birden çok kez yapılabildiğinden anahtar son güncelleme zamanını da taşır.
      const anahtar = olay === "olusturuldu" ? `ders_olusturuldu:${dersId}` : `${kod}:${dersId}:${d.updated_at}`;
      await mesajTetikle(admin, {
        isletmeId,
        tetikleyiciKodu: kod,
        aliciTipi: "musteri",
        aliciId: d.musteri_id,
        adres: m.adres,
        degiskenler: { musteri_adi: m.ad, antrenor_adi: antrenor?.ad ?? "", tarih, saat, alan_adi: alan?.ad ?? "", isletme_adi: isletme },
        olayAnahtari: anahtar,
      });
    }

    if (olay === "olusturuldu" && antrenor) {
      await mesajTetikle(admin, {
        isletmeId,
        tetikleyiciKodu: "ders_atandi_antrenore",
        aliciTipi: "personel",
        aliciId: d.antrenor_id,
        adres: antrenor.adres,
        degiskenler: { antrenor_adi: antrenor.ad, musteri_adi: m?.ad ?? "", tarih, saat, alan_adi: alan?.ad ?? "" },
        olayAnahtari: `ders_atandi:${dersId}`,
      });
    }
  });
}

/** Ders hakkı düşümünden sonra (ders durumu değişince): hakkı düşen ders paketi için hak-azaldı kontrolü. */
export function dersHakMesaji(isletmeId: string, dersId: string, kalanHak: number | null | undefined) {
  return guvenli("ders_hak", async () => {
    const { data } = await createAdminClient().from("ders_seansi").select("uyelik_id").eq("id", dersId).maybeSingle<{ uyelik_id: string | null }>();
    await hakAzaldiMesaji(isletmeId, data?.uyelik_id, kalanHak);
  });
}

export function odemeMesaji(isletmeId: string, musteriId: string, tutarKurus: number, yontem: keyof typeof YONTEM_ETIKETLERI, anahtar: string) {
  return guvenli("odeme", async () => {
    const admin = createAdminClient();
    const m = await musteriIletisimi(admin, musteriId);
    if (!m) return;
    await mesajTetikle(admin, {
      isletmeId,
      tetikleyiciKodu: "odeme_makbuzu",
      aliciTipi: "musteri",
      aliciId: musteriId,
      adres: m.adres,
      degiskenler: { musteri_adi: m.ad, tutar: kurusTLyazi(tutarKurus), odeme_yontemi: YONTEM_ETIKETLERI[yontem] ?? "", isletme_adi: await isletmeAdiGetir(admin, isletmeId) },
      olayAnahtari: `odeme:${anahtar}`,
    });
  });
}

type IzinOzeti = { kullanici_id: string; tip: keyof typeof IZIN_TIPLERI; baslangic_tarihi: string; bitis_tarihi: string };

async function izinGetir(izinId: string): Promise<IzinOzeti | null> {
  const { data } = await createAdminClient().from("izin_talebi").select("kullanici_id, tip, baslangic_tarihi, bitis_tarihi").eq("id", izinId).maybeSingle<IzinOzeti>();
  return data ?? null;
}

/** Yeni izin talebi: tüm işletme yöneticilerine bildirim. */
export function izinTalepMesaji(isletmeId: string, izinId: string) {
  return guvenli("izin_talebi", async () => {
    const admin = createAdminClient();
    const izin = await izinGetir(izinId);
    const talep = izin ? await personelIletisimi(admin, izin.kullanici_id) : null;
    if (!izin || !talep) return;
    for (const y of await yoneticileriGetir(admin, isletmeId)) {
      if (y.id === izin.kullanici_id) continue; // yönetici kendi talebini kendine bildirmez
      await mesajTetikle(admin, {
        isletmeId,
        tetikleyiciKodu: "izin_talebi_yoneticiye",
        aliciTipi: "personel",
        aliciId: y.id,
        adres: y.adres,
        degiskenler: { personel_adi: talep.ad, izin_turu: IZIN_TIPLERI[izin.tip].toLowerCase(), baslangic: gunYazi(izin.baslangic_tarihi), bitis: gunYazi(izin.bitis_tarihi) },
        olayAnahtari: `izin_talebi:${izinId}:${y.id}`,
      });
    }
  });
}

/** İzin onay/ret sonucu: talep eden personele bildirim. */
export function izinSonucMesaji(isletmeId: string, izinId: string, onaylandi: boolean) {
  return guvenli("izin_sonucu", async () => {
    const admin = createAdminClient();
    const izin = await izinGetir(izinId);
    const kisi = izin ? await personelIletisimi(admin, izin.kullanici_id) : null;
    if (!izin || !kisi) return;
    await mesajTetikle(admin, {
      isletmeId,
      tetikleyiciKodu: "izin_sonucu_personele",
      aliciTipi: "personel",
      aliciId: izin.kullanici_id,
      adres: kisi.adres,
      degiskenler: { personel_adi: kisi.ad, sonuc: onaylandi ? "onaylandı" : "reddedildi", baslangic: gunYazi(izin.baslangic_tarihi), bitis: gunYazi(izin.bitis_tarihi) },
      olayAnahtari: `izin_sonucu:${izinId}:${onaylandi ? "onay" : "red"}`,
    });
  });
}

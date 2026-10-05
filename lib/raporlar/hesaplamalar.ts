import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateForInput, formatTime } from "@/lib/datetime";
import { AY_ADLARI, GIDER_KATEGORI_ETIKETLERI } from "@/lib/panel/finans";
import { tumSayfalariOku } from "@/lib/supabase/sayfali-oku";
import type { DersDurumu } from "@/types/veritabani";

/** Raporlar ekranının saf hesapları ve sayfalı sorguları (klinikteki lib/raporlar/hesaplamalar.ts'in fitness karşılığı). */

export type FinansOzeti = {
  tahsilat_kurus: number;
  iade_kurus: number;
  net_tahsilat_kurus: number;
  satis_kurus: number;
  iskonto_kurus: number;
  gider_kurus: number;
  personel_odeme_kurus: number;
  personel_hakedis_kurus: number;
  acik_alacak_kurus: number;
  nakit_sonuc_kurus: number;
};

/** `finans_ozet` RPC'si (jsonb; sayıları string dönebilir) → sayısal özet. */
export function finansOzetiCoz(ham: unknown): FinansOzeti {
  const kayit = (ham ?? {}) as Record<string, number | string>;
  return Object.fromEntries(Object.entries(kayit).map(([k, v]) => [k, Number(v)])) as unknown as FinansOzeti;
}

/** Toplam gider = ödenmiş giderler + personel hakediş/prim tahakkuku (tahakkuk esaslı; nakit sonucu ayrıca gösterilir). */
export const toplamGider = (o: FinansOzeti) => (o.gider_kurus ?? 0) + (o.personel_hakedis_kurus ?? 0);

export type GelirOzeti = { nakit: number; krediKarti: number; bankaHavalesi: number; belirtilmemis: number; iade: number; netTahsilat: number };

/** Müşteri tahsilat/iade hareketlerinden yöntem kırılımı (Kasa / Banka / Kredi Kartı ekranlarının "müşteri" kalemleriyle mutabıktır). */
export function gelirOzetiHesapla(satirlar: { kaynak: string; yontem: string | null; tutar_kurus: number }[]): GelirOzeti {
  const o: GelirOzeti = { nakit: 0, krediKarti: 0, bankaHavalesi: 0, belirtilmemis: 0, iade: 0, netTahsilat: 0 };
  for (const s of satirlar) {
    if (s.kaynak !== "musteri") continue;
    if (s.tutar_kurus < 0) {
      o.iade += -s.tutar_kurus;
    } else if (s.yontem === "nakit") o.nakit += s.tutar_kurus;
    else if (s.yontem === "kredi_karti") o.krediKarti += s.tutar_kurus;
    else if (s.yontem === "havale") o.bankaHavalesi += s.tutar_kurus;
    else o.belirtilmemis += s.tutar_kurus;
  }
  o.netTahsilat = o.nakit + o.krediKarti + o.bankaHavalesi + o.belirtilmemis - o.iade;
  return o;
}

export type GiderKirilimi = { genel: number; kamusal: number; personel: number; toplam: number };

/** Ödenmiş gider satırları + personel tahakkuku → Genel / Kamu ödemeleri / Personel kırılımı. */
export function giderKirilimiHesapla(giderler: { tur: string; tutar_kurus: number }[], personelHakedis: number): GiderKirilimi {
  const genel = giderler.filter((g) => g.tur !== "kamusal").reduce((t, g) => t + g.tutar_kurus, 0);
  const kamusal = giderler.filter((g) => g.tur === "kamusal").reduce((t, g) => t + g.tutar_kurus, 0);
  return { genel, kamusal, personel: personelHakedis, toplam: genel + kamusal + personelHakedis };
}

export type YillikAy = { ay: number; ayEtiketi: string; gelir: number; gider: number };

/** Yılın 12 ayı için gelir (net tahsilat) ve gider (ödenmiş gider + personel tahakkuku); `finans_ozet` ayda bir çağrılır. */
export async function yillikSeriGetir(supabase: SupabaseClient, yil: number): Promise<YillikAy[]> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const sonuclar = await Promise.all(
    AY_ADLARI.map((_, i) => {
      const baslangic = `${yil}-${pad(i + 1)}-01`;
      const bitis = i === 11 ? `${yil + 1}-01-01` : `${yil}-${pad(i + 2)}-01`;
      return supabase.rpc("finans_ozet", { p_baslangic: baslangic, p_bitis: bitis });
    })
  );
  return sonuclar.map(({ data, error }, i) => {
    if (error) throw new Error(`Aylık finans özeti okunamadı: ${error.message}`);
    const o = finansOzetiCoz(data);
    return { ay: i + 1, ayEtiketi: AY_ADLARI[i], gelir: o.net_tahsilat_kurus ?? 0, gider: toplamGider(o) };
  });
}

export type DersSatiri = { id: string; musteri_id: string; baslangic: string; durum: DersDurumu; ucret_kurus: number; hak_dusuldu: boolean; borc_hareket_id: string | null };

/** Dönemdeki dersler (1000'erlik sayfalarla, sınırsız; hata fırlatır). `baslangic`/`bitis` UTC ISO (Donem.baslangic/bitis). */
export async function dersleriGetir(supabase: SupabaseClient, baslangic: string, bitis: string): Promise<DersSatiri[]> {
  const satirlar = await tumSayfalariOku<DersSatiri>((bas, son) =>
    supabase
      .from("ders_seansi")
      .select("id, musteri_id, baslangic, durum, ucret_kurus, hak_dusuldu, borc_hareket_id")
      .gte("baslangic", baslangic)
      .lt("baslangic", bitis)
      .order("baslangic")
      .order("id")
      .range(bas, son)
  );
  return satirlar.map((d) => ({ ...d, ucret_kurus: Number(d.ucret_kurus) }));
}

export type DersDurumOzeti = { tamamlanan: number; planlanan: number; ertelenen: number; iptalVeGelmedi: number };

export function dersDurumOzetiHesapla(dersler: { durum: DersDurumu }[]): DersDurumOzeti {
  const say = (...durumlar: DersDurumu[]) => dersler.filter((d) => durumlar.includes(d.durum)).length;
  return { tamamlanan: say("tamamlandi"), planlanan: say("planlandi", "geldi", "gecikmeli_geldi", "derste"), ertelenen: say("ertelendi"), iptalVeGelmedi: say("iptal", "gelmedi") };
}

/** Ödenmiş giderler (kategori dağılımı ve Genel/Kamu kırılımı için); sayfalı, en çok 5000. */
export async function odenmisGiderleriGetir(supabase: SupabaseClient, baslangic: string, bitis: string): Promise<{ tur: string; kategori: string; tutar_kurus: number }[]> {
  const satirlar = await tumSayfalariOku<{ tur: string; kategori: string; tutar_kurus: number | string }>((bas, son) =>
    supabase.from("gider").select("tur, kategori, tutar_kurus").eq("durum", "odendi").gte("odeme_tarihi", baslangic).lt("odeme_tarihi", bitis).order("id").range(bas, son)
  );
  return satirlar.map((g) => ({ ...g, tutar_kurus: Number(g.tutar_kurus) }));
}

export type GunlukKalem = {
  tur: "ders" | "tahsilat" | "iade" | "gider" | "personel";
  saat: string | null;
  baslik: string;
  altBaslik: string | null;
  yon: "gelir" | "gider" | "notr";
  tutar: number;
  durum?: DersDurumu;
};
export type GunlukOzet = { tarih: string; gelir: number; gider: number; dersSayisi: number; kalemler: GunlukKalem[] };

/**
 * Günlük döküm: dersler (saat, müşteri, durum) + nakit hareketleri (tahsilat, iade, gider, personel ödemesi). Kasa/banka arası
 * manuel kayıtlar ve transferler dahil DEĞİLDİR (gelir/gider değil). Personel maaş tahakkuku belirli bir güne ait olmadığından günlüğe yazılmaz.
 */
export function gunlukDokumHesapla(
  hareketler: { tarih: string; tutar_kurus: number; kaynak: string; aciklama: string | null; musteri_adi?: string }[],
  dersler: DersSatiri[],
  musteriAdi: Map<string, string>
): GunlukOzet[] {
  const gunler = new Map<string, GunlukOzet>();
  const gun = (tarih: string) => {
    let g = gunler.get(tarih);
    if (!g) {
      g = { tarih, gelir: 0, gider: 0, dersSayisi: 0, kalemler: [] };
      gunler.set(tarih, g);
    }
    return g;
  };

  for (const d of dersler) {
    const g = gun(formatDateForInput(d.baslangic));
    g.dersSayisi += d.durum === "tamamlandi" ? 1 : 0;
    g.kalemler.push({
      tur: "ders",
      saat: formatTime(d.baslangic),
      baslik: musteriAdi.get(d.musteri_id) ?? "Müşteri",
      altBaslik: d.hak_dusuldu ? "Paketten düşüldü" : d.borc_hareket_id ? "Cariye yazıldı" : null,
      yon: "notr",
      tutar: d.ucret_kurus,
      durum: d.durum,
    });
  }
  for (const h of hareketler) {
    if (h.kaynak === "manuel" || h.kaynak === "kasa_baslangic" || h.kaynak === "kasa_dengeleme") continue;
    const g = gun(h.tarih);
    const gelirMi = h.tutar_kurus > 0;
    const tutar = Math.abs(h.tutar_kurus);
    if (gelirMi) g.gelir += tutar;
    else g.gider += tutar;
    g.kalemler.push({
      tur: h.kaynak === "musteri" ? (gelirMi ? "tahsilat" : "iade") : h.kaynak === "personel" ? "personel" : "gider",
      saat: null,
      baslik: h.kaynak === "musteri" ? (h.musteri_adi ?? "Müşteri") : h.kaynak === "gider" ? (GIDER_KATEGORI_ETIKETLERI[h.aciklama ?? ""] ?? h.aciklama ?? "Gider") : "Personel ödemesi",
      altBaslik: h.kaynak === "musteri" ? (gelirMi ? "Tahsilat" : "İade") : h.kaynak === "personel" ? h.aciklama : null,
      yon: gelirMi ? "gelir" : "gider",
      tutar,
    });
  }
  return [...gunler.values()].sort((a, b) => (a.tarih < b.tarih ? -1 : 1)).map((g) => ({ ...g, kalemler: g.kalemler.sort((x, y) => (x.saat ?? "99:99").localeCompare(y.saat ?? "99:99")) }));
}

"use client";

import { useEffect, useRef, useState } from "react";
import { toUTC } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/client";

export type MusteriSecenegi = { id: string; uye_no: number; ad_soyad: string; telefon: string };
export type DersPaketi = { id: string; paket_adi: string; kalan_hak: number | null; bitis_tarihi: string | null };
export type DoluKaynaklar = { antrenorler: Set<string>; alanlar: Set<string>; musteriler: Set<string> };

/**
 * Anahtara bağlı tek seferlik istemci sorgusu (anahtar değişince yeniden çeker, eski yanıtı yok sayar).
 * `anahtar` null ise bekler. Hata → `veri: null` (sessiz; asıl denetim veritabanında).
 * Yükleniyor durumu state'e yazılmaz, anahtar ile son sonucun anahtarı karşılaştırılarak türetilir.
 */
function useSorgu<T>(anahtar: string | null, getir: () => Promise<T>) {
  const [sonuc, setSonuc] = useState<{ anahtar: string; veri: T | null } | null>(null);
  const getirRef = useRef(getir);
  useEffect(() => {
    getirRef.current = getir;
  });

  useEffect(() => {
    if (anahtar === null) return;
    let iptal = false;
    getirRef
      .current()
      .then((veri) => {
        if (!iptal) setSonuc({ anahtar, veri });
      })
      .catch(() => {
        if (!iptal) setSonuc({ anahtar, veri: null });
      });
    return () => {
      iptal = true;
    };
  }, [anahtar]);

  const hazir = anahtar !== null && sonuc?.anahtar === anahtar;
  return { veri: hazir ? sonuc.veri : null, yukleniyor: anahtar !== null && !hazir };
}

/** Müşteri arama (ad / telefon / üye no). En az 2 karakter; aramayı yazma durunca yapar. */
export function useMusteriAra(sorgu: string) {
  const [aranan, setAranan] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setAranan(sorgu.trim()), 250);
    return () => clearTimeout(t);
  }, [sorgu]);

  const anahtar = aranan.length >= 2 ? aranan : null;
  return useSorgu<MusteriSecenegi[]>(anahtar, async () => {
    const { data, error } = await createClient().rpc("musteri_ara", { p_sorgu: aranan, p_limit: 8 });
    if (error) throw error;
    return ((data ?? []) as MusteriSecenegi[]).map(({ id, uye_no, ad_soyad, telefon }) => ({ id, uye_no, ad_soyad, telefon }));
  });
}

/** Müşterinin hâlâ hakkı olan ders paketleri (kapsam "ders", aktif, kalan hak > 0). */
export function useMusteriDersPaketleri(musteriId: string) {
  return useSorgu<DersPaketi[]>(musteriId || null, async () => {
    const { data, error } = await createClient()
      .from("uyelik")
      .select("id, paket_adi, kalan_hak, bitis_tarihi")
      .eq("musteri_id", musteriId)
      .eq("kapsam", "ders")
      .eq("durum", "aktif")
      .gt("kalan_hak", 0)
      .order("bitis_tarihi", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as DersPaketi[];
  });
}

/** Birden çok (tarih, saat) aralığı için dolu kaynakların birleşimi (periyodik ders: her gün+saatin ilk yaklaşan tarihi). */
export function useDoluKaynaklarCoklu(slotlar: { tarih: string; saat: string }[], sureDk: number) {
  const anahtar = slotlar.length > 0 && sureDk > 0 ? `${slotlar.map((s) => `${s.tarih}T${s.saat}`).join(",")}|${sureDk}` : null;
  return useSorgu<DoluKaynaklar>(anahtar, async () => {
    const birlesim: DoluKaynaklar = { antrenorler: new Set(), alanlar: new Set(), musteriler: new Set() };
    for (const s of slotlar) {
      const baslangic = toUTC(`${s.tarih}T${s.saat}:00`);
      const bitis = new Date(new Date(baslangic).getTime() + sureDk * 60_000).toISOString();
      const { data, error } = await createClient()
        .from("ders_seansi")
        .select("antrenor_id, alan_id, musteri_id")
        .lt("baslangic", bitis)
        .gt("bitis", baslangic)
        .not("durum", "in", "(iptal,gelmedi)");
      if (error) throw error;
      for (const r of (data ?? []) as { antrenor_id: string; alan_id: string; musteri_id: string }[]) {
        birlesim.antrenorler.add(r.antrenor_id);
        birlesim.alanlar.add(r.alan_id);
        birlesim.musteriler.add(r.musteri_id);
      }
    }
    return birlesim;
  });
}

/**
 * Seçilen aralıkta dolu olan antrenör, alan ve müşteriler. Veritabanındaki çakışma kısıtlarıyla AYNI kural
 * (iptal/gelmedi hariç, yarı açık aralık); asıl güvence kısıttır, bu yalnız formda yanlış seçimi önler.
 */
export function useDoluKaynaklar(tarih: string, saat: string, sureDk: number) {
  const hazir = tarih !== "" && saat !== "" && sureDk > 0;
  return useSorgu<DoluKaynaklar>(hazir ? `${tarih}T${saat}|${sureDk}` : null, async () => {
    const baslangic = toUTC(`${tarih}T${saat}:00`);
    const bitis = new Date(new Date(baslangic).getTime() + sureDk * 60_000).toISOString();
    const { data, error } = await createClient()
      .from("ders_seansi")
      .select("antrenor_id, alan_id, musteri_id")
      .lt("baslangic", bitis)
      .gt("bitis", baslangic)
      .not("durum", "in", "(iptal,gelmedi)");
    if (error) throw error;
    const satirlar = (data ?? []) as { antrenor_id: string; alan_id: string; musteri_id: string }[];
    return {
      antrenorler: new Set(satirlar.map((r) => r.antrenor_id)),
      alanlar: new Set(satirlar.map((r) => r.alan_id)),
      musteriler: new Set(satirlar.map((r) => r.musteri_id)),
    };
  });
}

"use client";

import { useEffect, useRef, useState } from "react";
import { toUTC } from "@/lib/datetime";
import type { Aralik } from "@/lib/panel/musait-saatler";
import { createClient } from "@/lib/supabase/client";

export type MusteriSecenegi = { id: string; uye_no: number; ad_soyad: string; telefon: string };
export type DersPaketi = { id: string; paket_adi: string; kalan_hak: number | null; bitis_tarihi: string | null };

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

/**
 * [basTarih, bitTarih] günleri (İstanbul, iki uç dahil) içinde seçili antrenör, alan VEYA müşterinin dersleri
 * (epoch ms aralıkları). Ders formlarındaki "Saat" seçicisi bunlarla çakışmayan başlangıçları gösterir
 * (bkz. lib/panel/musait-saatler.ts). Veritabanındaki çakışma kısıtlarıyla AYNI kural (iptal/gelmedi hariç,
 * yarı açık aralık); asıl güvence kısıttır. Hata → `veri: null` (liste boş görünür, kayıt yine DB'de denetlenir).
 */
export function useMesgulAraliklar(basTarih: string, bitTarih: string, antrenorId: string, alanId: string, musteriId: string) {
  const hazir = basTarih !== "" && bitTarih !== "" && antrenorId !== "" && alanId !== "";
  return useSorgu<Aralik[]>(hazir ? `${basTarih}|${bitTarih}|${antrenorId}|${alanId}|${musteriId}` : null, async () => {
    const bas = toUTC(`${basTarih}T00:00:00`);
    const bit = new Date(new Date(toUTC(`${bitTarih}T00:00:00`)).getTime() + 24 * 60 * 60_000).toISOString();
    const kosullar = [`antrenor_id.eq.${antrenorId}`, `alan_id.eq.${alanId}`, ...(musteriId ? [`musteri_id.eq.${musteriId}`] : [])];
    const { data, error } = await createClient()
      .from("ders_seansi")
      .select("baslangic, bitis")
      .or(kosullar.join(","))
      .lt("baslangic", bit)
      .gt("bitis", bas)
      .not("durum", "in", "(iptal,gelmedi)");
    if (error) throw error;
    return ((data ?? []) as { baslangic: string; bitis: string }[]).map((r) => ({ bas: Date.parse(r.baslangic), bit: Date.parse(r.bitis) }));
  });
}

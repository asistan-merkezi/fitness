import { cache } from "react";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { gunEkle } from "@/lib/donem";
import type { KullaniciRolu } from "@/lib/auth/gecerli-kullanici";
import { IZIN_TAKIBI_YOLU } from "@/lib/panel/izin-yollari";
import { MUSTERI_ROLLERI, PAKET_GORUNTULEME_ROLLERI, YONETICI_ROLLERI } from "@/lib/panel/roller";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type BildirimAnahtari = "izin" | "on_kayit" | "ders_talebi" | "basvuru" | "yenileme";

export type BildirimKalemi = { anahtar: BildirimAnahtari; baslik: string; aciklama: string; sayi: number; href: string };

type Tanim = {
  anahtar: BildirimAnahtari;
  baslik: string;
  aciklama: string;
  /** Antrenör gibi dar yetkili rolde farklı açıklama (kaynak o role süzülmüş gelir: RLS). */
  antrenorAciklama?: string;
  href: string;
  roller: readonly KullaniciRolu[];
  say: (supabase: Supabase) => PromiseLike<{ count: number | null }>;
};

/**
 * Üst çubuktaki zilin kaynakları (klinikteki Bildirimler düzeni, işletmeye göre): her kaynak yalnız ilgili rollere
 * görünür ve işlenmemiş (bekleyen) kayıt sayısını verir. Asıl yetki RLS'tedir; roller burada yalnız gereksiz sorguyu önler.
 * Yeni bildirim kaynağı = buraya bir satır.
 */
const TANIMLAR: Tanim[] = [
  {
    anahtar: "izin",
    baslik: "İzin talepleri",
    aciklama: "Personelin onay bekleyen izin / rapor talepleri.",
    href: IZIN_TAKIBI_YOLU,
    roller: YONETICI_ROLLERI,
    say: (s) => s.from("izin_talebi").select("id", { count: "exact", head: true }).eq("durum", "beklemede"),
  },
  {
    anahtar: "on_kayit",
    baslik: "Müşteri ön kayıtları",
    aciklama: "QR ile gelen, onay bekleyen müşteri ön kayıtları.",
    href: "/panel/musteriler/on-kayitlar",
    roller: MUSTERI_ROLLERI,
    say: (s) => s.from("musteri_on_kayit").select("id", { count: "exact", head: true }).eq("durum", "beklemede"),
  },
  {
    anahtar: "ders_talebi",
    baslik: "Ders talepleri",
    aciklama: "Müşterilerin ilettiği, yanıt bekleyen ders talepleri.",
    antrenorAciklama: "Size yönlendirilen, yanıt bekleyen ders talepleri.",
    href: "/panel/dersler",
    roller: [...MUSTERI_ROLLERI, "antrenor"],
    say: (s) => s.from("musteri_ders_talebi").select("id", { count: "exact", head: true }).eq("durum", "bekliyor"),
  },
  {
    anahtar: "basvuru",
    baslik: "İş başvuruları",
    aciklama: "Değerlendirme bekleyen personel iş başvuruları.",
    href: "/panel/finans/personel/basvurular",
    roller: YONETICI_ROLLERI,
    say: (s) => s.from("is_basvurusu").select("id", { count: "exact", head: true }).eq("durum", "beklemede"),
  },
  {
    anahtar: "yenileme",
    baslik: "Yenileme bekleyen üyelikler",
    aciklama: "Kalan hakkı 2 veya daha az ya da 7 gün içinde bitecek aktif üyelikler.",
    href: "/panel/musteriler/yenileme",
    roller: PAKET_GORUNTULEME_ROLLERI,
    say: (s) => {
      const bugun = bugunIstanbulTarihi();
      return s
        .from("uyelik_gorunum")
        .select("id", { count: "exact", head: true })
        .eq("durum", "aktif")
        .or(`and(kalan_hak.lte.2,or(bitis_tarihi.is.null,bitis_tarihi.gte.${bugun})),and(bitis_tarihi.gte.${bugun},bitis_tarihi.lte.${gunEkle(bugun, 7)})`)
        .eq("gecerli_durum", "aktif");
    },
  },
];

/** Rolün zilinde görünebilecek kaynak var mı (yoksa zil hiç çizilmez). */
export const bildirimKaynagiVarMi = (rol: KullaniciRolu | null | undefined) =>
  !!rol && (rol === "super_admin" || TANIMLAR.some((t) => t.roller.includes(rol)));

/**
 * Rolün görebildiği bekleyen bildirimler (sayısı 0 olanlar listeden çıkar) ve toplamı.
 * React cache(): layout (zil rozeti) ile Bildirimler sayfası aynı istekte tek sorgu turu yapar.
 * Sayım hatası o kaynağı 0 sayar (zil sayfayı düşürmez).
 */
export const bildirimleriGetir = cache(async (supabase: Supabase, rol: KullaniciRolu | null | undefined) => {
  const tanimlar = TANIMLAR.filter((t) => rol === "super_admin" || (!!rol && t.roller.includes(rol)));
  const sonuclar = await Promise.all(tanimlar.map((t) => t.say(supabase)));
  const kalemler: BildirimKalemi[] = tanimlar
    .map((t, i) => ({ anahtar: t.anahtar, baslik: t.baslik, aciklama: rol === "antrenor" && t.antrenorAciklama ? t.antrenorAciklama : t.aciklama, href: t.href, sayi: sonuclar[i].count ?? 0 }))
    .filter((k) => k.sayi > 0);
  return { kalemler, toplam: kalemler.reduce((t, k) => t + k.sayi, 0) };
});

import type { StatusTone } from "@/lib/ui/durum-tonlari";

/**
 * Denetim Geçmişi gösterim yardımcıları (saf fonksiyonlar). audit_log yalnız alan ADLARINI saklar; ham değer
 * (ölçüm/sağlık/PII dahil) hiçbir yerde tutulmaz, bu yüzden burada da gösterilmez.
 */
export type DenetimGrubu = "finans" | "musteri" | "uyelik" | "diger";

export const DENETIM_GRUP_ETIKETLERI: Record<DenetimGrubu, string> = {
  finans: "Finans",
  musteri: "Müşteri",
  uyelik: "Üyelik ve Giriş",
  diger: "Personel ve Diğer",
};

/** Gruplandırma AÇIK liste: tanımsız bir tablo otomatik "diger" grubuna düşer. */
export const DENETIM_GRUP_TABLOLARI: Record<Exclude<DenetimGrubu, "diger">, string[]> = {
  finans: ["musteri_bakiye_hareket"],
  musteri: ["musteri", "musteri_hassas", "musteri_veli"],
  uyelik: ["uyelik", "uyelik_paketi", "uyelik_dondurma", "giris_kaydi"],
};

export const DENETIM_TABLO_ETIKETLERI: Record<string, string> = {
  musteri_bakiye_hareket: "Cari hareket",
  musteri: "Müşteri bilgisi",
  musteri_hassas: "Müşteri sağlık bilgisi",
  musteri_veli: "Veli bilgisi",
  uyelik: "Üyelik",
  uyelik_paketi: "Üyelik paketi",
  uyelik_dondurma: "Üyelik dondurma",
  giris_kaydi: "Giriş kaydı",
  kullanici: "Personel hesabı",
  isletme: "İşletme",
};

export const DENETIM_ISLEM_ETIKETLERI: Record<string, string> = {
  INSERT: "Ekledi",
  UPDATE: "Güncelledi",
  DELETE: "Sildi",
};

export const DENETIM_ISLEM_TONLARI: Record<string, StatusTone> = {
  INSERT: "emerald",
  UPDATE: "sky",
  DELETE: "rose",
};

const ALAN_ETIKETLERI: Record<string, string> = {
  ad_soyad: "ad soyad",
  telefon: "telefon",
  eposta: "e-posta",
  dogum_tarihi: "doğum tarihi",
  tutar_kurus: "tutar",
  odeme_yontemi: "ödeme yöntemi",
  fiyat_kurus: "fiyat",
  bitis_tarihi: "bitiş tarihi",
  baslangic_tarihi: "başlangıç tarihi",
  kalan_hak: "kalan hak",
  aktif: "aktiflik",
  rol: "rol",
  iptal: "iptal",
};

/** Alan adını okunur hale getirir; bilinmeyen alan snake_case'den boşluklu yazıya çevrilir. */
export function alanEtiketi(alan: string): string {
  return ALAN_ETIKETLERI[alan] ?? alan.replace(/_/g, " ");
}

export function tabloEtiketi(tablo: string): string {
  return DENETIM_TABLO_ETIKETLERI[tablo] ?? tablo.replace(/_/g, " ");
}

/** Bilinen tabloları gruba çözer; kalan her şey "diger". */
export function tabloGrubu(tablo: string): DenetimGrubu {
  for (const grup of ["finans", "musteri", "uyelik"] as const) {
    if (DENETIM_GRUP_TABLOLARI[grup].includes(tablo)) return grup;
  }
  return "diger";
}

/** Satırın kısa özeti: "Cari hareket · ödeme yöntemi, tutar" gibi. Alan listesi boşsa yalnız tablo adı. */
export function denetimOzeti(tablo: string, alanlar: string[] | null): string {
  const ad = tabloEtiketi(tablo);
  if (!alanlar || alanlar.length === 0) return ad;
  return `${ad} · ${alanlar.map(alanEtiketi).join(", ")}`;
}

/**
 * Elle yazılmış satır tipleri (Supabase projesi açılınca `supabase gen types typescript` ile
 * üretilen tiplerle değiştirilebilir). Tutarlar KURUŞ; `bigint` kolonlar PostgREST'ten sayı olarak gelir.
 */
export type UyelikDurumu = "aktif" | "dondurulmus" | "sona_erdi" | "beklemede" | "iptal";
export type OdemeYontemi = "nakit" | "kredi_karti" | "havale";

export type MusteriSatiri = {
  id: string;
  isletme_id: string;
  uye_no: number;
  ad_soyad: string;
  telefon: string;
  eposta: string | null;
  dogum_tarihi: string | null;
  cinsiyet: "kadin" | "erkek" | "belirtilmemis";
  kategori: "standart" | "gold" | "vip" | "platinum";
  risk_bayraklari: string[];
  not_metni: string | null;
  aktif: boolean;
  created_at: string;
};

export type MusteriHassasSatiri = {
  musteri_id: string;
  tc_kimlik_no: string | null;
  il: string | null;
  ilce: string | null;
  mahalle: string | null;
  adres_detay: string | null;
  acil_durum_ad_soyad: string | null;
  acil_durum_telefon: string | null;
  saglik_bayraklari: string[];
  saglik_notu: string | null;
};

export type MusteriVeliSatiri = { ad_soyad: string; telefon: string; yakinlik: string };

export type PaketSatiri = {
  id: string;
  ad: string;
  tur: "sure" | "seans";
  sure_gun: number | null;
  seans_sayisi: number | null;
  gecerlilik_gun: number | null;
  fiyat_kurus: number;
  kdv_orani: number;
  dondurma_izni: boolean;
  azami_dondurma_gun: number;
  dondurma_ucret_kurus: number;
  satis_bitis_tarihi: string | null;
  aktif: boolean;
};

export type UyelikGorunumSatiri = {
  id: string;
  musteri_id: string;
  paket_adi: string;
  tur: "sure" | "seans";
  baslangic_tarihi: string;
  bitis_tarihi: string | null;
  toplam_hak: number | null;
  kalan_hak: number | null;
  fiyat_kurus: number;
  iskonto_kurus: number;
  dondurma_izni: boolean;
  azami_dondurma_gun: number;
  gecerli_durum: UyelikDurumu;
};

export type HareketSatiri = {
  id: string;
  tur: "borc" | "odeme" | "iade";
  tutar_kurus: number;
  iskonto_kurus: number;
  odeme_yontemi: OdemeYontemi | null;
  aciklama: string | null;
  iade_edilen_hareket_id: string | null;
  islem_tarihi: string;
  islem_zamani: string;
};

export type GirisKaydiSatiri = {
  id: string;
  musteri_id: string;
  uyelik_id: string | null;
  kaynak: string;
  sonuc: "kabul" | "red";
  red_nedeni: string | null;
  hak_dusuldu: boolean;
  zaman: string;
  iptal: boolean;
};

export type CheckInSonucu = {
  sonuc: "kabul" | "red";
  uyelik_id?: string;
  kalan_hak?: number | null;
  red_nedeni?: string;
  zaten_giris?: boolean;
  uyari?: boolean;
  giris_id?: string;
};

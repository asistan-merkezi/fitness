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
  /** giris: salona giriş hakkı (check-in düşer) · ders: yalnız PT dersi düşer. */
  kapsam: "giris" | "ders";
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

export type AlanSatiri = { id: string; ad: string; aktif: boolean };

export type EgzersizSatiri = { id: string; ad: string; ekipman: string | null; sure_dakika: number | null; aktif: boolean };

export type AntrenmanAdimiSatiri = {
  id: string;
  ad: string;
  ekipman: string | null;
  set_sayisi: number | null;
  tekrar: string | null;
  sure_dakika: number | null;
  sira: number;
};

export type AntrenmanTanimiSatiri = {
  id: string;
  ad: string;
  aciklama: string | null;
  sure_dakika: number | null;
  aktif: boolean;
  adimlar: AntrenmanAdimiSatiri[];
};

export type DersDurumu = "planlandi" | "geldi" | "gecikmeli_geldi" | "derste" | "iptal" | "gelmedi" | "ertelendi" | "tamamlandi";

export type DersSeansiSatiri = {
  id: string;
  musteri_id: string;
  antrenor_id: string;
  alan_id: string;
  baslangic: string;
  bitis: string;
  durum: DersDurumu;
  gecikme_dakika: number | null;
  ucret_kurus: number;
  uyelik_id: string | null;
  hak_dusuldu: boolean;
  borc_hareket_id: string | null;
  not_metni: string | null;
};

export type SirketBilgileri = {
  ad: string;
  unvan: string | null;
  il: string | null;
  ilce: string | null;
  mahalle: string | null;
  adres: string | null;
  vergi_dairesi: string | null;
  vergi_no: string | null;
  telefon: string | null;
  whatsapp_no: string | null;
  eposta: string | null;
  yetkili_kisi: string | null;
  yetkili_telefon: string | null;
  yetkili_eposta: string | null;
  logo_url: string | null;
  logo_url_koyu: string | null;
  hafta_ici_baslangic: string | null;
  hafta_ici_bitis: string | null;
  cumartesi_baslangic: string | null;
  cumartesi_bitis: string | null;
  pazar_baslangic: string | null;
  pazar_bitis: string | null;
};

export type AracSatiri = { id: string; marka: string; model: string; plaka: string; aktif: boolean };
export type BankaHesabiSatiri = { id: string; banka_adi: string; sube: string | null; hesap_sahibi: string; iban: string; hesap_tipi: "isletme" | "sahis"; aktif: boolean };

/** Muhasebe Sync (Paraşüt) bağlantı durumu; client secret ASLA okunmaz, yalnız `secret_tanimli` görünür. */
export type MuhasebeEntegrasyonDurum = {
  parasut_client_id: string | null;
  parasut_company_id: string | null;
  secret_tanimli: boolean;
  baglanti_durumu: "bekliyor" | "baglandi";
  updated_at: string;
};

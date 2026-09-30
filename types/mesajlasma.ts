export type MesajBolum = "musteri" | "randevu" | "personel" | "muhasebe";
export type MesajKanal = "sms" | "whatsapp" | "mail";
export type MesajKuyrukDurum = "beklemede" | "gonderiliyor" | "gonderildi" | "hata" | "iptal";
export type MesajAliciTipi = "musteri" | "personel";

export const BOLUM_ETIKET: Record<MesajBolum, string> = {
  musteri: "Müşteri",
  randevu: "Randevu",
  personel: "Personel",
  muhasebe: "Muhasebe",
};
export const BOLUM_SIRASI: MesajBolum[] = ["musteri", "randevu", "personel", "muhasebe"];

export const KANAL_ETIKET: Record<MesajKanal, string> = { sms: "SMS", whatsapp: "WhatsApp", mail: "Mail" };
export const KANAL_SIRASI: MesajKanal[] = ["sms", "whatsapp", "mail"];

export const KUYRUK_DURUM_ETIKET: Record<MesajKuyrukDurum, string> = {
  beklemede: "Beklemede",
  gonderiliyor: "Gönderiliyor",
  gonderildi: "Gönderildi",
  hata: "Hata",
  iptal: "İptal",
};

/**
 * Bir tetikleyici için veritabanında satır OLMAYABİLİR ("kayıt yoksa pasif"). Bu tip, kod kataloğu ile (varsa) veritabanı
 * satırının birleşimidir; ekranda gösterilen budur.
 */
export type EtkinMesajKurali = {
  id: string | null;
  bolum: MesajBolum;
  tetikleyici_kodu: string;
  tetikleyici_adi: string;
  mesaj_metni: string;
  sms_aktif: boolean;
  whatsapp_aktif: boolean;
  mail_aktif: boolean;
  aktif: boolean;
  zamanlama_offset_dakika: number | null;
  /** Kod tarafında henüz bir olaya bağlanmamış tetikleyici (kural kaydedilir ama mesaj üretilmez). */
  bagli: boolean;
};

export type MesajKredi = { kanal: MesajKanal; bakiye: number; updated_at: string; son_senkron_zamani: string | null; merkez_bakiye_versiyonu: number };
export type MesajKrediHareketi = { id: string; kanal: MesajKanal; miktar: number; tutar_kurus: number | null; aciklama: string | null; created_at: string };
export type MesajKuyrukSatiri = {
  id: string;
  tetikleyici_kodu: string;
  kanal: MesajKanal;
  alici_tipi: MesajAliciTipi;
  alici_adres: string;
  durum: MesajKuyrukDurum;
  deneme_sayisi: number;
  hata_mesaji: string | null;
  planlanan_zaman: string;
  gonderim_zamani: string | null;
  created_at: string;
};

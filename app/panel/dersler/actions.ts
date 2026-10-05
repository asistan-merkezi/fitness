"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dersDurumSemasi, dersOlusturSemasi, dersTasiSemasi, formVerisi, ilkHata, periyodikDersSemasi } from "@/lib/dogrulama";
import { bugunIstanbulTarihi, formatDateForInput, gunYazi, toUTC } from "@/lib/datetime";
import { gunEkle, haftaGunuIlkTarih } from "@/lib/donem";
import { basari, type EylemSonucu, hata, YETKISIZ, yetkiliOturum } from "@/lib/eylem";
import { hataMesajiCoz } from "@/lib/hata-mesajlari";
import { dersHakMesaji, dersMesaji } from "@/lib/mesaj/olaylar";
import { kurusTLyazi } from "@/lib/para";
import { dersSonucMesaji } from "@/lib/panel/ders";
import { MUSTERI_ROLLERI } from "@/lib/panel/roller";

type Onceki = EylemSonucu | null;

const DURUM_ROLLERI = [...MUSTERI_ROLLERI, "antrenor"] as const;

/** Yeni ders (yalnız yönetici/resepsiyon). Çakışma ve kurallar veritabanında zorlanır; başarıda o günün programına gidilir. */
export async function dersOlustur(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = dersOlusturSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { data: dersId, error } = await oturum.supabase.rpc("ders_seansi_olustur", {
    p_musteri_id: v.musteri_id,
    p_antrenor_id: v.antrenor_id,
    p_alan_id: v.alan_id,
    p_baslangic: v.baslangic,
    p_sure_dk: v.sure,
    p_ucret_kurus: v.ucret,
    p_not: v.not,
    p_anahtar: v.anahtar,
  });
  if (error) {
    console.error("[dersOlustur]", error.code);
    return hata(hataMesajiCoz(error));
  }

  if (dersId) await dersMesaji("olusturuldu", oturum.kullanici.isletme_id, String(dersId));
  revalidatePath("/panel/dersler");
  redirect(`/panel/dersler?gun=${formatDateForInput(v.baslangic)}&ok=olustu`);
}

/** Periyodik ders serisi süresi (hafta, ≈ 5 ay). */
const PERIYODIK_HAFTA = 22;

/**
 * Periyodik ders (yalnız yönetici/resepsiyon): seçilen gün+saat(ler)de bugünden itibaren haftalık dersler tek seferde açılır.
 * Seri tablosu yok, her ders bağımsız bir `ders_seansi`; çakışan haftalar (antrenör/alan/müşteri dolu) atlanıp mesajda sayılır.
 */
export async function periyodikDersOlustur(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = periyodikDersSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const simdi = Date.now();
  const bugun = bugunIstanbulTarihi();
  let olusan = 0;
  const atlanan: string[] = [];

  for (const { gun, saat } of v.gunler) {
    const ilk = haftaGunuIlkTarih(bugun, Number(gun));
    for (let hafta = 0; hafta < PERIYODIK_HAFTA; hafta++) {
      const tarih = gunEkle(ilk, hafta * 7);
      const baslangic = toUTC(`${tarih}T${saat}:00`);
      if (Date.parse(baslangic) <= simdi) continue; // bugünün geçmiş saati

      const { error } = await oturum.supabase.rpc("ders_seansi_olustur", {
        p_musteri_id: v.musteri_id,
        p_antrenor_id: v.antrenor_id,
        p_alan_id: v.alan_id,
        p_baslangic: baslangic,
        p_sure_dk: v.sure,
        p_ucret_kurus: v.ucret,
        p_not: v.not,
        p_anahtar: crypto.randomUUID(),
      });
      if (!error) {
        olusan++;
      } else if (/antrenor_dolu|alan_dolu|musteri_dolu|cakisma/.test(error.message ?? "")) {
        atlanan.push(gunYazi(tarih) + " " + saat);
      } else {
        console.error("[periyodikDersOlustur]", error.code);
        if (olusan > 0) revalidatePath("/panel/dersler");
        return hata(`${olusan > 0 ? `${olusan} ders açıldı, ardından hata: ` : ""}${hataMesajiCoz(error)}`);
      }
    }
  }

  revalidatePath("/panel/dersler");
  if (olusan === 0) return hata("Hiçbir ders açılamadı: seçilen saatlerin tümü dolu.");
  const ek = atlanan.length > 0 ? ` ${atlanan.length} hafta dolu olduğu için atlandı (${atlanan.slice(0, 5).join(", ")}${atlanan.length > 5 ? "…" : ""}).` : "";
  return basari(`${olusan} ders planlandı.${ek}`);
}

/** Ders durumu değiştirir; hak düşümü / cari borç veritabanındaki fonksiyonda, ders başına tek sefer işlenir. */
export async function dersDurumuDegistir(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(DURUM_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = dersDurumSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { data, error } = await oturum.supabase.rpc("ders_seansi_durum", {
    p_id: v.ders_id,
    p_durum: v.hedef,
    p_gecikme_dk: v.hedef === "gecikmeli_geldi" ? v.gecikme_dk : null,
  });
  if (error) {
    console.error("[dersDurumuDegistir]", error.code);
    return hata(hataMesajiCoz(error));
  }

  const sonuc = data as { yontem?: string | null; kalan_hak?: number | null; tutar_kurus?: number | null } | null;
  if (v.hedef === "iptal") await dersMesaji("iptal", oturum.kullanici.isletme_id, v.ders_id);
  if (sonuc?.yontem === "hak") await dersHakMesaji(oturum.kullanici.isletme_id, v.ders_id, sonuc.kalan_hak);
  revalidatePath("/panel/dersler");
  revalidatePath("/panel");
  return basari(dersSonucMesaji(data as { yontem?: string | null; kalan_hak?: number | null; tutar_kurus?: number | null } | null, kurusTLyazi));
}

/** Ertele / yeniden planla: aynı ders yeni zamana (istenirse yeni antrenör/alana) taşınır. */
export async function dersTasi(_onceki: Onceki, formData: FormData): Promise<Onceki> {
  const oturum = await yetkiliOturum(MUSTERI_ROLLERI);
  if (!oturum) return YETKISIZ;

  const ayristirma = dersTasiSemasi.safeParse(formVerisi(formData));
  if (!ayristirma.success) return hata(ilkHata(ayristirma.error));
  const v = ayristirma.data;

  const { error } = await oturum.supabase.rpc("ders_seansi_tasi", {
    p_id: v.ders_id,
    p_baslangic: v.baslangic,
    p_sure_dk: v.sure ?? undefined,
    p_antrenor_id: v.antrenor_id ?? undefined,
    p_alan_id: v.alan_id ?? undefined,
  });
  if (error) {
    console.error("[dersTasi]", error.code);
    return hata(hataMesajiCoz(error));
  }

  await dersMesaji("ertelendi", oturum.kullanici.isletme_id, v.ders_id);
  revalidatePath("/panel/dersler");
  return basari("Ders yeni zamana taşındı.");
}

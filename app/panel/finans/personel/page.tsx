import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, UserCog } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { POZISYON_SELECT, type Pozisyon } from "@/lib/panel/pozisyon";
import { FINANS_YONETIM_ROLLERI, ROL_ETIKETLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import type { KullaniciRolu } from "@/lib/auth/gecerli-kullanici";
import { PersonelListesi, type PersonelSatiri } from "./personel-listesi";
import { PersonelSekmeleri } from "./personel-sekmeleri";

export const metadata: Metadata = { title: "Personel" };

/** Personel > Liste (klinik düzeni): departman/pozisyon gruplu, aranabilir; satırda izin/maaş/bilgi eksikliği rozetleri ve bakiye. */
export default async function PersonelSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(FINANS_YONETIM_ROLLERI);
  const yonetici = kullanici.rol === "isletme_admin";
  const bugun = bugunIstanbulTarihi();

  const supabase = await createClient();
  const [{ data: kisiVeri }, { data: pozisyonVeri }, { data: profilVeri }, { data: bakiyeVeri }, { data: izinVeri }, { data: kisiselVeri }, { data: puantajVeri }] = await Promise.all([
    supabase.from("kullanici").select("id, ad_soyad, rol, aktif, pozisyon_id, telefon").neq("rol", "super_admin").order("ad_soyad"),
    supabase.from("pozisyonlar").select(POZISYON_SELECT).returns<Pozisyon[]>(),
    supabase.from("personel_profil").select("kullanici_id, maas_kurus"),
    supabase.from("personel_bakiye").select("kullanici_id, bakiye_kurus"),
    // Bugün onaylı izinde olanlar ve bekleyen talepler (yalnız yönetici okuyabilir; diğer rollerde boş döner).
    supabase.from("izin_talebi").select("kullanici_id, durum, baslangic_tarihi, bitis_tarihi").in("durum", ["onaylandi", "beklemede"]).gte("bitis_tarihi", bugun),
    // Kişisel bilgi tamlığı: özel veri, yalnız yönetici okur (diğer rollerde boş döner ve rozet gösterilmez).
    yonetici ? supabase.from("personel_kisisel").select("kullanici_id, telefon, tc_kimlik_no, dogum_tarihi, il, acil_durum_telefon") : Promise.resolve({ data: [] }),
    // Bugünkü giriş/çıkış (satır kısayollarının durumu için; yönetici ve muhasebe okur).
    supabase.from("personel_puantaj").select("kullanici_id, giris_saati, cikis_saati").eq("tarih", bugun),
  ]);

  const pozisyon = new Map(((pozisyonVeri ?? []) as Pozisyon[]).map((p) => [p.id, p]));
  const maas = new Map(((profilVeri ?? []) as { kullanici_id: string; maas_kurus: number | string }[]).map((p) => [p.kullanici_id, Number(p.maas_kurus)]));
  const bakiye = new Map(((bakiyeVeri ?? []) as { kullanici_id: string; bakiye_kurus: number | string }[]).map((b) => [b.kullanici_id, Number(b.bakiye_kurus)]));
  const kisisel = new Map(((kisiselVeri ?? []) as { kullanici_id: string; telefon: string | null; tc_kimlik_no: string | null; dogum_tarihi: string | null; il: string | null; acil_durum_telefon: string | null }[]).map((k) => [k.kullanici_id, k]));
  const bilgiTam = (id: string) => {
    const k = kisisel.get(id);
    return Boolean(k?.telefon && k.tc_kimlik_no && k.dogum_tarihi && k.il && k.acil_durum_telefon);
  };
  const bugunPuantaj = new Map(((puantajVeri ?? []) as { kullanici_id: string; giris_saati: string | null; cikis_saati: string | null }[]).map((r) => [r.kullanici_id, r]));
  const izinliler = new Set<string>();
  const bekleyen = new Map<string, number>();
  for (const i of (izinVeri ?? []) as { kullanici_id: string; durum: string; baslangic_tarihi: string; bitis_tarihi: string }[]) {
    if (i.durum === "onaylandi" && i.baslangic_tarihi <= bugun && i.bitis_tarihi >= bugun) izinliler.add(i.kullanici_id);
    if (i.durum === "beklemede") bekleyen.set(i.kullanici_id, (bekleyen.get(i.kullanici_id) ?? 0) + 1);
  }

  const satirlar: PersonelSatiri[] = ((kisiVeri ?? []) as { id: string; ad_soyad: string; rol: KullaniciRolu; aktif: boolean; pozisyon_id: string | null; telefon: string | null }[]).map((k) => {
    const poz = k.pozisyon_id ? pozisyon.get(k.pozisyon_id) : undefined;
    return {
      id: k.id,
      ad_soyad: k.ad_soyad,
      rolEtiketi: ROL_ETIKETLERI[k.rol],
      telefon: k.telefon,
      aktif: k.aktif,
      pozisyonGrup: poz?.grup ?? null,
      pozisyonAd: poz?.ad ?? null,
      pozisyonSira: poz?.sira ?? null,
      maasKurus: yonetici ? (maas.get(k.id) ?? null) : null,
      maasTanimli: maas.has(k.id),
      bakiyeKurus: bakiye.get(k.id) ?? 0,
      bugunIzinli: izinliler.has(k.id),
      bekleyenIzin: bekleyen.get(k.id) ?? 0,
      bilgiEksik: yonetici && k.aktif && !bilgiTam(k.id),
      bugunGiris: bugunPuantaj.get(k.id)?.giris_saati?.slice(0, 5) ?? null,
      bugunCikis: bugunPuantaj.get(k.id)?.cikis_saati?.slice(0, 5) ?? null,
    };
  });

  return (
    <>
      <PageHeader
        title="Personel"
        description="Çalışanlar, izin ve maaş durumu. Bir satıra tıklayınca personel kartı açılır."
        icon={UserCog}
        actions={
          yonetici ? (
            <>
              <Link href="/panel/ayarlar/personel?sekme=hesaplar" className={buttonVariants({ variant: "outline" })}>
                Personel Hesapları
              </Link>
              <Link href="/panel/finans/personel/basvurular" className={buttonVariants()}>
                <Briefcase aria-hidden /> İş Başvurusu Ekle
              </Link>
            </>
          ) : undefined
        }
      />
      <PersonelSekmeleri aktif="liste" />
      {satirlar.length === 0 ? <EmptyState icon={UserCog} title="Henüz personel yok" description="Ayarlar > Personel Tanımlama'dan personel hesabı oluşturun." /> : <PersonelListesi personel={satirlar} yonetici={yonetici} />}
    </>
  );
}

import Link from "next/link";
import { Briefcase, UsersRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { atanabilirPozisyonlar, POZISYON_SELECT, type Pozisyon } from "@/lib/panel/pozisyon";
import { ROL_ETIKETLERI, YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { KullaniciRolu } from "@/lib/auth/gecerli-kullanici";
import { OzelPozisyonFormu, PersonelEkleFormu, PersonelSatiriFormu } from "./personel-formlari";
import { PozisyonListesi } from "./pozisyon-listesi";

type KullaniciListeSatiri = { id: string; ad_soyad: string; rol: KullaniciRolu; aktif: boolean; pozisyon_id: string | null };

const SEKMELER = [
  { kod: "pozisyonlar", etiket: "Pozisyonlar" },
  { kod: "hesaplar", etiket: "Personel Hesapları" },
] as const;

export default async function PersonelSayfasi({ searchParams }: { searchParams: Promise<{ sekme?: string }> }) {
  const { authUser, kullanici } = await sayfaYetkisiIste(YONETICI_ROLLERI);
  const { sekme: sekmeParam } = await searchParams;
  const sekme = sekmeParam === "hesaplar" ? "hesaplar" : "pozisyonlar";

  const supabase = await createClient();
  const [pozisyonSonuc, kullaniciSonuc] = await Promise.all([
    supabase.from("pozisyonlar").select(POZISYON_SELECT).eq("isletme_id", kullanici.isletme_id).returns<Pozisyon[]>(),
    supabase.from("kullanici").select("id, ad_soyad, rol, aktif, pozisyon_id").eq("isletme_id", kullanici.isletme_id).order("ad_soyad"),
  ]);
  const pozisyonlar = pozisyonSonuc.data ?? [];
  const liste = (kullaniciSonuc.data ?? []) as KullaniciListeSatiri[];
  const pozisyonAdi = new Map(pozisyonlar.map((p) => [p.id, p.ad]));

  const calisanSayilari: Record<string, number> = {};
  for (const k of liste) if (k.aktif && k.pozisyon_id) calisanSayilari[k.pozisyon_id] = (calisanSayilari[k.pozisyon_id] ?? 0) + 1;

  // Özel pozisyon için departman listesi mevcut pozisyonların gruplarından türetilir (katalog değişirse kendiliğinden güncellenir).
  const departmanSirasi = new Map<string, number>();
  for (const p of pozisyonlar) departmanSirasi.set(p.grup, Math.min(departmanSirasi.get(p.grup) ?? p.sira, p.sira));
  const departmanlar = [...departmanSirasi.entries()].sort((a, b) => a[1] - b[1]).map(([grup]) => grup);

  return (
    <>
      <PageHeader
        title="Personel Tanımlama"
        description="İşletmede çalışılan departman ve unvanları seçin; aktif olanlar personel hesabı açarken kullanılır. Sistem erişimi olmayan unvanlara hesap atanamaz."
        icon={UsersRound}
      />

      <nav aria-label="Personel Tanımlama bölümleri" className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {SEKMELER.map((s) => (
          <Link
            key={s.kod}
            href={`/panel/ayarlar/personel?sekme=${s.kod}`}
            aria-current={sekme === s.kod ? "page" : undefined}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", sekme === s.kod ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {s.etiket}
          </Link>
        ))}
      </nav>

      {sekme === "pozisyonlar" && (
        <>
          <OzelPozisyonFormu departmanlar={departmanlar} />
          {pozisyonlar.length === 0 ? <EmptyState icon={Briefcase} title="Henüz pozisyon tanımlı değil." /> : <PozisyonListesi pozisyonlar={pozisyonlar} calisanSayilari={calisanSayilari} duzenlenebilir />}
        </>
      )}

      {sekme === "hesaplar" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Yeni personel</CardTitle>
              <CardDescription>Hesap oluşturulur; personel e-posta ve geçici şifreyle giriş yapar. Pozisyon seçilirse rol pozisyondan gelir.</CardDescription>
            </CardHeader>
            <CardContent>
              <PersonelEkleFormu pozisyonlar={atanabilirPozisyonlar(pozisyonlar)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Personel listesi</CardTitle>
              <CardDescription>Pasife alınan personelin oturum açması engellenir; kayıtları silinmez.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border">
              {liste.map((k) => (
                <div key={k.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{k.ad_soyad}</span>
                    <StatusBadge tone="primary">{ROL_ETIKETLERI[k.rol]}</StatusBadge>
                    {k.pozisyon_id && pozisyonAdi.get(k.pozisyon_id) && <StatusBadge tone="sky">{pozisyonAdi.get(k.pozisyon_id)}</StatusBadge>}
                    {!k.aktif && <StatusBadge tone="slate">Pasif</StatusBadge>}
                  </div>
                  <PersonelSatiriFormu
                    kullaniciId={k.id}
                    rol={k.rol}
                    aktif={k.aktif}
                    pozisyonId={k.pozisyon_id}
                    pozisyonlar={atanabilirPozisyonlar(pozisyonlar, k.pozisyon_id)}
                    benMiyim={k.id === authUser.id}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

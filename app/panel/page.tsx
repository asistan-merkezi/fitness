import Link from "next/link";
import { DoorOpen, LayoutDashboard, Link2Off, TriangleAlert, Users, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { bugunIstanbulTarihi, gunYazi } from "@/lib/datetime";
import { gunDonemi, gunEkle } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { FINANS_ROLLERI, MUSTERI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import type { UyelikGorunumSatiri } from "@/types/veritabani";

export default async function PanelAnaSayfa() {
  const oturum = await gecerliKullanici();
  const kullanici = oturum?.kullanici ?? null;

  if (!kullanici?.isletme_id || !kullanici.rol) {
    return (
      <>
        <PageHeader title="Panel" description="Fitness Asistanı yönetim paneli" icon={LayoutDashboard} />
        <EmptyState
          icon={Link2Off}
          title="Hesabınız henüz bir işletmeye bağlı değil"
          description="Bir yönetici hesabınızı bir işletmeye bağladığında panel modülleri burada görünür."
        />
      </>
    );
  }

  const rol = kullanici.rol;
  const musteriYetkisi = (MUSTERI_ROLLERI as readonly string[]).includes(rol);
  const finansYetkisi = (FINANS_ROLLERI as readonly string[]).includes(rol);

  if (!musteriYetkisi && !finansYetkisi) {
    return (
      <>
        <PageHeader title="Panel" description="Fitness Asistanı yönetim paneli" icon={LayoutDashboard} />
        <EmptyState icon={LayoutDashboard} title="Antrenör ekranları yakında" description="Ders, müşteri ölçümü ve program modülleri sonraki aşamalarda eklenecek." />
      </>
    );
  }

  const supabase = await createClient();
  const bugun = bugunIstanbulTarihi();
  const hafta = gunEkle(bugun, 7);
  const donem = gunDonemi(bugun);

  const [girisSonuc, aktifSonuc, yaklasanSonuc, kasaSonuc, alacakSonuc] = await Promise.all([
    musteriYetkisi
      ? supabase.from("giris_kaydi").select("id", { count: "exact", head: true }).eq("giris_tarihi", bugun).eq("sonuc", "kabul").eq("iptal", false)
      : Promise.resolve(null),
    finansYetkisi ? supabase.from("uyelik_gorunum").select("id", { count: "exact", head: true }).eq("gecerli_durum", "aktif") : Promise.resolve(null),
    finansYetkisi
      ? supabase
          .from("uyelik_gorunum")
          .select("id, musteri_id, paket_adi, tur, bitis_tarihi, kalan_hak")
          .eq("gecerli_durum", "aktif")
          .or(`kalan_hak.lte.2,bitis_tarihi.lte.${hafta}`)
          .order("bitis_tarihi", { ascending: true, nullsFirst: false })
          .limit(10)
      : Promise.resolve(null),
    finansYetkisi ? supabase.rpc("kasa_ozet", { p_baslangic: donem.baslangicTarih, p_bitis: donem.bitisTarih }) : Promise.resolve(null),
    finansYetkisi ? supabase.from("cari_alacak").select("borc_kurus") : Promise.resolve(null),
  ]);

  const yaklasan = (yaklasanSonuc?.data ?? []) as Pick<UyelikGorunumSatiri, "id" | "musteri_id" | "paket_adi" | "tur" | "bitis_tarihi" | "kalan_hak">[];
  const adHaritasi = new Map<string, string>();
  if (yaklasan.length) {
    const { data } = await supabase.from("musteri_ozet").select("id, ad_soyad").in("id", [...new Set(yaklasan.map((u) => u.musteri_id))]);
    for (const m of (data ?? []) as { id: string; ad_soyad: string }[]) adHaritasi.set(m.id, m.ad_soyad);
  }

  const netTahsilat = ((kasaSonuc?.data ?? []) as { net_kurus: number }[]).reduce((t, k) => t + Number(k.net_kurus), 0);
  const toplamAlacak = ((alacakSonuc?.data ?? []) as { borc_kurus: number }[]).reduce((t, a) => t + Number(a.borc_kurus), 0);

  return (
    <>
      <PageHeader title="Panel" description={`Bugün · ${gunYazi(bugun)}`} icon={LayoutDashboard} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {musteriYetkisi && <KpiCard label="Bugünkü giriş" value={girisSonuc?.count ?? 0} icon={DoorOpen} />}
        {finansYetkisi && <KpiCard label="Aktif üyelik" value={aktifSonuc?.count ?? 0} icon={Users} />}
        {finansYetkisi && <KpiCard label="Bugün net tahsilat" value={kurusTLyazi(netTahsilat)} icon={Wallet} />}
        {finansYetkisi && <KpiCard label="Açık alacak" value={kurusTLyazi(toplamAlacak)} icon={TriangleAlert} iconTone="amber" />}
      </div>

      {finansYetkisi && (
        <Card>
          <CardHeader>
            <CardTitle>Yenileme bekleyenler</CardTitle>
            <CardDescription>Kalan hakkı 2 veya daha az, ya da 7 gün içinde bitecek aktif üyelikler.</CardDescription>
          </CardHeader>
          <CardContent>
            {yaklasan.length === 0 ? (
              <EmptyState compact title="Yenileme bekleyen üyelik yok." />
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {yaklasan.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div>
                      {musteriYetkisi ? (
                        <Link href={`/panel/musteriler/${u.musteri_id}`} className="font-medium hover:underline">
                          {adHaritasi.get(u.musteri_id) ?? "Müşteri"}
                        </Link>
                      ) : (
                        <span className="font-medium">{adHaritasi.get(u.musteri_id) ?? "Müşteri"}</span>
                      )}
                      <span className="ml-2 text-muted-foreground">{u.paket_adi}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {u.kalan_hak !== null && u.kalan_hak <= 2 && <StatusBadge tone="amber">{u.kalan_hak} hak kaldı</StatusBadge>}
                      {u.bitis_tarihi && u.bitis_tarihi <= hafta && <StatusBadge tone="amber">Bitiş {gunYazi(u.bitis_tarihi)}</StatusBadge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

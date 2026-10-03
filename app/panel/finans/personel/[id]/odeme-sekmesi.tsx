import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bugunIstanbulTarihi, gunYazi, toUTC } from "@/lib/datetime";
import { donemCoz, gunEkle } from "@/lib/donem";
import { kurusTLyazi } from "@/lib/para";
import { PERSONEL_HAREKET_TURLERI } from "@/lib/panel/etiketler";
import { hakedisArtirirMi } from "@/lib/panel/personel-odeme";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { ProfilFormu } from "../formlar";
import { OdemeEkleDiyalog } from "../odeme-diyalog";

type Profil = { maas_kurus: number; ders_prim_kurus: number; ise_giris_tarihi: string | null; isten_cikis_tarihi: string | null };
type Hareket = { id: string; tur: keyof typeof PERSONEL_HAREKET_TURLERI; tutar_kurus: number | string; donem: string | null; odeme_yontemi: string | null; aciklama: string | null; islem_tarihi: string };
type Hesap = { kullanici_id: string; calisilan_gun: number; toplam_gun: number; taban_kurus: number | string; ders_sayisi: number; prim_kurus: number | string; toplam_kurus: number | string; kapali: boolean };
type UcretSatiri = { id: string; maas_kurus: number | string; ders_prim_kurus: number | string; gecerlilik_tarihi: string };

/** Taban dışı, elle girilen ek kalemler (hakedişe EKLENEN türler) — kesinti düşer. */
const EK_ARTI = ["prim_manuel", "yol", "yemek", "mesai"];

/**
 * Personel kartı > Ödemeler (klinik düzeni): Performans (antrenör) · Cari Hesap (Ödeme Ekle, bakiye, ay gezintili hareketler) ·
 * Maaş Hesabı — ay · Maaş Ayarları · Maaş Geçmişi. Ay `?ay=YYYY-MM`; varsayılan içinde bulunulan ay.
 */
export async function OdemeSekmesi({
  id,
  adSoyad,
  rol,
  yonetici,
  profil,
  bakiye,
  otomatikAc,
  ayParam,
}: {
  id: string;
  adSoyad: string;
  rol: string;
  yonetici: boolean;
  profil: Profil | null;
  bakiye: { hak: number; odenen: number; kalan: number };
  otomatikAc: boolean;
  ayParam?: string;
}) {
  const supabase = await createClient();
  const bugun = bugunIstanbulTarihi();
  const donem = donemCoz({ gorunum: "ay", tarih: ayParam });
  const buAy = bugun.slice(0, 7);
  const baglanti = (p: string) => `/panel/finans/personel/${id}?sekme=odeme&ay=${p}`;

  const performansGoster = yonetici && rol === "antrenor";
  const haftaBas = gunEkle(bugun, -((new Date(`${bugun}T12:00:00Z`).getUTCDay() + 6) % 7));
  const dersSay = async (bas: string, bit: string) => {
    const { count } = await supabase
      .from("ders_seansi")
      .select("id", { count: "exact", head: true })
      .eq("antrenor_id", id)
      .eq("durum", "tamamlandi")
      .gte("baslangic", toUTC(`${bas}T00:00:00`))
      .lt("baslangic", toUTC(`${bit}T00:00:00`));
    return count ?? 0;
  };

  const [{ data: hareketVeri }, { data: bankaVeri }, { data: hesapVeri }, { data: ucretVeri }, gunDers, haftaDers, aySayisi] = await Promise.all([
    supabase
      .from("personel_hesap_hareket")
      .select("id, tur, tutar_kurus, donem, odeme_yontemi, aciklama, islem_tarihi")
      .eq("kullanici_id", id)
      .gte("islem_tarihi", donem.baslangicTarih)
      .lt("islem_tarihi", donem.bitisTarih)
      .order("islem_tarihi", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.rpc("banka_hesap_secenekleri"),
    supabase.rpc("personel_hakedis_hesapla", { p_ay: `${donem.param}-01` }),
    supabase.from("personel_ucret_gecmisi").select("id, maas_kurus, ders_prim_kurus, gecerlilik_tarihi").eq("kullanici_id", id).order("created_at", { ascending: false }).limit(24),
    performansGoster ? dersSay(bugun, gunEkle(bugun, 1)) : Promise.resolve(0),
    performansGoster ? dersSay(haftaBas, gunEkle(haftaBas, 7)) : Promise.resolve(0),
    performansGoster ? dersSay(`${buAy}-01`, gunEkle(bugun, 1)) : Promise.resolve(0),
  ]);

  const hareketler = (hareketVeri ?? []) as Hareket[];
  const hesap = ((hesapVeri ?? []) as Hesap[]).find((h) => h.kullanici_id === id) ?? null;
  const ucretler = (ucretVeri ?? []) as UcretSatiri[];
  const donemAvansi = hareketler.filter((h) => h.tur === "avans").reduce((t, h) => t + Number(h.tutar_kurus), 0);
  const ekNet =
    hareketler.filter((h) => EK_ARTI.includes(h.tur)).reduce((t, h) => t + Number(h.tutar_kurus), 0) - hareketler.filter((h) => h.tur === "kesinti").reduce((t, h) => t + Number(h.tutar_kurus), 0);

  return (
    <>
      {performansGoster && (
        <Card>
          <CardHeader>
            <CardTitle>Performans</CardTitle>
            <CardDescription>Tamamlanan ders sayısı.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                ["Bugün", gunDers],
                ["Bu hafta", haftaDers],
                ["Bu ay", aySayisi],
              ].map(([etiket, adet]) => (
                <div key={String(etiket)}>
                  <p className="text-2xl font-semibold tabular-nums">{adet}</p>
                  <p className="text-xs text-muted-foreground">{etiket}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>Cari Hesap</CardTitle>
            <CardDescription>Kayıtlar değiştirilemez; hatalı kayıt için ters yönde yeni kayıt girin.</CardDescription>
          </div>
          <OdemeEkleDiyalog
            sabitPersonelId={id}
            satirlar={[{ id, adSoyad, gorev: "", bakiyeKurus: bakiye.kalan, maasKurus: profil ? Number(profil.maas_kurus) : null, buAykiAvansKurus: donemAvansi }]}
            hesaplar={(bankaVeri ?? []) as { id: string; ad: string }[]}
            bugun={bugun}
            otomatikAc={otomatikAc}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface-2 p-3">
            <span className="text-xs text-muted-foreground">Bakiye (işletmenin borcu)</span>
            <span className={cn("text-xl font-semibold tabular-nums", bakiye.kalan < 0 && "text-destructive")}>{kurusTLyazi(bakiye.kalan)}</span>
            <span className="text-xs text-muted-foreground">
              Toplam hakediş: {kurusTLyazi(bakiye.hak)} · Ödenen/kesinti/avans: {kurusTLyazi(bakiye.odenen)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Hareketler — {donem.etiket}</h3>
            <div className="flex items-center gap-2">
              <Link href={baglanti(donem.oncekiParam)} aria-label="Önceki ay" className={buttonVariants({ variant: "outline", size: "icon" })}>
                <ChevronLeft aria-hidden />
              </Link>
              <Link href={baglanti(buAy)} className={buttonVariants({ variant: donem.param === buAy ? "default" : "outline", size: "sm" })}>
                Bu Ay
              </Link>
              <Link href={baglanti(donem.sonrakiParam)} aria-label="Sonraki ay" className={buttonVariants({ variant: "outline", size: "icon" })}>
                <ChevronRight aria-hidden />
              </Link>
            </div>
          </div>

          {hareketler.length === 0 ? (
            <EmptyState compact title="Bu ay için hareket yok. Dönem kapatılınca hakediş satırları burada görünür." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead>Açıklama</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hareketler.map((h) => {
                  const tur = PERSONEL_HAREKET_TURLERI[h.tur];
                  const gelir = hakedisArtirirMi(h.tur);
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{gunYazi(h.islem_tarihi)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={tur.ton}>{tur.etiket}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {h.donem ? `${h.donem.slice(0, 7)} · ` : ""}
                        {h.aciklama ?? (h.odeme_yontemi === "nakit" ? "Nakit" : h.odeme_yontemi === "havale" ? "Havale / EFT" : "")}
                      </TableCell>
                      <TableCell className={gelir ? "text-right font-semibold tabular-nums" : "text-right font-semibold text-destructive tabular-nums"}>
                        {gelir ? "+" : "−"}
                        {kurusTLyazi(Number(h.tutar_kurus))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>Maaş Hesabı — {donem.etiket}</CardTitle>
            <CardDescription>Sabit maaş (gün oranlı) + tamamlanan ders primi + bu ayın ek kalemleri (prim, yol, yemek, fazla mesai; kesinti düşer).</CardDescription>
          </div>
          {hesap && <StatusBadge tone={hesap.kapali ? "emerald" : "amber"}>{hesap.kapali ? "Dönem kapalı" : donem.param < buAy ? "Kapatılmadı" : "Tahmini"}</StatusBadge>}
        </CardHeader>
        <CardContent>
          {!hesap && ekNet === 0 ? (
            <EmptyState compact title="Bu ay için hakediş hesabı yok." />
          ) : (
            <dl className="flex flex-col gap-2 text-sm">
              {hesap && (
                <>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">
                      Taban ({hesap.calisilan_gun}/{hesap.toplam_gun} gün)
                    </dt>
                    <dd className="tabular-nums">{kurusTLyazi(Number(hesap.taban_kurus))}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Ders primi ({hesap.ders_sayisi} ders)</dt>
                    <dd className="tabular-nums">{kurusTLyazi(Number(hesap.prim_kurus))}</dd>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Ek kalemler (net)</dt>
                <dd className="tabular-nums">{kurusTLyazi(ekNet)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
                <dt>Toplam</dt>
                <dd className="tabular-nums">{kurusTLyazi(Number(hesap?.toplam_kurus ?? 0) + ekNet)}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Maaş Ayarları</CardTitle>
          <CardDescription>
            {profil
              ? `Çalışma: ${profil.ise_giris_tarihi ? gunYazi(profil.ise_giris_tarihi) : "—"} → ${profil.isten_cikis_tarihi ? gunYazi(profil.isten_cikis_tarihi) : "devam ediyor"}`
              : "Henüz maaş tanımlanmamış."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {yonetici ? (
            <ProfilFormu kullaniciId={id} profil={profil} />
          ) : profil ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Aylık sabit maaş</dt>
                <dd className="font-semibold tabular-nums">{kurusTLyazi(Number(profil.maas_kurus))}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ders başı prim</dt>
                <dd className="font-semibold tabular-nums">{kurusTLyazi(Number(profil.ders_prim_kurus))}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Maaş bilgisi işletme yöneticisi tarafından girilir.</p>
          )}
        </CardContent>
      </Card>

      {ucretler.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Maaş Geçmişi</CardTitle>
            <CardDescription>Maaş veya ders başı prim her değiştiğinde yeni satır eklenir; eski kayıtlar silinmez. Geçmiş dönem hakedişleri defterdeki kapalı tutarlardır.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border">
              {ucretler.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-muted-foreground tabular-nums">{gunYazi(u.gecerlilik_tarihi)} itibarıyla</span>
                  <span className="font-medium tabular-nums">
                    Maaş {kurusTLyazi(Number(u.maas_kurus))} · Ders başı prim {kurusTLyazi(Number(u.ders_prim_kurus))}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}

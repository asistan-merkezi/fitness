import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gunYazi } from "@/lib/datetime";
import { CALISMA_TIPLERI, CINSIYETLER, PERSONEL_BELGE_TURU } from "@/lib/panel/etiketler";
import { createClient } from "@/lib/supabase/server";
import { telefonGoster } from "@/lib/utils";
import { BELGE_UYARI_GUN, belgeDurumu } from "./belge-yardimcilari";
import { KisiselDuzenleDiyalog } from "./kisisel-duzenle";
import { BelgeEkleFormu, BelgeKaldirButonu, type KisiselBilgi } from "./kisisel-formlari";

export type Belge = { id: string; tur: string; ad: string; veren_kurum: string | null; belge_no: string | null; verilis_tarihi: string | null; gecerlilik_bitis: string | null; not_metni: string | null };

const KOLONLAR = "telefon, dogum_tarihi, tc_kimlik_no, il, ilce, mahalle, adres_detay, acil_durum_ad_soyad, acil_durum_telefon, dogum_yeri, cinsiyet, pasaport_no, sgk_sicil_no, calisma_tipi";

/** T.C. kimlik / pasaport: son 2 hane dışında maskelenir (ekranda tam değer gösterilmez; düzenleme penceresinde yönetici görür). */
const maske = (v: string | null) => (v ? `${"•".repeat(Math.max(v.length - 2, 0))}${v.slice(-2)}` : "Kayıtlı değil");

function Satir({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{etiket}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/**
 * Personel kartı > Kişisel Bilgiler (klinik düzeni, yalnız yönetici): salt-okunur özet + "Düzenle" penceresi (tek form), altında belge kayıtları.
 * T.C./pasaport özette maskelidir. Özel nitelikli veri: yalnız işletme yöneticisi görür.
 */
export async function KisiselSekmesi({ id, belgeler, bugun, pozisyonAdi, rolEtiketi, aktif }: { id: string; belgeler: Belge[]; bugun: string; pozisyonAdi: string | null; rolEtiketi: string; aktif: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase.from("personel_kisisel").select(KOLONLAR).eq("kullanici_id", id).maybeSingle<KisiselBilgi>();
  const k = data ?? null;
  const adres = [k?.mahalle, k?.ilce, k?.il].filter(Boolean).join(" / ");

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>Kişisel Bilgiler</CardTitle>
            <CardDescription>T.C. kimlik no, adres ve acil durum kişisi özel nitelikli kişisel veridir; yalnız işletme yöneticisi görür.</CardDescription>
          </div>
          <KisiselDuzenleDiyalog kullaniciId={id} bilgi={k} />
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-3 text-sm">
            <Satir etiket="Pozisyon">{pozisyonAdi ?? "—"}</Satir>
            <Satir etiket="Rol">{rolEtiketi}</Satir>
            <Satir etiket="Telefon">{k?.telefon ? telefonGoster(k.telefon) : "—"}</Satir>
            <Satir etiket="Durum">{aktif ? "Aktif" : "Pasif"}</Satir>
            <div className="border-t border-border pt-3">
              <Satir etiket="Doğum tarihi / yeri">
                {k?.dogum_tarihi ? gunYazi(k.dogum_tarihi) : "—"}
                {k?.dogum_yeri ? ` · ${k.dogum_yeri}` : ""}
              </Satir>
            </div>
            <Satir etiket="Cinsiyet">{k?.cinsiyet ? CINSIYETLER[k.cinsiyet as keyof typeof CINSIYETLER] : "—"}</Satir>
            <Satir etiket="Çalışma tipi">{k?.calisma_tipi ? CALISMA_TIPLERI[k.calisma_tipi as keyof typeof CALISMA_TIPLERI] : "—"}</Satir>
            <Satir etiket="SGK sicil no">{k?.sgk_sicil_no ?? "—"}</Satir>
            <div className="border-t border-border pt-3">
              <Satir etiket="T.C. kimlik no">{maske(k?.tc_kimlik_no ?? null)}</Satir>
            </div>
            <Satir etiket="Pasaport no">{maske(k?.pasaport_no ?? null)}</Satir>
            <div className="flex flex-col gap-1 border-t border-border pt-3">
              <dt className="text-muted-foreground">Adres</dt>
              <dd>
                {adres || "—"}
                {k?.adres_detay && <span className="block text-muted-foreground">{k.adres_detay}</span>}
              </dd>
            </div>
            <Satir etiket="Acil durum kişisi">{k?.acil_durum_ad_soyad ? `${k.acil_durum_ad_soyad} · ${telefonGoster(k.acil_durum_telefon)}` : "—"}</Satir>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Belgeler</CardTitle>
          <CardDescription>Sertifika, ilk yardım, sağlık raporu ve sözleşme kayıtları. Süresi {BELGE_UYARI_GUN} gün içinde dolan belgeler uyarı alır.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {belgeler.length === 0 ? (
            <EmptyState compact title="Henüz belge kaydı yok." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Belge</TableHead>
                  <TableHead>Veren kurum</TableHead>
                  <TableHead>Geçerlilik</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {belgeler.map((b) => {
                  const durum = belgeDurumu(b.gecerlilik_bitis, bugun);
                  return (
                    <TableRow key={b.id}>
                      <TableCell>
                        <p className="font-medium">{b.ad}</p>
                        <p className="text-xs text-muted-foreground">
                          {PERSONEL_BELGE_TURU[b.tur] ?? b.tur}
                          {b.belge_no ? ` · No: ${b.belge_no}` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{b.veren_kurum ?? "—"}</TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="tabular-nums">{b.gecerlilik_bitis ? gunYazi(b.gecerlilik_bitis) : "Süresiz"}</span>
                          {durum === "doldu" && <StatusBadge tone="rose">Süresi doldu</StatusBadge>}
                          {durum === "yaklasiyor" && <StatusBadge tone="amber">Yakında dolacak</StatusBadge>}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <BelgeKaldirButonu kullaniciId={id} belgeId={b.id} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <BelgeEkleFormu kullaniciId={id} />
        </CardContent>
      </Card>
    </>
  );
}

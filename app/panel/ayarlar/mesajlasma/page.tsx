import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle, MessageSquareText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { formatDateTime } from "@/lib/datetime";
import { etkinKurallariOlustur, type MesajKuraliDbSatiri } from "@/lib/mesaj/kural-cozumle";
import { merkezYapilandirildiMi } from "@/lib/mesaj/merkez-client";
import { tetikleyiciGetir } from "@/lib/mesaj/tetikleyiciler";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";
import type { StatusTone } from "@/lib/ui/durum-tonlari";
import { BOLUM_ETIKET, BOLUM_SIRASI, type EtkinMesajKurali, KANAL_ETIKET, KANAL_SIRASI, KUYRUK_DURUM_ETIKET, type MesajBolum, type MesajKredi, type MesajKuyrukDurum, type MesajKuyrukSatiri } from "@/types/mesajlasma";
import { KuralSatiri } from "./kural-satiri";

export const metadata: Metadata = { title: "SMS/Whatsapp/Mail Ayarları" };

const KANAL_IKON = { sms: MessageSquareText, whatsapp: MessageCircle, mail: Mail } as const;
const DURUM_TONU: Record<MesajKuyrukDurum, StatusTone> = { beklemede: "amber", gonderiliyor: "sky", gonderildi: "emerald", hata: "rose", iptal: "slate" };

export default async function MesajlasmaSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(YONETICI_ROLLERI);
  const supabase = await createClient();

  const [{ data: kuralVeri }, { data: krediVeri }, { data: kuyrukVeri }] = await Promise.all([
    supabase.from("mesaj_kurali").select("id, tetikleyici_kodu, aktif, sms_aktif, whatsapp_aktif, mail_aktif, mesaj_metni, zamanlama_offset_dakika").eq("isletme_id", kullanici.isletme_id),
    supabase.from("mesaj_kredi").select("kanal, bakiye, updated_at, son_senkron_zamani, merkez_bakiye_versiyonu").eq("isletme_id", kullanici.isletme_id),
    supabase.from("mesaj_kuyrugu").select("id, tetikleyici_kodu, kanal, alici_tipi, alici_adres, durum, deneme_sayisi, hata_mesaji, planlanan_zaman, gonderim_zamani, created_at").order("created_at", { ascending: false }).limit(15),
  ]);

  const kurallar = etkinKurallariOlustur((kuralVeri ?? []) as MesajKuraliDbSatiri[]);
  const bakiyeler = new Map(((krediVeri ?? []) as MesajKredi[]).map((k) => [k.kanal, k.bakiye]));
  const kuyruk = (kuyrukVeri ?? []) as MesajKuyrukSatiri[];
  const bagli = merkezYapilandirildiMi();

  const gruplar = new Map<MesajBolum, EtkinMesajKurali[]>();
  for (const bolum of BOLUM_SIRASI) gruplar.set(bolum, []);
  for (const k of kurallar) gruplar.get(k.bolum)?.push(k);

  return (
    <>
      <PageHeader
        title="SMS/Whatsapp/Mail Ayarları"
        description="İşletmede tetiklenen olaylarda (müşteri, randevu, personel, muhasebe) hangi kanaldan bildirim gönderileceğini yapılandırın. Gönderim kredi bazlıdır; kredi biterse ilgili kanaldan gönderim yapılmaz."
        icon={MessageCircle}
      />

      {!bagli && (
        <p role="status" className="rounded-lg border border-warning-border bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
          Mesaj altyapısı (Asistan Merkezi) henüz bağlı değil. Kurallarınızı şimdiden kaydedebilirsiniz; mesajlar sıraya alınır ve altyapı bağlandığında gönderilir.
        </p>
      )}

      <section aria-label="Kanal kredileri" className="grid gap-4 sm:grid-cols-3">
        {KANAL_SIRASI.map((kanal) => {
          const Ikon = KANAL_IKON[kanal];
          return (
            <Card key={kanal}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Ikon className="size-4 text-primary" strokeWidth={1.5} aria-hidden />
                  <span className="text-sm font-medium">{KANAL_ETIKET[kanal]}</span>
                </div>
                <div>
                  <p className="text-metric">{bakiyeler.get(kanal) ?? 0}</p>
                  <p className="text-xs text-muted-foreground">kalan kredi</p>
                </div>
                <Link href={`/panel/ayarlar/mesajlasma/kredi/${kanal}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Kredi Detayı
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {BOLUM_SIRASI.map((bolum) => (
        <Card key={bolum}>
          <CardHeader>
            <CardTitle>{BOLUM_ETIKET[bolum]}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {(gruplar.get(bolum) ?? []).map((k) => (
                <KuralSatiri key={k.tetikleyici_kodu} kural={k} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Son gönderimler</CardTitle>
          <CardDescription>Kuyruk aynı zamanda gönderim kaydıdır; en son 15 satır gösterilir.</CardDescription>
        </CardHeader>
        <CardContent>
          {kuyruk.length === 0 ? (
            <EmptyState compact icon={MessageCircle} title="Henüz gönderilen veya sıraya alınan mesaj yok." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zaman</TableHead>
                  <TableHead>Olay</TableHead>
                  <TableHead>Kanal</TableHead>
                  <TableHead>Alıcı</TableHead>
                  <TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kuyruk.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(m.created_at)}</TableCell>
                    <TableCell>{tetikleyiciGetir(m.tetikleyici_kodu)?.ad ?? m.tetikleyici_kodu}</TableCell>
                    <TableCell>{KANAL_ETIKET[m.kanal]}</TableCell>
                    <TableCell className="text-muted-foreground">{m.alici_adres}</TableCell>
                    <TableCell title={m.hata_mesaji ?? undefined}>
                      <StatusBadge tone={DURUM_TONU[m.durum]}>{KUYRUK_DURUM_ETIKET[m.durum]}</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

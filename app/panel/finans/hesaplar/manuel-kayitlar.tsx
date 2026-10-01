import { Landmark } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gunYazi } from "@/lib/datetime";
import { ibanBicimle } from "@/lib/iban";
import { kurusTLyazi } from "@/lib/para";
import type { ManuelKayit } from "@/lib/panel/hesap-hareketleri";

/**
 * Manuel kasa/banka kayıtları (klinikteki "Kasa Hareketleri" / "Havale Kayıtları" tablosu). Defter değişmez: silme yok,
 * hata için ters kayıt girilir. `hesap`: bakılan hesap ("kasa" veya banka id) — yönü ve "karşı hesap"ı buna göre çözer.
 */
export function ManuelKayitlar({ kayitlar, hesap, hesapAdlari, bosMetin }: { kayitlar: ManuelKayit[]; hesap: string; hesapAdlari: Map<string, string>; bosMetin: string }) {
  if (kayitlar.length === 0) return <EmptyState compact icon={Landmark} title={bosMetin} />;

  // hesap "" = tüm banka hesapları: yön kayıt türünden okunur (giren = giriş; çıkan/transfer = çıkış etiketi transferde nötr).
  const gelenMi = (k: ManuelKayit) => (hesap === "" ? k.tip === "giren" : hesap === "kasa" ? k.hedef_kasa || (k.tip === "giren" && k.kasa) : k.hedef_banka_hesap_id === hesap || (k.tip === "giren" && k.banka_hesap_id === hesap));
  const hesapAdi = (kasa: boolean, id: string | null) => (kasa ? "Kasa" : ((id && hesapAdlari.get(id)) ?? "—"));
  const karsi = (k: ManuelKayit) => {
    if (k.tip !== "transfer") return [k.karsi_taraf, k.karsi_taraf_banka].filter(Boolean).join(" · ") || "—";
    if (hesap === "") return `${hesapAdi(k.kasa, k.banka_hesap_id)} → ${hesapAdi(k.hedef_kasa, k.hedef_banka_hesap_id)}`;
    return gelenMi(k) ? `${hesapAdi(k.kasa, k.banka_hesap_id)} hesabından` : `${hesapAdi(k.hedef_kasa, k.hedef_banka_hesap_id)} hesabına`;
  };

  return (
    <Table className="min-w-[720px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Tarih</TableHead>
          <TableHead>Yön</TableHead>
          <TableHead>Karşı taraf</TableHead>
          <TableHead>IBAN</TableHead>
          <TableHead className="text-right">Tutar</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {kayitlar.map((k) => {
          const gelen = gelenMi(k);
          return (
            <TableRow key={k.id}>
              <TableCell className="whitespace-nowrap tabular-nums">{gunYazi(k.tarih)}</TableCell>
              <TableCell>
                <StatusBadge tone={gelen ? "emerald" : "rose"}>{k.tip === "transfer" ? "Transfer" : gelen ? "Giren" : "Çıkan"}</StatusBadge>
              </TableCell>
              <TableCell>
                <span className="font-medium">{karsi(k)}</span>
                {k.aciklama && <span className="block text-xs text-muted-foreground">{k.aciklama}</span>}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{k.karsi_taraf_iban ? ibanBicimle(k.karsi_taraf_iban) : "—"}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{kurusTLyazi(k.tutar_kurus)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

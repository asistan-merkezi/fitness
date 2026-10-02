"use client";

import { EylemFormu } from "@/components/panel/eylem-formu";
import { gunYazi } from "@/lib/datetime";
import { kurusTLyazi } from "@/lib/para";
import { faturaOlustur } from "../../actions";

export type FaturasizSatir = { id: string; aciklama: string | null; islem_tarihi: string; net_kurus: number };

/**
 * Seçilen satır için fatura kuyruğu kaydı oluşturur. Bir fatura tek müşterinin satırlarını içerir: açılan satır her zaman
 * dahildir; müşterinin diğer faturalanmamış satırları isteğe bağlı olarak aynı faturaya eklenebilir.
 */
export function FaturaKesFormu({ hedef, digerleri }: { hedef: FaturasizSatir; digerleri: FaturasizSatir[] }) {
  return (
    <EylemFormu eylem={faturaOlustur} gonder="Fatura Kes" yukleniyor="Kuyruğa alınıyor...">
      <input type="hidden" name="hareket_idleri" value={hedef.id} />
      {digerleri.length > 0 && (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-sm font-medium">Aynı faturaya eklenebilecek diğer satırlar</legend>
          {digerleri.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name="hareket_idleri" value={s.id} className="size-4" />
              <span className="tabular-nums text-muted-foreground">{gunYazi(s.islem_tarihi)}</span>
              <span className="min-w-0 flex-1 truncate">{s.aciklama ?? "Borç"}</span>
              <span className="font-semibold tabular-nums">{kurusTLyazi(s.net_kurus)}</span>
            </label>
          ))}
        </fieldset>
      )}
    </EylemFormu>
  );
}

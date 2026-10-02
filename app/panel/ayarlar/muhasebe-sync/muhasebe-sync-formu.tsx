"use client";

import { Alan } from "@/components/panel/form-alanlari";
import { EylemFormu } from "@/components/panel/eylem-formu";
import { Input } from "@/components/ui/input";
import type { MuhasebeEntegrasyonDurum } from "@/types/veritabani";
import { muhasebeSyncGuncelle } from "./actions";

export function MuhasebeSyncFormu({ durum }: { durum: MuhasebeEntegrasyonDurum | null }) {
  return (
    <EylemFormu eylem={muhasebeSyncGuncelle} gonder="Kaydet" className="gap-4">
      <p className="text-xs text-muted-foreground">
        Bu bilgiler yalnızca Supabase&apos;te (RLS ile izole, disk seviyesinde şifreli) saklanır ve sadece Muhasebe Sync tarafından kullanılır. Client Secret kaydedildikten sonra bir daha ekranda gösterilmez — değiştirmek istemediğinizde alanı boş bırakabilirsiniz.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Client ID" htmlFor="parasut_client_id">
          <Input id="parasut_client_id" name="parasut_client_id" required autoComplete="off" defaultValue={durum?.parasut_client_id ?? ""} />
        </Alan>
        <Alan etiket="Şirket (Company) ID" htmlFor="parasut_company_id">
          <Input id="parasut_company_id" name="parasut_company_id" required autoComplete="off" defaultValue={durum?.parasut_company_id ?? ""} />
        </Alan>
        <div className="sm:col-span-2">
          <Alan etiket="Client Secret" htmlFor="parasut_client_secret">
            <Input id="parasut_client_secret" name="parasut_client_secret" type="password" autoComplete="new-password" placeholder={durum?.secret_tanimli ? "•••••••• (değiştirmek için yeni değer girin)" : ""} />
          </Alan>
        </div>
      </div>
    </EylemFormu>
  );
}

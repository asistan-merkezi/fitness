"use client";

import { useState, useTransition } from "react";
import { LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { kendiPuantajiniYaz } from "./actions";

/**
 * Kişinin kendi giriş/çıkış düğmeleri. Kimlik doğrulaması zaten oturum açmış olmaktır (ayrı PIN yok);
 * saat sunucuda yazılır. Girişi olana ikinci giriş, girişsiz çıkış yapılamaz (düğmeler buna göre pasif).
 */
export function KendiPuantajim({ giris, cikis, engel }: { giris: string | null; cikis: string | null; engel: string | null }) {
  const [bekliyor, basla] = useTransition();
  const [sonuc, setSonuc] = useState<{ success: boolean; message: string } | null>(null);

  function yaz(tur: "giris" | "cikis") {
    basla(async () => setSonuc(await kendiPuantajiniYaz(tur)));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        Bugün: giriş {giris ?? "—"} · çıkış {cikis ?? "—"}
        {engel && <span className="ml-2 font-medium text-foreground">({engel})</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={bekliyor || Boolean(engel) || giris !== null} onClick={() => yaz("giris")}>
          <LogIn aria-hidden /> Giriş Yap
        </Button>
        <Button type="button" variant="outline" disabled={bekliyor || Boolean(engel) || giris === null || cikis !== null} onClick={() => yaz("cikis")}>
          <LogOut aria-hidden /> Çıkış Yap
        </Button>
      </div>
      {sonuc && (
        <p role={sonuc.success ? "status" : "alert"} className={cn("text-sm font-medium", sonuc.success ? "text-success" : "text-destructive")}>
          {sonuc.message}
        </p>
      )}
    </div>
  );
}

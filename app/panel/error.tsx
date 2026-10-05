"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Panel hata sınırı: bir sayfa veri okurken hata fırlatırsa (ör. `tumSayfalariOku`, bağlantı kesintisi) kabuk ve menü yerinde kalır,
 * yalnız içerik alanında Türkçe uyarı gösterilir. Teknik ayrıntı kullanıcıya gösterilmez; `digest` sunucu loglarıyla eşleştirmek içindir.
 */
export default function PanelHatasi({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[panel]", error.digest ?? error.message);
  }, [error]);

  return (
    <EmptyState
      icon={TriangleAlert}
      title="Sayfa yüklenemedi"
      description={`Veriler okunurken bir sorun oluştu. Eksik veriyle yanlış tutar göstermemek için sayfa durduruldu; birkaç saniye sonra tekrar deneyin.${error.digest ? ` (Hata kodu: ${error.digest})` : ""}`}
      action={
        <div className="flex gap-2">
          <Button onClick={reset}>Tekrar dene</Button>
          <Link href="/panel" className={buttonVariants({ variant: "outline" })}>
            Ana sayfa
          </Link>
        </div>
      }
    />
  );
}

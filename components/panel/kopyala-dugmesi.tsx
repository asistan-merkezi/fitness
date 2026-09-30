"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Metni panoya kopyalar; tarayıcı izin vermezse sessizce başarısız olur. */
export function KopyalaDugmesi({ metin, etiket = "Kopyala" }: { metin: string; etiket?: string }) {
  const [kopyalandi, setKopyalandi] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(metin);
          setKopyalandi(true);
          setTimeout(() => setKopyalandi(false), 2000);
        } catch {
          // Pano erişimi yoksa metin zaten ekranda seçilebilir.
        }
      }}
    >
      {kopyalandi ? <Check aria-hidden /> : <Copy aria-hidden />}
      {kopyalandi ? "Kopyalandı" : etiket}
    </Button>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Yazdıkça (250 ms bekleyerek) `?q=` günceller; sayfa sunucuda yeniden süzülür. */
export function MusteriAramaKutusu({ baslangic }: { baslangic: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [deger, setDeger] = useState(baslangic);
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
  }, []);

  function degistir(yeni: string) {
    setDeger(yeni);
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    zamanlayici.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (yeni.trim()) params.set("q", yeni.trim());
      else params.delete("q");
      const metin = params.toString();
      router.replace(metin ? `${pathname}?${metin}` : pathname);
    }, 250);
  }

  return (
    <div className="relative max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input name="q" type="search" placeholder="Ad, telefon veya üye no ile ara" aria-label="Müşteri ara" value={deger} onChange={(e) => degistir(e.target.value)} className="h-11 pl-8" autoComplete="off" />
    </div>
  );
}

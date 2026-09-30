"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function YazdirDugmesi({ etiket = "Yazdır" }: { etiket?: string }) {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer aria-hidden /> {etiket}
    </Button>
  );
}

import type { Metadata } from "next";
import { Logo } from "@/components/marka/logo";
import { TemaDugmesi } from "@/components/panel/tema-anahtari";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Giriş",
  description: "Fitness Asistanı | Spor salonu yönetim paneline güvenli giriş. Üyelik, check-in, cari ve kasa tek yerde.",
};

const MADDELER = [
  ["Check-in saniyeler içinde", "Üyeyi arayın, girişi kaydedin; seans hakkı otomatik düşer."],
  ["Cari ve kasa net", "Borç, ödeme ve iade değiştirilemez kayıtlarla tutulur."],
  ["Hassas veri korunur", "Sağlık ve kimlik bilgileri yalnızca yetkili rollere açıktır."],
] as const;

/** Soyut altıgen ağı: marka işaretinin geometrisi, fotoğraf yok. */
function AltigenDeseni() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full text-border opacity-60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="altigen" width="56" height="97" patternUnits="userSpaceOnUse" patternTransform="scale(1.4)">
          <path d="M28 0 L56 16 V48 L28 64 L0 48 V16 Z M28 64 V97 M0 48 L0 81 L28 97 M56 48 V81 L28 97" fill="none" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#altigen)" />
    </svg>
  );
}

export default function GirisSayfasi() {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface p-12 lg:flex">
        <AltigenDeseni />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative flex max-w-lg flex-col gap-8">
          <div>
            <h1 className="text-baslik-xl text-[2.5rem] leading-[3rem] text-foreground">
              Salonunuzu <span className="text-primary">tek ekrandan</span> yönetin.
            </h1>
            <p className="mt-4 text-base text-muted-foreground">Üyelik, check-in, cari ve kasa tek yerde. Spor salonları ve PT stüdyoları için güvenli, hızlı yönetim paneli.</p>
          </div>
          <ul className="flex flex-col gap-4">
            {MADDELER.map(([baslik, metin]) => (
              <li key={baslik} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>
                  <span className="block text-sm font-semibold">{baslik}</span>
                  <span className="text-sm text-muted-foreground">{metin}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-muted-foreground">Asistan Merkezi ürün ailesi</p>
      </div>

      <div className="relative flex flex-col p-4 sm:p-8">
        <div className="flex items-center justify-between lg:justify-end">
          <span className="lg:hidden">
            <Logo altEtiket={false} />
          </span>
          <TemaDugmesi />
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <Card className="w-full max-w-sm" elevated>
            <CardHeader>
              <CardTitle className="text-xl">Giriş</CardTitle>
              <CardDescription>İşletme hesabınızla giriş yapın.</CardDescription>
            </CardHeader>
            <CardContent>
              <LoginForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

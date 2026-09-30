import { MarkaIsareti } from "@/components/marka/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Herkese açık (giriş gerektirmeyen) QR formlarının ortak çerçevesi: işletme adı, başlık, açıklama ve içerik. */
export function KamuFormKarti({ isletmeAdi, baslik, aciklama, children }: { isletmeAdi: string; baslik: string; aciklama?: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-start justify-center bg-background px-4 py-8 sm:items-center">
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="flex items-center justify-center gap-2.5">
          <MarkaIsareti boyut={28} />
          <span className="text-sm font-semibold tracking-tight">{isletmeAdi}</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{baslik}</CardTitle>
            {aciklama && <CardDescription>{aciklama}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}

export function KamuFormBulunamadi() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <MarkaIsareti boyut={40} />
        <h1 className="text-xl font-bold tracking-tight">Sayfa bulunamadı</h1>
        <p className="text-sm text-muted-foreground">Bu bağlantı geçersiz ya da artık kullanılmıyor. Lütfen salon ile iletişime geçin.</p>
      </div>
    </main>
  );
}

import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

// latin + latin-ext: ş/ğ/ı/İ/ö/ü/ç için (Türkçe karakter desteği ilk kontrol).
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const ACIKLAMA = "Üyelik, check-in, cari ve kasa tek yerde. Spor salonları ve PT stüdyoları için güvenli, hızlı yönetim paneli.";

export const metadata: Metadata = {
  metadataBase: new URL("https://fitness.asistanmerkezi.com"),
  title: { default: "Fitness Asistanı | Spor Salonu Yönetim Yazılımı", template: "%s | Fitness Asistanı" },
  description: ACIKLAMA,
  applicationName: "Fitness Asistanı",
  openGraph: {
    type: "website",
    siteName: "Fitness Asistanı",
    locale: "tr_TR",
    title: "Fitness Asistanı | Spor Salonu Yönetim Yazılımı",
    description: ACIKLAMA,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "Fitness Asistanı", description: ACIKLAMA },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#121316" },
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Koyu tema varsayılan; kullanıcı Açık / Koyu / Sistem seçebilir ve seçim bu cihazda hatırlanır. */}
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

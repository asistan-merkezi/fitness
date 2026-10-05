import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Panel içinde bulunamayan kayıt/sayfa (`notFound()` ya da yanlış adres): kabuk yerinde kalır. */
export default function PanelBulunamadi() {
  return (
    <EmptyState
      icon={SearchX}
      title="Kayıt bulunamadı"
      description="Aradığınız sayfa ya da kayıt yok, silinmiş veya görme yetkiniz bulunmuyor."
      action={
        <Link href="/panel" className={buttonVariants({ variant: "outline" })}>
          Ana sayfaya dön
        </Link>
      }
    />
  );
}

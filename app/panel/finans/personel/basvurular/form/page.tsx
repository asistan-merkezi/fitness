import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { YazdirDugmesi } from "@/components/panel/yazdir-dugmesi";
import { buttonVariants } from "@/components/ui/button";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { YONETICI_ROLLERI } from "@/lib/panel/roller";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "İş Başvuru Formu (Yazdır)" };

/** Kağıt üzerinde doldurulacak alanlar: web formundaki (herkese açık başvuru) alanlarla aynıdır. */
const ALANLAR: { etiket: string; satir: number }[] = [
  { etiket: "Ad Soyad", satir: 1 },
  { etiket: "Telefon", satir: 1 },
  { etiket: "E-posta", satir: 1 },
  { etiket: "Doğum Tarihi", satir: 1 },
  { etiket: "Başvurulan Pozisyon", satir: 1 },
  { etiket: "Deneyim (önceki işyerleri, süre)", satir: 4 },
  { etiket: "Sertifikalar / Belgeler", satir: 3 },
];

/** Yazdırılabilir boş iş başvuru formu (klinikteki "Elle Doldurulacak Form"): aday salona gelince kağıda doldurur, yönetici bilgileri sisteme işler. */
export default async function IsBasvuruFormuYazdirSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(YONETICI_ROLLERI);
  const supabase = await createClient();
  const { data: isletme } = await supabase.from("isletme").select("ad").eq("id", kullanici.isletme_id).maybeSingle<{ ad: string }>();

  return (
    <>
      <div className="yazdirma-gizle flex flex-wrap items-center gap-2">
        <Link href="/panel/finans/personel/basvurular" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft aria-hidden /> Başvurular
        </Link>
        <YazdirDugmesi etiket="Yazdır / PDF olarak kaydet" />
      </div>

      <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-xl border border-border bg-white p-8 text-black print:border-0 print:p-0">
        <header className="flex flex-col gap-1 border-b border-black/30 pb-4">
          <h1 className="text-2xl font-semibold">İş Başvuru Formu</h1>
          <p className="text-sm">{isletme?.ad ?? ""}</p>
        </header>

        {ALANLAR.map((a) => (
          <div key={a.etiket} className="flex flex-col gap-1">
            <span className="text-sm font-medium">{a.etiket}</span>
            {Array.from({ length: a.satir }).map((_, i) => (
              <span key={i} className="block h-8 border-b border-black/50" />
            ))}
          </div>
        ))}

        <p className="text-xs leading-relaxed">
          Verdiğim bilgilerin doğru olduğunu, yalnızca iş başvurumun değerlendirilmesi amacıyla işleneceğini ve 18 yaşından büyük olduğumu kabul ederim. [TASLAK — metin, avukat incelemesinden sonra kesinleşir]
        </p>

        <div className="flex items-end justify-between gap-8 pt-4 text-sm">
          <span className="flex flex-1 flex-col gap-1">
            <span className="block h-8 border-b border-black/50" />
            Tarih
          </span>
          <span className="flex flex-1 flex-col gap-1">
            <span className="block h-8 border-b border-black/50" />
            İmza
          </span>
        </div>
      </article>
    </>
  );
}

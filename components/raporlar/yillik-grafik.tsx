import { kurusTLyazi } from "@/lib/para";
import type { YillikAy } from "@/lib/raporlar/hesaplamalar";

/**
 * Yıllık gelir/gider çift çubuklu grafik (bağımlılıksız SVG). Gelir yeşil, gider kırmızı; renk çifti klinikteki grafikle aynıdır
 * (dataviz doğrulayıcısından geçmiş: CVD ayrımı 6-8 bandında → yalnız ikincil kodlamayla geçerli). Bu yüzden renge tek başına güvenilmez:
 * legend metinli, her çubuğun tooltip'i değeri yazar ve altta aynı veri tablo olarak da verilir.
 * Tek eksen: iki seri de ₺. Çubuklar tabana oturur, üst uçları 2px yuvarlak, aralarında boşluk vardır.
 */
export function YillikGrafik({ aylar }: { aylar: YillikAy[] }) {
  const maks = Math.max(1, ...aylar.flatMap((a) => [a.gelir, a.gider]));
  const genislik = 760;
  const yukseklik = 260;
  const ust = 12;
  const alt = 28;
  const cizim = yukseklik - ust - alt;
  const grup = genislik / aylar.length;
  const cubuk = grup * 0.32;
  const aralik = 3;
  const taban = ust + cizim;
  const boy = (d: number) => (d / maks) * cizim;
  const paraTam = (t: number) => kurusTLyazi(t);
  const toplamGelir = aylar.reduce((t, a) => t + a.gelir, 0);
  const toplamGider = aylar.reduce((t, a) => t + a.gider, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-[#008300]" aria-hidden /> Gelir (net tahsilat)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-[#e34948] dark:bg-[#e66767]" aria-hidden /> Gider (ödenen + personel tahakkuku)
        </span>
      </div>

      <svg viewBox={`0 0 ${genislik} ${yukseklik}`} className="w-full" role="img" aria-label={`Aylık gelir ve gider grafiği. Yıl toplamı: gelir ${paraTam(toplamGelir)}, gider ${paraTam(toplamGider)}.`}>
        {[0, 0.25, 0.5, 0.75, 1].map((oran) => (
          <line key={oran} x1={0} y1={ust + cizim * (1 - oran)} x2={genislik} y2={ust + cizim * (1 - oran)} stroke="currentColor" className="text-border" strokeWidth={1} />
        ))}
        {aylar.map((a, i) => {
          const merkez = i * grup + grup / 2;
          const gelirBoy = boy(a.gelir);
          const giderBoy = boy(a.gider);
          return (
            <g key={a.ay}>
              <rect x={merkez - aralik / 2 - cubuk} y={taban - gelirBoy} width={cubuk} height={Math.max(gelirBoy, 1)} rx={2} fill="#008300">
                <title>
                  {a.ayEtiketi} · Gelir {paraTam(a.gelir)}
                </title>
              </rect>
              <rect x={merkez + aralik / 2} y={taban - giderBoy} width={cubuk} height={Math.max(giderBoy, 1)} rx={2} className="fill-[#e34948] dark:fill-[#e66767]">
                <title>
                  {a.ayEtiketi} · Gider {paraTam(a.gider)}
                </title>
              </rect>
              <text x={merkez} y={yukseklik - 8} textAnchor="middle" fontSize={10} fill="currentColor" className="text-muted-foreground">
                {a.ayEtiketi.slice(0, 3)}
              </text>
            </g>
          );
        })}
      </svg>

      <details className="text-sm print:hidden">
        <summary className="cursor-pointer select-none text-muted-foreground">Tablo olarak göster</summary>
        <table className="mt-2 w-full text-left text-xs tabular-nums">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 font-medium">Ay</th>
              <th className="py-1 text-right font-medium">Gelir</th>
              <th className="py-1 text-right font-medium">Gider</th>
              <th className="py-1 text-right font-medium">Fark</th>
            </tr>
          </thead>
          <tbody>
            {aylar.map((a) => (
              <tr key={a.ay} className="border-t border-border">
                <td className="py-1">{a.ayEtiketi}</td>
                <td className="py-1 text-right">{paraTam(a.gelir)}</td>
                <td className="py-1 text-right">{paraTam(a.gider)}</td>
                <td className="py-1 text-right font-medium">{paraTam(a.gelir - a.gider)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

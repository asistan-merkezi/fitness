const MAKS_KENAR_PIXEL = 1280;
const WEBP_KALITE = 0.85;

function svgMi(dosya: File): boolean {
  return dosya.type === "image/svg+xml" || dosya.name.toLowerCase().endsWith(".svg");
}

/**
 * Logo yüklemeden önce tarayıcıda hazırlık: en uzun kenar 1280 px'e indirilir ve WebP'ye çevrilir.
 * SVG vektör olduğu için olduğu gibi bırakılır.
 */
export async function logoHazirla(dosya: File): Promise<File> {
  if (svgMi(dosya)) return dosya;

  const objectUrl = URL.createObjectURL(dosya);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Görsel okunamadı."));
      el.src = objectUrl;
    });

    let { width, height } = img;
    const enUzunKenar = Math.max(width, height);
    if (enUzunKenar > MAKS_KENAR_PIXEL) {
      const olcek = MAKS_KENAR_PIXEL / enUzunKenar;
      width = Math.round(width * olcek);
      height = Math.round(height * olcek);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas desteklenmiyor.");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_KALITE));
    if (!blob) throw new Error("Görsel sıkıştırılamadı.");
    return new File([blob], dosya.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

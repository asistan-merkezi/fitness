// Tasarım sisteminde fotoğraf yerine nötr yüzey + marka tonu baş harfler kullanılır (tek vurgu kuralı).
const RENK_PALETI = [
  "bg-surface-3 text-foreground",
  "bg-surface-3 text-primary",
  "bg-primary/14 text-primary",
] as const;

/** Ada göre sabit (deterministik) bir renk çifti — aynı isim her zaman aynı rengi alır. */
export function renkUret(adSoyad: string): string {
  let toplam = 0;
  for (let i = 0; i < adSoyad.length; i++) {
    toplam += adSoyad.charCodeAt(i);
  }
  return RENK_PALETI[toplam % RENK_PALETI.length];
}

/** İlk ve son kelimenin ilk harflerini büyük olarak döner (örn. "Ahmet Yılmaz" -> "AY"). */
export function baslangicHarfleriAl(adSoyad: string): string {
  const kelimeler = adSoyad.trim().split(/\s+/).filter(Boolean);
  if (kelimeler.length === 0) return "?";
  const ilk = kelimeler[0].charAt(0);
  const son = kelimeler.length > 1 ? kelimeler[kelimeler.length - 1].charAt(0) : "";
  return (ilk + son).toLocaleUpperCase("tr-TR");
}

/** Merkezin döndürdüğü ödeme adresi: yalnız https (localhost için http). Aksi halde null — yönlendirme yapılmaz. */
export function guvenliOdemeUrl(ham: string): string | null {
  let url: URL;
  try {
    url = new URL(ham);
  } catch {
    return null;
  }
  const yerel = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:" || (url.protocol === "http:" && yerel)) return url.toString();
  return null;
}

/** Alıcı adresini listede gösterim için maskeler: telefon "+90 532 ••• •• 12", e-posta "a•••@alanadi.com". */
export function aliciMaskele(adres: string): string {
  if (adres.includes("@")) {
    const [yerel, alan] = adres.split("@");
    return `${yerel.charAt(0)}•••@${alan}`;
  }
  const rakam = adres.replace(/\D/g, "");
  if (rakam.length < 7) return "•••";
  return `+${rakam.slice(0, rakam.length - 10)} ${rakam.slice(-10, -7)} ••• •• ${rakam.slice(-2)}`;
}

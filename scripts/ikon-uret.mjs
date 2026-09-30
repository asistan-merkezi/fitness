#!/usr/bin/env node
/**
 * Marka ikon setini üretir (kaynak: aşağıdaki SVG işareti). Çalıştır: `node scripts/ikon-uret.mjs`
 * Çıktılar (commit'lenir):
 *   app/icon.svg            tarayıcı sekmesi / Google arama sonucu (SVG)
 *   app/favicon.ico         16/32/48 px (Google: 48px'in katı ve en az 48x48 ister)
 *   app/apple-icon.png      180x180
 *   public/icons/icon-192.png, icon-512.png, icon-maskable-512.png   (PWA)
 * Tasarım kuralı: küçük boyutta okunur, kalın şekil, ince çizgi/metin yok.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const GRAFIT = "#121316";
const LIMON = "#C8F53C";

// 120x120 tuval; altıgen plaka + onay işareti. `olcek` < 1 ise maskable için güvenli alan bırakır.
function svg({ yuvarlak = true, olcek = 1 } = {}) {
  const t = `translate(${60 - 60 * olcek} ${60 - 60 * olcek}) scale(${olcek})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <rect width="120" height="120"${yuvarlak ? ' rx="28"' : ""} fill="${GRAFIT}"/>
  <g transform="${t}">
    <path d="M60 18 L95 38 V82 L60 102 L25 82 V38 Z" fill="${LIMON}"/>
    <path d="M43 61 L55 73 L78 47" fill="none" stroke="${GRAFIT}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`;
}

async function png(boyut, secenek) {
  return sharp(Buffer.from(svg(secenek)), { density: 384 }).resize(boyut, boyut).png({ compressionLevel: 9 }).toBuffer();
}

/** PNG gömülü ICO (Vista+ tüm tarayıcılar destekler). */
function ico(girdiler) {
  const baslik = Buffer.alloc(6);
  baslik.writeUInt16LE(0, 0);
  baslik.writeUInt16LE(1, 2);
  baslik.writeUInt16LE(girdiler.length, 4);
  let offset = 6 + 16 * girdiler.length;
  const dizin = [];
  for (const { boyut, veri } of girdiler) {
    const d = Buffer.alloc(16);
    d.writeUInt8(boyut >= 256 ? 0 : boyut, 0);
    d.writeUInt8(boyut >= 256 ? 0 : boyut, 1);
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(veri.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += veri.length;
    dizin.push(d);
  }
  return Buffer.concat([baslik, ...dizin, ...girdiler.map((g) => g.veri)]);
}

mkdirSync("public/icons", { recursive: true });

writeFileSync("app/icon.svg", svg());
writeFileSync("app/apple-icon.png", await png(180, { yuvarlak: false }));
writeFileSync("public/icons/icon-192.png", await png(192));
writeFileSync("public/icons/icon-512.png", await png(512));
// Maskable: tam kapsamlı kare zemin + işaret güvenli alanın (%80) içinde
writeFileSync("public/icons/icon-maskable-512.png", await png(512, { yuvarlak: false, olcek: 0.72 }));
writeFileSync(
  "app/favicon.ico",
  ico(await Promise.all([16, 32, 48].map(async (boyut) => ({ boyut, veri: await png(boyut) }))))
);

console.log("Marka ikonları üretildi: app/icon.svg, app/favicon.ico, app/apple-icon.png, public/icons/*");

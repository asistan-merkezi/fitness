#!/usr/bin/env node
/**
 * İlk işletmeyi ve yöneticisini (veya platform yöneticisini) oluşturur. SERVİS ROLÜ anahtarı gerekir;
 * yalnız kendi bilgisayarınızda, .env.local ile çalıştırın (anahtar ASLA commit edilmez):
 *
 *   node --env-file=.env.local scripts/ilk-isletme.mjs --isletme "Salon Adı" --ad-soyad "Ayşe Yılmaz" --eposta ayse@ornek.com
 *   node --env-file=.env.local scripts/ilk-isletme.mjs --super --ad-soyad "Platform Yöneticisi" --eposta ben@ornek.com
 *
 * Şifre verilmezse rastgele üretilip BİR KEZ ekrana yazılır (kaydedilmez).
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function arguman(ad) {
  const i = process.argv.indexOf(`--${ad}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const bayrak = (ad) => process.argv.includes(`--${ad}`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anahtar = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anahtar) {
  console.error("NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local).");
  process.exit(1);
}

const superMi = bayrak("super");
const isletmeAdi = arguman("isletme");
const adSoyad = arguman("ad-soyad");
const eposta = arguman("eposta");
if (!adSoyad || !eposta || (!superMi && !isletmeAdi)) {
  console.error('Kullanım: --isletme "Ad" --ad-soyad "Ad Soyad" --eposta e@posta   (veya --super --ad-soyad ... --eposta ...)');
  process.exit(1);
}

const sifre = arguman("sifre") ?? randomBytes(12).toString("base64url") + "A1";
const admin = createClient(url, anahtar, { auth: { autoRefreshToken: false, persistSession: false } });

let isletmeId = null;
if (!superMi) {
  const { data, error } = await admin.from("isletme").insert({ ad: isletmeAdi }).select("id").single();
  if (error) {
    console.error("İşletme oluşturulamadı:", error.message);
    process.exit(1);
  }
  isletmeId = data.id;
}

const { data: olusan, error: authHatasi } = await admin.auth.admin.createUser({ email: eposta, password: sifre, email_confirm: true });
if (authHatasi || !olusan.user) {
  console.error("Kullanıcı oluşturulamadı:", authHatasi?.message);
  if (isletmeId) await admin.from("isletme").delete().eq("id", isletmeId);
  process.exit(1);
}

const { error: profilHatasi } = await admin.from("kullanici").insert({
  id: olusan.user.id,
  isletme_id: isletmeId,
  ad_soyad: adSoyad,
  rol: superMi ? "super_admin" : "isletme_admin",
});
if (profilHatasi) {
  console.error("Kullanıcı profili oluşturulamadı:", profilHatasi.message);
  await admin.auth.admin.deleteUser(olusan.user.id);
  if (isletmeId) await admin.from("isletme").delete().eq("id", isletmeId);
  process.exit(1);
}

console.log(superMi ? "Platform yöneticisi oluşturuldu." : `İşletme ve yönetici oluşturuldu (işletme id: ${isletmeId}).`);
console.log(`E-posta: ${eposta}`);
if (!arguman("sifre")) console.log(`Geçici şifre (yalnız şimdi gösterilir): ${sifre}`);

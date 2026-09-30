import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

/**
 * Migration'ları GERÇEK Postgres (PGlite, WASM) üzerinde çalıştırır. Supabase'in
 * sağladığı parçalar (auth şeması, auth.uid(), roller, varsayılan yetkiler,
 * extensions şeması) burada taklit edilir; uygulama şeması birebir migration'lardır.
 */
const SUPABASE_TAKLIDI = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
-- Supabase, public şemasındaki yeni nesnelere bu yetkileri varsayılan verir; RLS asıl bariyerdir.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
`;

const MIGRATION_DIZINI = path.resolve(__dirname, "../../supabase/migrations");

export async function yeniVeritabani(): Promise<PGlite> {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(SUPABASE_TAKLIDI);
  const dosyalar = readdirSync(MIGRATION_DIZINI)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const dosya of dosyalar) {
    try {
      await db.exec(readFileSync(path.join(MIGRATION_DIZINI, dosya), "utf8"));
    } catch (e) {
      throw new Error(`Migration hatası (${dosya}): ${(e as Error).message}`);
    }
  }
  return db;
}

/** Test sırasında "bugün" (İstanbul) sabitlenir: bugun_istanbul() yerine sabit tarih döner. */
export async function bugunuSabitle(db: PGlite, tarih: string) {
  await db.exec(
    `CREATE OR REPLACE FUNCTION public.bugun_istanbul() RETURNS date LANGUAGE sql STABLE AS $$ SELECT DATE '${tarih}' $$;`
  );
}

/** Verilen kullanıcı olarak (authenticated rolü + JWT sub) çalıştırır; RLS devrede. */
export async function kimlikle<T>(db: PGlite, kullaniciId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${kullaniciId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`);
  }
}

let sayac = 0;
export function uuid(): string {
  sayac += 1;
  return `00000000-0000-4000-8000-${String(sayac).padStart(12, "0")}`;
}

export async function isletmeOlustur(db: PGlite, ad = "Test Salon"): Promise<string> {
  const id = uuid();
  await db.query("INSERT INTO public.isletme (id, ad) VALUES ($1, $2)", [id, ad]);
  return id;
}

export async function kullaniciOlustur(
  db: PGlite,
  { isletmeId, rol, adSoyad = "Test Kullanıcı" }: { isletmeId: string | null; rol: string; adSoyad?: string }
): Promise<string> {
  const id = uuid();
  await db.query("INSERT INTO auth.users (id) VALUES ($1)", [id]);
  await db.query("INSERT INTO public.kullanici (id, isletme_id, ad_soyad, rol) VALUES ($1, $2, $3, $4)", [
    id,
    isletmeId,
    adSoyad,
    rol,
  ]);
  return id;
}

export async function hataMesaji(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

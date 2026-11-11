/**
 * Recria o banco de teste do zero: shim do Supabase + todas as migrações.
 * Requer um Postgres local (ou `supabase start`, apontando TEST_DATABASE_ADMIN_URL
 * para ele — nesse caso o shim é ignorado porque os esquemas já existem).
 */
import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_URL, TEST_DB, testDbUrl } from "./db";

export default async function setup() {
  const raiz = path.resolve(__dirname, "../..");

  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB} with (force)`);
  await admin.query(`create database ${TEST_DB}`);
  await admin.end();

  const c = new Client({ connectionString: testDbUrl() });
  await c.connect();
  try {
    const temAuth = await c.query("select 1 from pg_namespace where nspname = 'auth'");
    if (temAuth.rowCount === 0) {
      await c.query(fs.readFileSync(path.join(raiz, "supabase/tests/supabase-shim.sql"), "utf8"));
    }
    const dir = path.join(raiz, "supabase/migrations");
    for (const arq of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      try {
        await c.query(fs.readFileSync(path.join(dir, arq), "utf8"));
      } catch (e) {
        throw new Error(`Migração ${arq} falhou: ${(e as Error).message}`);
      }
    }
  } finally {
    await c.end();
  }
}

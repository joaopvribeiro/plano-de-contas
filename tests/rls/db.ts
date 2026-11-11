/**
 * Utilitários dos testes de RLS.
 *
 * Cada operação roda numa transação própria, com `set local role authenticated`
 * e o JWT em `request.jwt.claims` — exatamente como o PostgREST do Supabase faz.
 * Nada aqui usa a service role: se a política falhar, o teste falha.
 */
import { Client } from "pg";

export const ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
export const TEST_DB = process.env.TEST_DATABASE_NAME ?? "resolutto_family_test";

export function testDbUrl(): string {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${TEST_DB}`;
  return u.toString();
}

export type Usuario = { id: string; email: string };

/** Conexão de superusuário: só para montar fixtures e conferir o estado real. */
export async function superuser<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: testDbUrl() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export type ResultadoComo<T> = { ok: true; valor: T } | { ok: false; codigo: string; mensagem: string };

/**
 * Executa `fn` como o usuário (papel authenticated) ou como anônimo (papel anon),
 * dentro de uma transação que é sempre desfeita no fim.
 */
export async function como<T>(
  usuario: Usuario | "anon",
  fn: (c: Client) => Promise<T>,
): Promise<ResultadoComo<T>> {
  const c = new Client({ connectionString: testDbUrl() });
  await c.connect();
  try {
    await c.query("begin");
    if (usuario === "anon") {
      await c.query("set local role anon");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    } else {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: usuario.id, email: usuario.email, role: "authenticated" }),
      ]);
    }
    const valor = await fn(c);
    return { ok: true, valor };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { ok: false, codigo: err.code ?? "?", mensagem: err.message ?? String(e) };
  } finally {
    await c.query("rollback").catch(() => {});
    await c.end();
  }
}

/** Atalho: quantas linhas uma consulta devolve como o usuário. */
export async function contarComo(usuario: Usuario | "anon", sql: string, params: unknown[] = []) {
  const r = await como(usuario, async (c) => (await c.query(sql, params)).rowCount ?? 0);
  if (!r.ok) throw new Error(`Consulta falhou como usuário: ${r.mensagem}`);
  return r.valor;
}

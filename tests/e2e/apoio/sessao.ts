/**
 * Sessão de teste para o Playwright.
 *
 * - Com E2E_SENHA: entra de verdade (signInWithPassword) — use com `supabase start`
 *   e os usuários criados por `npm run seed:usuarios`.
 * - Com E2E_JWT_SECRET: assina um JWT localmente — use com o PostgREST local
 *   (ver tests/e2e/LEIA-ME.md).
 */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { BrowserContext } from "@playwright/test";

export const USUARIOS = {
  consultor: {
    id: process.env.E2E_CONSULTOR_ID ?? "11111111-1111-4111-8111-111111111111",
    email: process.env.E2E_CONSULTOR_EMAIL ?? "consultor@resolutto.test",
  },
  membro: {
    id: process.env.E2E_MEMBRO_ID ?? "22222222-2222-4222-8222-222222222222",
    email: process.env.E2E_MEMBRO_EMAIL ?? "titular1.demo@resolutto.test",
  },
} as const;

export const FAMILIA_DEMO = "0d0d0d0d-0000-4000-8000-000000000001";

export const backendDisponivel = Boolean(process.env.E2E_JWT_SECRET || process.env.E2E_SENHA);

function nomeCookie() {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321");
  return `sb-${url.hostname.split(".")[0]}-auth-token`;
}

async function sessaoDe(quem: keyof typeof USUARIOS) {
  const u = USUARIOS[quem];
  if (process.env.E2E_SENHA) {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    const { data, error } = await sb.auth.signInWithPassword({ email: u.email, password: process.env.E2E_SENHA });
    if (error || !data.session) throw new Error(`Login de teste falhou: ${error?.message}`);
    return data.session;
  }
  const segredo = process.env.E2E_JWT_SECRET!;
  const agora = Math.floor(Date.now() / 1000);
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = b({ alg: "HS256", typ: "JWT" });
  const p = b({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", iat: agora - 30, exp: agora + 3600, session_id: "e2e" });
  const s = crypto.createHmac("sha256", segredo).update(`${h}.${p}`).digest("base64url");
  return {
    access_token: `${h}.${p}.${s}`,
    refresh_token: "e2e",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: agora + 3600,
    user: { id: u.id, email: u.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} },
  };
}

/** Entra como o usuário e abre a Família Demo. */
export async function entrarComo(contexto: BrowserContext, quem: keyof typeof USUARIOS, baseURL: string) {
  const sessao = await sessaoDe(quem);
  const dominio = new URL(baseURL).hostname;
  await contexto.addCookies([
    { name: nomeCookie(), value: "base64-" + Buffer.from(JSON.stringify(sessao)).toString("base64url"), domain: dominio, path: "/" },
    { name: "rf_familia", value: FAMILIA_DEMO, domain: dominio, path: "/" },
  ]);
}

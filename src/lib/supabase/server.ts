import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { envPublico } from "@/lib/env";

/**
 * Cliente do Supabase para Server Components, Server Actions e Route Handlers.
 * Usa a sessão do usuário (cookies): todas as consultas passam pela RLS.
 */
export async function criarClienteServidor() {
  // Marca a renderização como dinâmica: o cliente do Supabase lê o relógio
  // (validade da sessão), o que o Next 16 não permite durante a pré-renderização.
  await connection();
  const env = envPublico();
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Em Server Components os cookies são só leitura; o proxy renova a sessão.
        }
      },
    },
  });
}

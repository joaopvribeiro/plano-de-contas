"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Cliente do Supabase para o navegador. Só a chave pública; tudo passa pela RLS. */
export function criarClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  );
}

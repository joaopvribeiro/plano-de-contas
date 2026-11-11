import { redirect } from "next/navigation";
import { Cartao, Marca } from "@/components/ui";
import { supabaseConfigurado } from "@/lib/env";

export const metadata = { title: "Configuração · Resolutto Family" };

/** Aparece só quando as variáveis do Supabase não foram definidas. */
export default function Configurar() {
  if (supabaseConfigurado()) redirect("/");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Cartao className="w-full max-w-lg p-6">
        <Marca className="text-xl" />
        <h1 className="mt-6 text-lg font-bold">Falta conectar o Supabase</h1>
        <p className="mt-2 text-sm text-muted">
          Defina as variáveis abaixo em <code>.env.local</code> (local) ou nas variáveis de ambiente da Vercel, e
          reinicie o servidor. O passo a passo está no README.
        </p>
        <ul className="mt-4 space-y-1 rounded-lg bg-surface-2 p-4 font-mono text-xs">
          <li>NEXT_PUBLIC_SUPABASE_URL</li>
          <li>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</li>
          <li>NEXT_PUBLIC_SITE_URL</li>
          <li>SUPABASE_SERVICE_ROLE_KEY (só servidor)</li>
        </ul>
      </Cartao>
    </main>
  );
}

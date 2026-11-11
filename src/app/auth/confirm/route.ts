import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Destino dos links enviados por e-mail (login e convite).
 * Aceita os dois formatos do Supabase:
 *  - token_hash + type  (modelo de e-mail recomendado; funciona em qualquer navegador)
 *  - code               (fluxo PKCE padrão; funciona no mesmo navegador que pediu o link)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = searchParams.get("next") ?? "/";
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const supabase = await criarClienteServidor();
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  let ok = false;
  if (tokenHash && tipo) {
    ok = !(await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  if (!ok) {
    const login = new URL("/login", origin);
    login.searchParams.set("erro", "link");
    login.searchParams.set("next", destino);
    return NextResponse.redirect(login);
  }
  return NextResponse.redirect(new URL(destino, origin));
}

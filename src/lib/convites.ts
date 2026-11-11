import "server-only";
import { headers } from "next/headers";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function origemDoSite() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

/** Link que leva o convidado, já autenticado, para a página de aceite. */
export async function destinoDoConvite(token: string) {
  return `${await origemDoSite()}/auth/confirm?next=${encodeURIComponent(`/convite/${token}`)}`;
}

/**
 * Envia ao e-mail um link de acesso.
 * Sem conta: convite do Supabase Auth (precisa da service role).
 * Com conta: link mágico comum.
 */
export async function enviarEmailDeAcesso(
  email: string,
  redirectTo: string,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const admin = criarClienteAdmin();
  if (admin) {
    const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (!error) return { ok: true };
    if (!/already|registered|exists/i.test(error.message)) return { ok: false, motivo: error.message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });
  if (error) {
    return {
      ok: false,
      motivo: admin ? error.message : "falta a SUPABASE_SERVICE_ROLE_KEY para convidar quem ainda não tem conta",
    };
  }
  return { ok: true };
}

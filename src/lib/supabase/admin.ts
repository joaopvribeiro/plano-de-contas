import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a service role. IGNORA a RLS.
 * Uso restrito a operações de Auth que o usuário não pode fazer sozinho
 * (enviar convite a quem ainda não tem conta). Nunca use para ler ou gravar
 * dados de família: para isso, use sempre o cliente da sessão.
 */
export function criarClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return null;
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

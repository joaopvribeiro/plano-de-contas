"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { destinoDoConvite, enviarEmailDeAcesso } from "@/lib/convites";
import { COOKIE_FAMILIA } from "@/lib/sessao";
import type { EstadoForm } from "@/app/actions/auth";

/** Sem login: manda o link de acesso para o e-mail do convite (nunca para outro). */
export async function pedirAcessoPeloConvite(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const token = z.uuid().safeParse(formData.get("token"));
  if (!token.success) return { erro: "Convite inválido." };

  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("convite_publico", { p_token: token.data });
  const convite = data?.[0];
  if (!convite?.valido) return { erro: "Este convite expirou ou já foi usado. Peça um novo ao seu consultor." };

  const r = await enviarEmailDeAcesso(convite.email, await destinoDoConvite(token.data));
  if (!r.ok) return { erro: "Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos." };
  return { ok: "Enviamos um link para o e-mail convidado. Abra-o para entrar." };
}

/** Logado com o e-mail convidado: entra na família. */
export async function aceitarConvite(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const token = z.uuid().safeParse(formData.get("token"));
  if (!token.success) return { erro: "Convite inválido." };

  const supabase = await criarClienteServidor();
  const { data: familiaId, error } = await supabase.rpc("aceitar_convite", { p_token: token.data });
  if (error || !familiaId) return { erro: error?.message ?? "Não foi possível aceitar o convite." };

  (await cookies()).set(COOKIE_FAMILIA, familiaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  redirect("/dashboard");
}

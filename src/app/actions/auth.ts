"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";

export type EstadoForm = { erro?: string; ok?: string } | undefined;

const email = z.email("Informe um e-mail válido.").transform((e) => e.trim().toLowerCase());

/** Só aceita caminhos internos em ?next=, para não virar redirecionamento aberto. */
function destinoSeguro(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

async function origem() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function entrarComSenha(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const dados = z
    .object({ email, senha: z.string().min(1, "Informe a senha.") })
    .safeParse({ email: formData.get("email"), senha: formData.get("senha") });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: dados.data.email, password: dados.data.senha });
  if (error) return { erro: "E-mail ou senha incorretos." };

  redirect(destinoSeguro(formData.get("next")));
}

export async function enviarLinkMagico(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const dados = email.safeParse(formData.get("email"));
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const next = destinoSeguro(formData.get("next"));
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithOtp({
    email: dados.data,
    options: {
      // Só quem já tem acesso recebe link; contas novas nascem pelo convite.
      shouldCreateUser: false,
      emailRedirectTo: `${await origem()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  // Mesma mensagem com ou sem conta, para não revelar quais e-mails existem.
  if (error && error.status === 429) return { erro: "Muitas tentativas. Aguarde um minuto e tente de novo." };
  return { ok: "Se este e-mail tiver acesso, você receberá um link para entrar. Confira a caixa de entrada e o spam." };
}

export async function definirSenha(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const dados = z
    .object({
      senha: z.string().min(10, "Use pelo menos 10 caracteres."),
      confirmacao: z.string(),
    })
    .refine((d) => d.senha === d.confirmacao, { message: "As senhas não conferem.", path: ["confirmacao"] })
    .safeParse({ senha: formData.get("senha"), confirmacao: formData.get("confirmacao") });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: dados.data.senha });
  if (error) return { erro: "Não foi possível salvar a senha. Tente de novo." };
  return { ok: "Senha definida. Nas próximas vezes você pode entrar com e-mail e senha." };
}

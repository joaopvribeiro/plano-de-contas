"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { destinoDoConvite, enviarEmailDeAcesso } from "@/lib/convites";
import type { EstadoForm } from "@/app/actions/auth";

const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês no formato AAAA-MM.");

/** Converte "15.000,50" ou "15000.50" em número. */
function paraNumero(v: FormDataEntryValue | null): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Number(normal);
}

export async function criarFamilia(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const dados = z
    .object({
      nome: z.string().trim().min(2, "Informe o nome da família."),
      inicio: mes,
      meses: z.coerce.number().int().min(1).max(60),
      saldo: z.number().finite("Saldo inicial inválido."),
    })
    .safeParse({
      nome: formData.get("nome"),
      inicio: formData.get("inicio"),
      meses: formData.get("meses") || 12,
      saldo: paraNumero(formData.get("saldo")),
    });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("criar_familia", {
    p_nome: dados.data.nome,
    p_inicio: dados.data.inicio,
    p_meses: dados.data.meses,
    p_saldo_inicial: dados.data.saldo,
  });
  if (error || !data) return { erro: "Não foi possível criar a família." };

  revalidatePath("/consultor");
  redirect(`/consultor/familias/${data}`);
}

export async function atualizarHorizonte(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const dados = z
    .object({
      familia_id: z.uuid(),
      inicio: mes,
      meses: z.coerce.number().int().min(1).max(60),
      saldo: z.number().finite("Saldo inicial inválido."),
    })
    .safeParse({
      familia_id: formData.get("familia_id"),
      inicio: formData.get("inicio"),
      meses: formData.get("meses"),
      saldo: paraNumero(formData.get("saldo")),
    });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("familias")
    .update({
      inicio_planejamento: dados.data.inicio,
      meses_horizonte: dados.data.meses,
      saldo_inicial_caixa: dados.data.saldo,
    })
    .eq("id", dados.data.familia_id)
    .select("id");
  if (error || !data?.length) return { erro: "Não foi possível salvar." };

  revalidatePath(`/consultor/familias/${dados.data.familia_id}`);
  return { ok: "Horizonte salvo." };
}

/**
 * Cria o convite (a RLS só deixa se você for consultor da família) e envia o e-mail.
 * Quem ainda não tem conta recebe o convite do Supabase Auth; quem já tem recebe um link de acesso.
 */
export async function convidarMembro(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const dados = z
    .object({
      familia_id: z.uuid(),
      email: z.email("Informe um e-mail válido.").transform((e) => e.trim().toLowerCase()),
      nome: z.string().trim().max(80).optional(),
    })
    .safeParse({
      familia_id: formData.get("familia_id"),
      email: formData.get("email"),
      nome: formData.get("nome") || undefined,
    });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { data: convite, error } = await supabase
    .from("convites")
    .insert({ familia_id: dados.data.familia_id, email: dados.data.email, nome: dados.data.nome ?? null })
    .select("token")
    .single();
  if (error || !convite) return { erro: "Não foi possível criar o convite." };

  const enviado = await enviarEmailDeAcesso(dados.data.email, await destinoDoConvite(convite.token));

  revalidatePath(`/consultor/familias/${dados.data.familia_id}`);
  if (!enviado.ok) {
    return {
      erro: `Convite criado, mas o e-mail não foi enviado (${enviado.motivo}). Copie o link do convite na lista e envie você mesmo.`,
    };
  }
  return { ok: `Convite enviado para ${dados.data.email}.` };
}

export async function cancelarConvite(formData: FormData) {
  const id = z.uuid().parse(formData.get("convite_id"));
  const familia = z.uuid().parse(formData.get("familia_id"));
  const supabase = await criarClienteServidor();
  await supabase.from("convites").delete().eq("id", id).is("aceito_em", null);
  revalidatePath(`/consultor/familias/${familia}`);
}

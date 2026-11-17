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

/** Copia para a família as regras padrão que ela ainda não tem. */
export async function aplicarRegrasPadrao(familiaId: string): Promise<{ erro?: string; criadas?: number }> {
  const id = z.uuid().safeParse(familiaId);
  if (!id.success) return { erro: "Família inválida." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("aplicar_regras_modelo", { p_familia: id.data });
  if (error) return { erro: "Não foi possível aplicar as regras padrão." };
  revalidatePath(`/consultor/familias/${id.data}`);
  revalidatePath("/lancamentos", "layout");
  return { criadas: data as number };
}

// ---------------------------------------------------------------------------
// Biblioteca de regras padrão (admin)
// ---------------------------------------------------------------------------

const esquemaRegraModelo = z
  .object({
    padrao: z
      .string()
      .transform((p) =>
        p
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, " ")
          .trim(),
      )
      .pipe(z.string().min(2, "O padrão precisa de pelo menos 2 letras.").max(60)),
    natureza: z.enum(["fluxo", "transferencia", "aporte", "resgate"]),
    categoria_nome: z
      .string()
      .optional()
      .transform((v) => v?.trim() || null),
    classe: z
      .string()
      .optional()
      .transform((v) => v || null)
      .pipe(z.enum(["Receita", "Despesa básica", "Padrão de vida", "Doações", "Sonhos"]).nullable()),
    assinatura: z.boolean(),
  })
  .refine((r) => r.natureza !== "fluxo" || r.categoria_nome, { message: "Informe a categoria." })
  .transform((r) => (r.natureza === "fluxo" ? r : { ...r, categoria_nome: null, classe: null, assinatura: false }));

export async function salvarRegraModelo(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const d = esquemaRegraModelo.safeParse({ ...Object.fromEntries(fd), assinatura: fd.get("assinatura") === "on" });
  if (!d.success) return { erro: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("regras_modelo").upsert(d.data, { onConflict: "padrao" });
  if (error) return { erro: error.code === "42501" ? "Só administradores alteram a biblioteca." : "Não foi possível salvar." };
  revalidatePath("/consultor/regras-padrao");
  return { ok: `Regra "${d.data.padrao}" salva. Vale para as famílias criadas a partir de agora.` };
}

export async function excluirRegraModelo(fd: FormData) {
  const id = z.uuid().parse(fd.get("id"));
  const supabase = await criarClienteServidor();
  await supabase.from("regras_modelo").delete().eq("id", id);
  revalidatePath("/consultor/regras-padrao");
}

/** Limites mensais de IA da família. Só o consultor da família grava (RLS de limites_ia). */
export async function salvarLimitesIA(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const n = z.coerce.number().int("Use números inteiros.").min(0, "O limite não pode ser negativo.").max(200, "No máximo 200 por mês.");
  const dados = z
    .object({ familia_id: z.uuid(), extrato_mes: n, apolice_mes: n, insight_mes: n })
    .safeParse({
      familia_id: formData.get("familia_id"),
      extrato_mes: formData.get("extrato_mes"),
      apolice_mes: formData.get("apolice_mes"),
      insight_mes: formData.get("insight_mes"),
    });
  if (!dados.success) return { erro: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("limites_ia")
    .upsert({ ...dados.data, atualizado_em: new Date().toISOString() }, { onConflict: "familia_id" });
  if (error) return { erro: "Não foi possível salvar os limites." };
  revalidatePath(`/consultor/familias/${dados.data.familia_id}`);
  revalidatePath("/consultor");
  return { ok: "Limites salvos." };
}

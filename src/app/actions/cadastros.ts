"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { CLASSES, NATUREZAS, TIPOS_CONTA } from "@/lib/dominio";
import { normalizarDescricao } from "@/lib/lancamentos/regras-de-negocio";

export type EstadoCadastro = { erro?: string; ok?: string; salvoEm?: number } | undefined;

function revalidar() {
  revalidatePath("/lancamentos", "layout");
}

const idOpcional = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable());

const dia = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v ? Number(v) : null))
  .pipe(z.number().int().min(1, "Dia entre 1 e 31.").max(31, "Dia entre 1 e 31.").nullable());

/** Erro de unicidade do Postgres vira mensagem amigável. */
function mensagemErro(code: string | undefined, duplicado: string, padrao: string) {
  return code === "23505" ? duplicado : padrao;
}

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

const esquemaConta = z
  .object({
    id: idOpcional,
    nome: z.string().trim().min(1, "Informe o nome.").max(60),
    tipo: z.enum(TIPOS_CONTA),
    dia_fechamento: dia,
    dia_vencimento: dia,
  })
  .refine((c) => c.tipo !== "cartao_credito" || (c.dia_fechamento && c.dia_vencimento), {
    message: "Cartão de crédito precisa dos dias de fechamento e vencimento.",
  })
  .transform((c) =>
    c.tipo === "cartao_credito" ? c : { ...c, dia_fechamento: null, dia_vencimento: null },
  );

export async function salvarConta(_: EstadoCadastro, fd: FormData): Promise<EstadoCadastro> {
  const { familia } = await obterFamiliaAtiva();
  const d = esquemaConta.safeParse(Object.fromEntries(fd));
  if (!d.success) return { erro: d.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { id, ...campos } = d.data;
  const { error } = id
    ? await supabase.from("contas").update(campos).eq("id", id).eq("familia_id", familia.id)
    : await supabase.from("contas").insert({ ...campos, familia_id: familia.id });
  if (error) return { erro: mensagemErro(error.code, "Já existe uma conta com esse nome.", "Não foi possível salvar a conta.") };
  revalidar();
  return { ok: id ? "Conta atualizada." : "Conta criada.", salvoEm: Date.now() };
}

export async function alternarConta(id: string, ativa: boolean) {
  const { familia } = await obterFamiliaAtiva();
  const supabase = await criarClienteServidor();
  await supabase.from("contas").update({ ativa }).eq("id", z.uuid().parse(id)).eq("familia_id", familia.id);
  revalidar();
}

/** Só exclui conta sem lançamentos; com lançamentos, o caminho é desativar. */
export async function excluirConta(id: string): Promise<{ erro?: string }> {
  const { familia } = await obterFamiliaAtiva();
  const supabase = await criarClienteServidor();
  const contaId = z.uuid().parse(id);
  const { count } = await supabase
    .from("lancamentos")
    .select("id", { count: "exact", head: true })
    .eq("familia_id", familia.id)
    .eq("conta_id", contaId);
  if (count) return { erro: `Esta conta tem ${count} lançamento(s). Desative-a em vez de excluir.` };
  const { error } = await supabase.from("contas").delete().eq("id", contaId).eq("familia_id", familia.id);
  if (error) return { erro: "Não foi possível excluir a conta." };
  revalidar();
  return {};
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

const esquemaCategoria = z.object({
  id: idOpcional,
  nome: z.string().trim().min(1, "Informe o nome.").max(40),
  classe_padrao: z.enum(CLASSES),
});

export async function salvarCategoria(_: EstadoCadastro, fd: FormData): Promise<EstadoCadastro> {
  const { familia } = await obterFamiliaAtiva();
  const d = esquemaCategoria.safeParse(Object.fromEntries(fd));
  if (!d.success) return { erro: d.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { id, ...campos } = d.data;
  let error;
  if (id) {
    ({ error } = await supabase.from("categorias").update(campos).eq("id", id).eq("familia_id", familia.id));
  } else {
    const { data: ultima } = await supabase
      .from("categorias")
      .select("ordem")
      .eq("familia_id", familia.id)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    ({ error } = await supabase
      .from("categorias")
      .insert({ ...campos, familia_id: familia.id, ordem: (ultima?.ordem ?? 0) + 1 }));
  }
  if (error) return { erro: mensagemErro(error.code, "Já existe uma categoria com esse nome.", "Não foi possível salvar a categoria.") };
  revalidar();
  return { ok: id ? "Categoria atualizada." : "Categoria criada.", salvoEm: Date.now() };
}

export async function arquivarCategoria(id: string, arquivada: boolean) {
  const { familia } = await obterFamiliaAtiva();
  const supabase = await criarClienteServidor();
  await supabase.from("categorias").update({ arquivada }).eq("id", z.uuid().parse(id)).eq("familia_id", familia.id);
  revalidar();
}

/** Troca a posição da categoria com a vizinha de cima ou de baixo. */
export async function moverCategoria(id: string, direcao: "cima" | "baixo") {
  const { familia } = await obterFamiliaAtiva();
  const supabase = await criarClienteServidor();
  const { data: todas } = await supabase
    .from("categorias")
    .select("id, ordem")
    .eq("familia_id", familia.id)
    .order("ordem")
    .order("nome");
  if (!todas) return;
  const i = todas.findIndex((c) => c.id === id);
  const j = direcao === "cima" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= todas.length) return;
  // Renumera tudo para evitar empates de ordem.
  const nova = [...todas];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  await Promise.all(
    nova.map((c, k) =>
      c.ordem === k + 1 ? null : supabase.from("categorias").update({ ordem: k + 1 }).eq("id", c.id).eq("familia_id", familia.id),
    ),
  );
  revalidar();
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

const esquemaRegra = z
  .object({
    id: idOpcional,
    padrao: z
      .string()
      .transform((p) => normalizarDescricao(p))
      .pipe(z.string().min(2, "O padrão precisa de pelo menos 2 letras.").max(60)),
    natureza: z.enum(NATUREZAS),
    categoria_id: idOpcional,
    classe: z
      .string()
      .nullable()
      .optional()
      .transform((v) => v || null)
      .pipe(z.enum(CLASSES).nullable()),
    conta_id: idOpcional,
    assinatura: z.boolean(),
  })
  .refine((r) => r.natureza !== "fluxo" || r.categoria_id, { message: "Escolha a categoria da regra." })
  .transform((r) => (r.natureza === "fluxo" ? r : { ...r, categoria_id: null, classe: null }));

export async function salvarRegra(_: EstadoCadastro, fd: FormData): Promise<EstadoCadastro> {
  const { familia } = await obterFamiliaAtiva();
  const d = esquemaRegra.safeParse({ ...Object.fromEntries(fd), assinatura: fd.get("assinatura") === "on" });
  if (!d.success) return { erro: d.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { id, ...campos } = d.data;

  // Sem classe informada, usa a classe padrão da categoria.
  if (campos.natureza === "fluxo" && campos.categoria_id && !campos.classe) {
    const { data: cat } = await supabase
      .from("categorias")
      .select("classe_padrao")
      .eq("id", campos.categoria_id)
      .eq("familia_id", familia.id)
      .maybeSingle();
    campos.classe = (cat?.classe_padrao as typeof campos.classe) ?? null;
  }

  const { error } = id
    ? await supabase.from("regras").update(campos).eq("id", id).eq("familia_id", familia.id)
    : await supabase.from("regras").upsert({ ...campos, familia_id: familia.id }, { onConflict: "familia_id,padrao" });
  if (error) return { erro: "Não foi possível salvar a regra." };
  revalidar();
  return { ok: id ? "Regra atualizada." : `Regra criada: "${campos.padrao}".`, salvoEm: Date.now() };
}

export async function excluirRegra(id: string) {
  const { familia } = await obterFamiliaAtiva();
  const supabase = await criarClienteServidor();
  await supabase.from("regras").delete().eq("id", z.uuid().parse(id)).eq("familia_id", familia.id);
  revalidar();
}

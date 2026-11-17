"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { lerValorBRL } from "@/lib/lancamentos/regras-de-negocio";
import { mesAtual, somarMeses } from "@/lib/format";
import { situacaoProjeto } from "@/lib/objetivos";

export type Resultado = { erro?: string; erros?: Record<string, string>; ok?: string };

const dinheiro = (rotulo: string, opcional = false) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    if (v === "") {
      if (!opcional) ctx.addIssue({ code: "custom", message: `Informe ${rotulo}.` });
      return null;
    }
    const n = typeof v === "number" ? v : lerValorBRL(v);
    if (n === null || n < 0) {
      ctx.addIssue({ code: "custom", message: `Valor inválido para ${rotulo.replace(/^(o|a) /, "")} (ex.: 1.234,56).` });
      return null;
    }
    return n;
  });
const numero = (min: number, max: number, msg: string) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").replace("%", "").trim());
    if (String(v).trim() === "" || !Number.isFinite(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: msg });
      return 0;
    }
    return n;
  });
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês (AAAA-MM).");

function errosDe(e: z.ZodError): Resultado {
  const erros: Record<string, string> = {};
  for (const i of e.issues) erros[String(i.path[0] ?? "geral")] ??= i.message;
  return { erros, erro: "Confira os campos destacados." };
}
function revalidar() {
  revalidatePath("/objetivos");
  revalidatePath("/patrimonio");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Premissas (só o consultor)
// ---------------------------------------------------------------------------

const esquemaPremissas = z.object({
  liberdade_meta: dinheiro("a meta", true),
  liberdade_retorno_real_am: numero(0, 3, "Use um retorno real entre 0 e 3% a.m. (ex.: 0,40)."),
  liberdade_prazo_anos: numero(1, 60, "Prazo entre 1 e 60 anos.").pipe(z.number().int("Use anos inteiros.")),
  reserva_meses: numero(1, 36, "Entre 1 e 36 meses.").pipe(z.number().int("Use meses inteiros.")),
});

export async function salvarPremissas(entrada: z.input<typeof esquemaPremissas>): Promise<Resultado> {
  const { familia } = await obterFamiliaAtiva();
  if (!familia.consultor) return { erro: "Só o consultor altera as premissas." };
  const p = esquemaPremissas.safeParse(entrada);
  if (!p.success) return errosDe(p.error);
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("objetivos_config").update(p.data).eq("familia_id", familia.id);
  if (error) return { erro: "Não foi possível salvar as premissas." };
  revalidar();
  return {};
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------

const esquemaProjeto = z.object({
  id: z.uuid().optional(),
  nome: z.string().trim().min(1, "Informe o nome.").max(80),
  valor_alvo: dinheiro("o valor-alvo").refine((v) => v === null || v > 0, "O valor-alvo precisa ser maior que zero."),
  ja_guardado: dinheiro("o valor já guardado", true),
  prazo_mes: mes,
  ativo_id: z.uuid().nullable().optional(),
});

export async function salvarProjeto(entrada: z.input<typeof esquemaProjeto>): Promise<Resultado> {
  const { familia } = await obterFamiliaAtiva();
  const p = esquemaProjeto.safeParse(entrada);
  if (!p.success) return errosDe(p.error);
  const { id, ...d } = p.data;
  const dados = { ...d, ja_guardado: d.ja_guardado ?? 0, ativo_id: d.ativo_id ?? null };
  const supabase = await criarClienteServidor();
  const { error } = id
    ? await supabase.from("projetos").update(dados).eq("familia_id", familia.id).eq("id", id)
    : await supabase.from("projetos").insert({ ...dados, familia_id: familia.id });
  if (error) return { erro: "Não foi possível salvar o projeto." };
  revalidar();
  return {};
}

export async function atualizarGuardado(id: string, valor: string): Promise<Resultado> {
  const { familia } = await obterFamiliaAtiva();
  const v = lerValorBRL(valor);
  if (!z.uuid().safeParse(id).success) return { erro: "Projeto inválido." };
  if (v === null || v < 0) return { erros: { ja_guardado: "Valor inválido (ex.: 1.234,56)." }, erro: "Confira o valor." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("projetos").update({ ja_guardado: v }).eq("familia_id", familia.id).eq("id", id);
  if (error) return { erro: "Não foi possível atualizar." };
  revalidar();
  return {};
}

export async function excluirProjeto(id: string): Promise<Resultado> {
  const { familia } = await obterFamiliaAtiva();
  if (!z.uuid().safeParse(id).success) return { erro: "Projeto inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("projetos").delete().eq("familia_id", familia.id).eq("id", id);
  if (error) return { erro: "Não foi possível excluir." };
  revalidar();
  return {};
}

/**
 * Consultor: cria no orçamento previsto o aporte mensal do projeto (classe Sonhos), do próximo
 * mês até o prazo, limitado ao horizonte da família. Não repete meses que já têm esse aporte.
 */
export async function preverAporteProjeto(id: string): Promise<Resultado> {
  const { familia } = await obterFamiliaAtiva();
  if (!familia.consultor) return { erro: "Só o consultor altera o orçamento previsto." };
  if (!z.uuid().safeParse(id).success) return { erro: "Projeto inválido." };
  const supabase = await criarClienteServidor();
  const [{ data: p }, { data: fam }, { data: cat }] = await Promise.all([
    supabase.from("projetos").select("nome, valor_alvo, ja_guardado, prazo_mes").eq("familia_id", familia.id).eq("id", id).maybeSingle(),
    supabase.from("familias").select("inicio_planejamento, meses_horizonte").eq("id", familia.id).single(),
    supabase.from("categorias").select("id").eq("familia_id", familia.id).eq("classe_padrao", "Sonhos").eq("arquivada", false).order("ordem").limit(1).maybeSingle(),
  ]);
  if (!p || !fam) return { erro: "Projeto não encontrado." };
  if (!cat) return { erro: "Crie antes uma categoria da classe Sonhos." };

  const atual = mesAtual();
  const s = situacaoProjeto({ valor_alvo: Number(p.valor_alvo), ja_guardado: Number(p.ja_guardado), prazo_mes: p.prazo_mes }, atual);
  if (s.status !== "andamento") return { erro: "O projeto já foi concluído ou o prazo passou." };
  const fimHorizonte = somarMeses(fam.inicio_planejamento, fam.meses_horizonte - 1);
  const descricao = `Aporte: ${p.nome}`.slice(0, 200);
  const meses = Array.from({ length: s.mesesRestantes }, (_, i) => somarMeses(atual, i + 1)).filter((m) => m <= fimHorizonte);
  if (!meses.length) return { erro: "Os meses do projeto ficam fora do horizonte do planejamento." };

  const { data: existentes } = await supabase
    .from("lancamentos")
    .select("mes_competencia")
    .eq("familia_id", familia.id)
    .eq("tipo", "Previsto")
    .eq("descricao", descricao)
    .in("mes_competencia", meses);
  const ja = new Set((existentes ?? []).map((e) => e.mes_competencia));
  const novos = meses
    .filter((m) => !ja.has(m))
    .map((m) => ({
      familia_id: familia.id,
      tipo: "Previsto",
      natureza: "fluxo",
      mes_competencia: m,
      descricao,
      valor: s.porMes,
      categoria_id: cat.id,
      classe: "Sonhos",
      origem: "manual",
    }));
  if (!novos.length) return { ok: "O aporte já estava previsto em todos os meses." };
  const { error } = await supabase.from("lancamentos").insert(novos);
  if (error) return { erro: "Não foi possível criar os previstos." };
  revalidar();
  revalidatePath("/lancamentos");
  const fora = s.mesesRestantes - meses.length;
  return { ok: `${novos.length} mês(es) previsto(s) com ${s.porMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${fora > 0 ? `; ${fora} mês(es) ficaram fora do horizonte` : ""}.` };
}

// ---------------------------------------------------------------------------
// Consórcio: prazo e parcelas pagas
// ---------------------------------------------------------------------------

const esquemaConsorcio = z
  .object({
    id: z.uuid(),
    prazo: numero(1, 400, "Prazo inválido.").pipe(z.number().int("Use meses inteiros.")),
    pagas: numero(0, 400, "Número inválido.").pipe(z.number().int("Use um número inteiro.")),
    parcela: dinheiro("a parcela"),
    contemplado: z.boolean(),
  })
  .refine((c) => c.pagas <= c.prazo, { path: ["pagas"], message: "Mais parcelas pagas que o prazo." });

export async function atualizarConsorcio(entrada: z.input<typeof esquemaConsorcio>): Promise<Resultado> {
  const { familia } = await obterFamiliaAtiva();
  const p = esquemaConsorcio.safeParse(entrada);
  if (!p.success) return errosDe(p.error);
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("ativos")
    .update({
      consorcio_prazo_meses: p.data.prazo,
      consorcio_parcelas_pagas: p.data.pagas,
      consorcio_parcela_mensal: p.data.parcela,
      consorcio_contemplado: p.data.contemplado,
    })
    .eq("familia_id", familia.id)
    .eq("id", p.data.id)
    .eq("categoria", "Consórcio");
  if (error) return { erro: "Não foi possível atualizar o consórcio." };
  revalidar();
  return {};
}

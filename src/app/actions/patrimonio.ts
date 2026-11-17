"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { CATEGORIAS_ATIVO, RISCOS, TIPOS_PASSIVO } from "@/lib/patrimonio";
import { lerValorBRL } from "@/lib/lancamentos/regras-de-negocio";
import { hojeISO } from "@/lib/format";

export type Resultado = { erro?: string; erros?: Record<string, string> };

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const dinheiro = (rotulo: string, obrigatorio = true) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    if (v === "" || v === null) {
      if (obrigatorio) ctx.addIssue({ code: "custom", message: `Informe ${rotulo}.` });
      return null;
    }
    const n = typeof v === "number" ? v : lerValorBRL(v);
    if (n === null || n < 0) {
      ctx.addIssue({ code: "custom", message: `Valor inválido para ${rotulo.replace(/^(o|a) /, "")} (ex.: 1.234,56).` });
      return null;
    }
    return n;
  });
const inteiro = z.union([z.string(), z.number()]).transform((v, ctx) => {
  if (v === "" || v === null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) {
    ctx.addIssue({ code: "custom", message: "Use um número inteiro." });
    return null;
  }
  return n;
});
const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((d) => d <= hojeISO(), "A data do saldo não pode estar no futuro.");

function errosDe(e: z.ZodError): Resultado {
  const erros: Record<string, string> = {};
  for (const i of e.issues) erros[String(i.path[0] ?? "geral")] ??= i.message;
  return { erros, erro: "Confira os campos destacados." };
}

function revalidar() {
  revalidatePath("/patrimonio", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/objetivos");
}

// ---------------------------------------------------------------------------
// Ativos
// ---------------------------------------------------------------------------

const esquemaAtivo = z
  .object({
    id: z.uuid().optional(),
    nome: z.string().trim().min(1, "Informe o nome.").max(120),
    categoria: z.enum(CATEGORIAS_ATIVO, "Escolha a categoria."),
    instituicao: texto(80),
    produto: texto(120),
    valor: dinheiro("o saldo"),
    liquidez: texto(40),
    risco: z.enum(RISCOS).nullable().optional(),
    data_saldo: data,
    consorcio_prazo_meses: inteiro.optional(),
    consorcio_parcelas_pagas: inteiro.optional(),
    consorcio_parcela_mensal: dinheiro("a parcela", false).optional(),
    consorcio_contemplado: z.boolean().optional(),
    conta_liberdade: z.boolean().optional(),
  })
  .superRefine((a, ctx) => {
    if (a.categoria !== "Consórcio") return;
    if (!a.consorcio_prazo_meses) ctx.addIssue({ code: "custom", path: ["consorcio_prazo_meses"], message: "Informe o prazo total." });
    if (a.consorcio_parcelas_pagas == null) ctx.addIssue({ code: "custom", path: ["consorcio_parcelas_pagas"], message: "Informe as parcelas pagas." });
    if (a.consorcio_prazo_meses && a.consorcio_parcelas_pagas != null && a.consorcio_parcelas_pagas > a.consorcio_prazo_meses)
      ctx.addIssue({ code: "custom", path: ["consorcio_parcelas_pagas"], message: "Mais parcelas pagas que o prazo." });
    if (!a.consorcio_parcela_mensal) ctx.addIssue({ code: "custom", path: ["consorcio_parcela_mensal"], message: "Informe a parcela mensal." });
  });

export async function salvarAtivo(entrada: z.input<typeof esquemaAtivo>): Promise<Resultado> {
  const { familia } = await obterFamiliaAtiva();
  const p = esquemaAtivo.safeParse(entrada);
  if (!p.success) return errosDe(p.error);
  const { id, ...a } = p.data;
  const consorcio = a.categoria === "Consórcio";
  const dados = {
    ...a,
    risco: a.risco ?? null,
    consorcio_prazo_meses: consorcio ? a.consorcio_prazo_meses : null,
    consorcio_parcelas_pagas: consorcio ? a.consorcio_parcelas_pagas : null,
    consorcio_parcela_mensal: consorcio ? a.consorcio_parcela_mensal : null,
    consorcio_contemplado: consorcio ? Boolean(a.consorcio_contemplado) : null,
  };
  const supabase = await criarClienteServidor();
  const { error } = id
    ? await supabase.from("ativos").update(dados).eq("familia_id", familia.id).eq("id", id)
    : await supabase.from("ativos").insert({ ...dados, familia_id: familia.id });
  if (error) return { erro: "Não foi possível salvar o ativo." };
  revalidar();
  return {};
}

const esquemaSaldo = z.object({ id: z.uuid(), valor: dinheiro("o saldo"), data_saldo: data });

/** Atualização rápida: só o novo saldo e a data dele (grava um ponto no histórico). */
export async function atualizarSaldoAtivo(entrada: z.input<typeof esquemaSaldo>): Promise<Resultado> {
  const { familia } = await obterFamiliaAtiva();
  const p = esquemaSaldo.safeParse(entrada);
  if (!p.success) return errosDe(p.error);
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("ativos")
    .update({ valor: p.data.valor, data_saldo: p.data.data_saldo, valor_liquido: null })
    .eq("familia_id", familia.id)
    .eq("id", p.data.id);
  if (error) return { erro: "Não foi possível atualizar o saldo." };
  revalidar();
  return {};
}

export async function excluirAtivo(id: string): Promise<Resultado> {
  const { familia } = await obterFamiliaAtiva();
  if (!z.uuid().safeParse(id).success) return { erro: "Ativo inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("ativos").delete().eq("familia_id", familia.id).eq("id", id);
  if (error) return { erro: "Não foi possível excluir o ativo." };
  revalidar();
  return {};
}

// ---------------------------------------------------------------------------
// Dívidas
// ---------------------------------------------------------------------------

const esquemaPassivo = z.object({
  id: z.uuid().optional(),
  nome: z.string().trim().min(1, "Informe o nome.").max(120),
  tipo: z.enum(TIPOS_PASSIVO, "Escolha o tipo."),
  instituicao: texto(80),
  saldo_devedor: dinheiro("o saldo devedor"),
  parcela_mensal: dinheiro("a parcela", false).optional(),
  taxa_am: z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      if (v === "" || v === null) return null;
      const n = typeof v === "number" ? v : Number(String(v).replace("%", "").replace(",", ".").trim());
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        ctx.addIssue({ code: "custom", message: "Taxa inválida (ex.: 1,49)." });
        return null;
      }
      return n;
    })
    .optional(),
  parcelas_restantes: inteiro.optional(),
  data_saldo: data,
});

export async function salvarPassivo(entrada: z.input<typeof esquemaPassivo>): Promise<Resultado> {
  const { familia } = await obterFamiliaAtiva();
  const p = esquemaPassivo.safeParse(entrada);
  if (!p.success) return errosDe(p.error);
  const { id, ...d } = p.data;
  const supabase = await criarClienteServidor();
  const { error } = id
    ? await supabase.from("passivos").update(d).eq("familia_id", familia.id).eq("id", id)
    : await supabase.from("passivos").insert({ ...d, familia_id: familia.id });
  if (error) return { erro: "Não foi possível salvar a dívida." };
  revalidar();
  return {};
}

export async function excluirPassivo(id: string): Promise<Resultado> {
  const { familia } = await obterFamiliaAtiva();
  if (!z.uuid().safeParse(id).success) return { erro: "Dívida inválida." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("passivos").delete().eq("familia_id", familia.id).eq("id", id);
  if (error) return { erro: "Não foi possível excluir a dívida." };
  revalidar();
  return {};
}

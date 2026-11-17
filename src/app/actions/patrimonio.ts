"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { CAMPOS_DA_CATEGORIA, CATEGORIAS_ATIVO, METODOS_EQUITY, RISCOS, TIPOS_PASSIVO, valorEquity } from "@/lib/patrimonio";
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
    nome: z.string().trim().max(120).optional(),
    categoria: z.enum(CATEGORIAS_ATIVO, "Escolha a categoria."),
    instituicao: texto(80),
    produto: texto(120),
    valor: dinheiro("o saldo", false),
    liquidez: texto(40),
    risco: z.enum(RISCOS).nullable().optional(),
    data_saldo: data,
    consorcio_prazo_meses: inteiro.optional(),
    consorcio_parcelas_pagas: inteiro.optional(),
    consorcio_parcela_mensal: dinheiro("a parcela", false).optional(),
    consorcio_contemplado: z.boolean().optional(),
    conta_liberdade: z.boolean().optional(),
    previdencia_tipo: z.enum(["PGBL", "VGBL"]).nullable().optional(),
    reserva_valor: dinheiro("a parte da reserva", false).optional(),
    equity_participacao: z
      .union([z.string(), z.number()])
      .transform((v, ctx) => {
        if (v === "") return null;
        const n = typeof v === "number" ? v : Number(String(v).replace("%", "").replace(",", ".").trim());
        if (!Number.isFinite(n) || n <= 0 || n > 100) {
          ctx.addIssue({ code: "custom", message: "Participação entre 0 e 100%." });
          return null;
        }
        return n;
      })
      .optional(),
    equity_metodo: z.enum(METODOS_EQUITY).nullable().optional(),
    equity_base: dinheiro("o valor-base", false).optional(),
    equity_multiplo: z
      .union([z.string(), z.number()])
      .transform((v, ctx) => {
        if (v === "") return null;
        const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").replace(/x$/i, "").trim());
        if (!Number.isFinite(n) || n <= 0 || n > 1000) {
          ctx.addIssue({ code: "custom", message: "Múltiplo inválido (ex.: 6 ou 1,5)." });
          return null;
        }
        return n;
      })
      .optional(),
  })
  .superRefine((a, ctx) => {
    if (a.categoria !== "FGTS" && !a.nome) ctx.addIssue({ code: "custom", path: ["nome"], message: "Informe o nome." });
    if (a.categoria !== "Equity" && a.valor === null) ctx.addIssue({ code: "custom", path: ["valor"], message: "Informe o valor." });
    if (a.categoria === "Equity") {
      if (!a.equity_participacao) ctx.addIssue({ code: "custom", path: ["equity_participacao"], message: "Informe a participação (%)." });
      if (!a.equity_metodo) ctx.addIssue({ code: "custom", path: ["equity_metodo"], message: "Escolha como estimar o valor." });
      if (!a.equity_base) ctx.addIssue({ code: "custom", path: ["equity_base"], message: "Informe o valor-base." });
      if (a.equity_metodo && a.equity_metodo !== "valuation" && !a.equity_multiplo)
        ctx.addIssue({ code: "custom", path: ["equity_multiplo"], message: "Informe o múltiplo." });
    }
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
  const equity = a.categoria === "Equity";
  const campos = CAMPOS_DA_CATEGORIA[a.categoria];
  // Cada categoria guarda só os campos que fazem sentido para ela.
  const dados = {
    ...a,
    nome: a.categoria === "FGTS" ? a.nome || "FGTS" : a.nome!,
    instituicao: campos.instituicao ? (a.instituicao ?? null) : null,
    // Bem: o tipo (imóvel, terreno, veículo) fica em "produto".
    produto: campos.produto || a.categoria === "Bem" ? (a.produto ?? null) : null,
    liquidez: campos.liquidezRisco ? (a.liquidez ?? null) : null,
    risco: campos.liquidezRisco ? (a.risco ?? null) : null,
    conta_liberdade: campos.liberdade ? Boolean(a.conta_liberdade) : false,
    previdencia_tipo: a.categoria === "Previdência" ? (a.previdencia_tipo ?? null) : null,
    reserva_valor: a.categoria === "Investimentos" && a.reserva_valor ? a.reserva_valor : null,
    equity_participacao: equity ? a.equity_participacao : null,
    equity_metodo: equity ? a.equity_metodo : null,
    equity_base: equity ? a.equity_base : null,
    equity_multiplo: equity && a.equity_metodo !== "valuation" ? a.equity_multiplo : null,
    valor: equity ? valorEquity(a.equity_metodo!, a.equity_base!, a.equity_multiplo ?? null, a.equity_participacao!) : a.valor!,
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

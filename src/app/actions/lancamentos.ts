"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { esquemaEdicaoEmMassa, esquemaLancamento } from "@/lib/lancamentos/schema";
import { normalizarCampos, regraParaDescricao, sugerirPadrao } from "@/lib/lancamentos/regras-de-negocio";
import { somarMeses } from "@/lib/format";
import type { LinhaPrevisto } from "@/lib/planilha/previsto";
import type { Classe, Natureza } from "@/lib/dominio";

export type SugestaoRegra = {
  padrao: string;
  natureza: Natureza;
  categoria_id: string | null;
  classe: Classe | null;
  conta_id: string | null;
  assinatura: boolean;
  categoria_nome?: string;
};

export type EstadoLancamento =
  | { erro?: string; erros?: Record<string, string>; ok?: string; sugerirRegra?: SugestaoRegra; salvoEm?: number }
  | undefined;

const AVISO_PREVISTO = "O orçamento previsto é definido pelo seu consultor. Você pode lançar o realizado.";

/** Mesma data, n meses depois (dia limitado ao fim do mês). */
function somarMesesNaData(dataISO: string, n: number) {
  const [a, m, d] = dataISO.split("-").map(Number);
  const mes = somarMeses(`${a}-${String(m).padStart(2, "0")}`, n);
  const [na, nm] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(na, nm, 0)).getUTCDate();
  return `${mes}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

function revalidar() {
  revalidatePath("/lancamentos", "layout");
  revalidatePath("/dashboard");
}

/** Lê o formulário do lançamento como objeto simples (checkbox marcado = "on"). */
function lerForm(fd: FormData) {
  const s = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : null;
  };
  return {
    tipo: s("tipo"),
    natureza: s("natureza") ?? "fluxo",
    mes_competencia: s("mes_competencia"),
    data: s("data"),
    descricao: s("descricao") ?? "",
    valor: s("valor") ?? "",
    estorno: fd.get("estorno") === "on",
    conta_id: s("conta_id"),
    categoria_id: s("categoria_id"),
    classe: s("classe"),
    subtipo_receita: s("subtipo_receita"),
    ativo_id: s("ativo_id"),
    assinatura: fd.get("assinatura") === "on",
    obs: s("obs"),
  };
}

const esquemaRepetir = z.coerce.number().int().min(0, "Entre 0 e 59.").max(59, "Entre 0 e 59.");

export async function salvarLancamento(_: EstadoLancamento, fd: FormData): Promise<EstadoLancamento> {
  const { familia, ctx } = await obterFamiliaAtiva();
  const id = fd.get("id") ? z.uuid().safeParse(fd.get("id")) : null;
  if (id && !id.success) return { erro: "Lançamento inválido." };

  const dados = esquemaLancamento.safeParse(lerForm(fd));
  if (!dados.success) {
    const erros: Record<string, string> = {};
    for (const i of dados.error.issues) erros[String(i.path[0] ?? "geral")] ??= i.message;
    return { erro: "Confira os campos destacados.", erros };
  }

  const supabase = await criarClienteServidor();
  const l = dados.data;

  if (!id) {
    if (l.tipo === "Previsto" && !familia.consultor) return { erro: AVISO_PREVISTO };
    const repetir = esquemaRepetir.safeParse(fd.get("repetir") || 0);
    if (!repetir.success) return { erro: "Confira os campos destacados.", erros: { repetir: repetir.error.issues[0].message } };
    const n = l.tipo === "Previsto" ? repetir.data : 0;

    const linhas = Array.from({ length: n + 1 }, (_, i) => ({
      ...l,
      mes_competencia: somarMeses(l.mes_competencia, i),
      data: l.data && i > 0 ? somarMesesNaData(l.data, i) : l.data,
      familia_id: familia.id,
      origem: "manual",
      criado_por: ctx.usuario.id,
    }));
    const { error } = await supabase.from("lancamentos").insert(linhas);
    if (error) return { erro: "Não foi possível salvar o lançamento." };
    revalidar();
    return { ok: n > 0 ? `${n + 1} lançamentos previstos criados (${n + 1} meses).` : "Lançamento criado.", salvoEm: Date.now() };
  }

  const { data: antes } = await supabase
    .from("lancamentos")
    .select("categoria_id, natureza, origem, tipo")
    .eq("id", id.data)
    .eq("familia_id", familia.id)
    .maybeSingle();
  if (!antes) return { erro: "Lançamento não encontrado." };
  if (!familia.consultor && (l.tipo === "Previsto" || antes.tipo === "Previsto") && antes.origem !== "ia-parcela") {
    return { erro: AVISO_PREVISTO };
  }

  const { error } = await supabase.from("lancamentos").update(l).eq("id", id.data).eq("familia_id", familia.id);
  if (error) return { erro: "Não foi possível salvar o lançamento." };
  revalidar();

  // Corrigiu a categoria (ou a natureza) de um lançamento importado? Oferece criar uma regra.
  const importado = antes.origem === "ia" || antes.origem === "ia-parcela";
  const corrigiu = antes.categoria_id !== l.categoria_id || antes.natureza !== l.natureza;
  if (importado && corrigiu) {
    const { data: regras } = await supabase
      .from("regras")
      .select("padrao, categoria_id, natureza")
      .eq("familia_id", familia.id);
    const atual = regraParaDescricao(l.descricao, regras ?? []);
    const jaCoberta = atual && atual.categoria_id === l.categoria_id && atual.natureza === l.natureza;
    if (!jaCoberta) {
      const { data: cat } = l.categoria_id
        ? await supabase.from("categorias").select("nome").eq("id", l.categoria_id).maybeSingle()
        : { data: null };
      return {
        ok: "Lançamento atualizado.",
        salvoEm: Date.now(),
        sugerirRegra: {
          padrao: sugerirPadrao(l.descricao),
          natureza: l.natureza,
          categoria_id: l.categoria_id,
          classe: l.classe,
          conta_id: l.conta_id,
          assinatura: l.assinatura,
          categoria_nome: cat?.nome,
        },
      };
    }
  }
  return { ok: "Lançamento atualizado.", salvoEm: Date.now() };
}

export async function excluirLancamentos(ids: string[]): Promise<{ erro?: string; excluidos?: number }> {
  const { familia } = await obterFamiliaAtiva();
  const valido = z.array(z.uuid()).min(1).max(500).safeParse(ids);
  if (!valido.success) return { erro: "Seleção inválida." };

  const supabase = await criarClienteServidor();
  if (!familia.consultor) {
    const { data: previstos } = await supabase
      .from("lancamentos")
      .select("id")
      .in("id", valido.data)
      .eq("tipo", "Previsto")
      .neq("origem", "ia-parcela");
    if (previstos?.length) return { erro: AVISO_PREVISTO };
  }
  const { data, error } = await supabase
    .from("lancamentos")
    .delete()
    .in("id", valido.data)
    .eq("familia_id", familia.id)
    .select("id");
  if (error) return { erro: "Não foi possível excluir." };
  revalidar();
  return { excluidos: data?.length ?? 0 };
}

export async function editarEmMassa(entrada: {
  ids: string[];
  natureza?: string;
  categoria_id?: string;
  classe?: string;
  mes_competencia?: string;
}): Promise<{ erro?: string; alterados?: number }> {
  const { familia } = await obterFamiliaAtiva();
  const d = esquemaEdicaoEmMassa.safeParse(entrada);
  if (!d.success) return { erro: d.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { data: atuais, error: erroLeitura } = await supabase
    .from("lancamentos")
    .select("id, tipo, origem, natureza, classe, categoria_id, subtipo_receita, ativo_id")
    .in("id", d.data.ids)
    .eq("familia_id", familia.id);
  if (erroLeitura || !atuais) return { erro: "Não foi possível carregar a seleção." };
  if (!familia.consultor && atuais.some((a) => a.tipo === "Previsto" && a.origem !== "ia-parcela")) {
    return { erro: "A seleção tem lançamentos previstos, que só o consultor altera. Filtre por Realizado e tente de novo." };
  }

  // Classe padrão da categoria escolhida, quando a classe não foi informada.
  let classePadrao: Classe | undefined;
  if (d.data.categoria_id) {
    const { data: cat } = await supabase
      .from("categorias")
      .select("classe_padrao")
      .eq("id", d.data.categoria_id)
      .eq("familia_id", familia.id)
      .maybeSingle();
    if (!cat) return { erro: "Categoria inválida." };
    classePadrao = cat.classe_padrao as Classe;
  }

  // Cada linha é ajustada para continuar coerente (ex.: virar transferência limpa a classe).
  let alterados = 0;
  for (const atual of atuais) {
    const novo = normalizarCampos({
      natureza: (d.data.natureza ?? atual.natureza) as Natureza,
      classe: (d.data.classe ?? (d.data.categoria_id ? classePadrao : atual.classe)) as Classe | null,
      categoria_id: d.data.categoria_id ?? atual.categoria_id,
      subtipo_receita: atual.subtipo_receita,
      ativo_id: atual.ativo_id,
    });
    if (novo.natureza === "fluxo" && (!novo.classe || !novo.categoria_id)) {
      return {
        erro: "Para virar receita ou despesa, escolha também a categoria.",
        alterados,
      };
    }
    const { error } = await supabase
      .from("lancamentos")
      .update({ ...novo, ...(d.data.mes_competencia ? { mes_competencia: d.data.mes_competencia } : {}) })
      .eq("id", atual.id)
      .eq("familia_id", familia.id);
    if (error) return { erro: "Parte da seleção não pôde ser alterada.", alterados };
    alterados++;
  }
  revalidar();
  return { alterados };
}

/** "Quitou ou antecipou?": remove as parcelas previstas que ainda não chegaram, depois do mês informado. */
export async function removerParcelasFuturas(grupo: string, aposMes: string): Promise<{ erro?: string; removidas?: number }> {
  const { familia } = await obterFamiliaAtiva();
  const ok = z.object({ grupo: z.uuid(), mes: z.string().regex(/^\d{4}-\d{2}$/) }).safeParse({ grupo, mes: aposMes });
  if (!ok.success) return { erro: "Parcelamento inválido." };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("lancamentos")
    .delete()
    .eq("familia_id", familia.id)
    .eq("grupo_parcela", grupo)
    .eq("tipo", "Previsto")
    .is("realizado_id", null)
    .gt("mes_competencia", aposMes)
    .select("id");
  if (error) return { erro: "Não foi possível remover as parcelas." };
  revalidar();
  return { removidas: data?.length ?? 0 };
}

const esquemaLinhaPlanilha = z.object({
  mes_competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  descricao: z.string().trim().min(1).max(200),
  valor: z.number().positive().max(1e11),
  conta_id: z.uuid().nullable(),
  categoria_id: z.uuid().nullable(),
  classe: z.enum(["Receita", "Despesa básica", "Padrão de vida", "Doações", "Sonhos"]).nullable(),
  natureza: z.enum(["fluxo", "transferencia", "aporte", "resgate"]),
  obs: z.string().max(500).nullable(),
});

/**
 * Importa o orçamento previsto (só consultor). As linhas já vêm lidas e conferidas
 * pela tela (lib/planilha/previsto.ts) e são validadas de novo aqui.
 * substituir = apaga antes o previsto importado por planilha nos meses da importação.
 */
export async function importarPrevisto(entrada: { linhas: LinhaPrevisto[]; substituir: boolean }): Promise<{ erro?: string; importadas?: number; removidas?: number }> {
  const { familia, ctx } = await obterFamiliaAtiva();
  if (!familia.consultor) return { erro: "Só o consultor importa o orçamento previsto." };

  const linhas = z.array(esquemaLinhaPlanilha).min(1, "Nenhuma linha válida para importar.").max(2000).safeParse(entrada.linhas);
  if (!linhas.success) return { erro: linhas.error.issues[0].message.startsWith("Nenhuma") ? linhas.error.issues[0].message : "Há linhas inválidas. Recarregue a planilha." };
  for (const l of linhas.data) {
    if (l.natureza === "fluxo" && (!l.categoria_id || !l.classe)) return { erro: "Há linhas sem categoria. Recarregue a planilha." };
  }

  const supabase = await criarClienteServidor();
  let removidas = 0;
  if (entrada.substituir) {
    const meses = [...new Set(linhas.data.map((l) => l.mes_competencia))];
    const { data, error } = await supabase
      .from("lancamentos")
      .delete()
      .eq("familia_id", familia.id)
      .eq("tipo", "Previsto")
      .eq("origem", "planilha")
      .in("mes_competencia", meses)
      .select("id");
    if (error) return { erro: "Não foi possível substituir o previsto existente." };
    removidas = data?.length ?? 0;
  }

  const registros = linhas.data.map((l) => ({
    ...normalizarCampos({ ...l, subtipo_receita: null }),
    familia_id: familia.id,
    tipo: "Previsto",
    origem: "planilha",
    criado_por: ctx.usuario.id,
  }));
  for (let i = 0; i < registros.length; i += 500) {
    const { error } = await supabase.from("lancamentos").insert(registros.slice(i, i + 500));
    if (error) {
      return {
        erro: `Parte da planilha não foi importada (a partir da linha ${i + 2}). Confira se as contas e categorias ainda existem.`,
        importadas: i,
        removidas,
      };
    }
  }
  revalidar();
  return { importadas: registros.length, removidas };
}

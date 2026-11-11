"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { esquemaEdicaoEmMassa, esquemaLancamento } from "@/lib/lancamentos/schema";
import { normalizarCampos, regraParaDescricao, sugerirPadrao } from "@/lib/lancamentos/regras-de-negocio";
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
    const { error } = await supabase
      .from("lancamentos")
      .insert({ ...l, familia_id: familia.id, origem: "manual", criado_por: ctx.usuario.id });
    if (error) return { erro: "Não foi possível salvar o lançamento." };
    revalidar();
    return { ok: "Lançamento criado.", salvoEm: Date.now() };
  }

  const { data: antes } = await supabase
    .from("lancamentos")
    .select("categoria_id, natureza, origem")
    .eq("id", id.data)
    .eq("familia_id", familia.id)
    .maybeSingle();
  if (!antes) return { erro: "Lançamento não encontrado." };

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
    .select("id, natureza, classe, categoria_id, subtipo_receita, ativo_id")
    .in("id", d.data.ids)
    .eq("familia_id", familia.id);
  if (erroLeitura || !atuais) return { erro: "Não foi possível carregar a seleção." };

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

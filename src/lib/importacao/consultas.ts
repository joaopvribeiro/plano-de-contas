import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Categoria, Conta, Regra } from "@/lib/dominio";
import { iaDisponivel } from "./ia";
import { conferirTotal, ehFatura, mesFaturaSugerido, montarRevisao, type Conferencia, type Duplicada, type LinhaRevisao, type ParcelaAberta } from "./revisao";
import type { DocumentoLido } from "./tipos";

export const VERSAO_CONSENTIMENTO_IA = "ia-v1";

export type SituacaoIA = { consentimento: boolean; disponivel: boolean; usados: number; limite: number; restantes: number };

export async function situacaoIA(familiaId: string, recurso: "extrato" | "relatorio" | "apolice" | "insight" = "extrato"): Promise<SituacaoIA> {
  const supabase = await criarClienteServidor();
  const [{ data: ok }, { data: uso }] = await Promise.all([
    supabase.rpc("familia_tem_consentimento_ia", { p_familia: familiaId, p_versao: VERSAO_CONSENTIMENTO_IA }),
    supabase.rpc("uso_ia_no_mes", { p_familia: familiaId, p_recurso: recurso }),
  ]);
  const linha = (Array.isArray(uso) ? uso[0] : uso) as { usados: number; limite: number | null } | undefined;
  const usados = linha?.usados ?? 0;
  const limite = linha?.limite ?? 0;
  return { consentimento: Boolean(ok), disponivel: iaDisponivel(), usados, limite, restantes: Math.max(limite - usados, 0) };
}

export type ImportacaoResumo = {
  id: string;
  status: "lendo" | "revisao" | "confirmada" | "descartada";
  criado_em: string;
  nomes_arquivos: string[];
  conta: string | null;
  erro: string | null;
  itens: number | null;
  gravados: number;
};

export async function listarImportacoes(familiaId: string): Promise<ImportacaoResumo[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("importacoes")
    .select("id, status, criado_em, nomes_arquivos, resposta_ia, contas(nome), lancamentos(count)")
    .eq("familia_id", familiaId)
    .eq("tipo", "extrato")
    .order("criado_em", { ascending: false })
    .limit(20);
  return (data ?? []).map((i) => {
    const r = i.resposta_ia as { erro?: string; documento?: DocumentoLido } | null;
    const contagem = i.lancamentos as unknown as { count: number }[] | null;
    return {
      id: i.id,
      status: i.status as ImportacaoResumo["status"],
      criado_em: i.criado_em,
      nomes_arquivos: i.nomes_arquivos ?? [],
      conta: (i.contas as unknown as { nome: string } | null)?.nome ?? null,
      erro: r?.erro ?? null,
      itens: r?.documento?.itens.length ?? null,
      gravados: contagem?.[0]?.count ?? 0,
    };
  });
}

export type Revisao = {
  importacao: { id: string; status: string; arquivos: string[]; nomes_arquivos: string[]; criado_em: string; origem: "ofx" | "csv" | "ia" };
  documento: DocumentoLido;
  conta: Conta;
  categorias: Categoria[];
  linhas: LinhaRevisao[];
  conferencia: Conferencia | null;
  mes_fatura: string | null;
};

/**
 * Monta a revisão no servidor: regras, sugestões, duplicadas e parcelas abertas.
 * A confirmação usa esta mesma montagem (data, valor e sentido nunca vêm do navegador).
 */
export async function carregarRevisao(familiaId: string, id: string, consultor: boolean): Promise<Revisao | null> {
  const supabase = await criarClienteServidor();
  const { data: imp } = await supabase
    .from("importacoes")
    .select("id, status, arquivos, nomes_arquivos, criado_em, conta_id, resposta_ia")
    .eq("familia_id", familiaId)
    .eq("id", id)
    .maybeSingle();
  const resposta = imp?.resposta_ia as { origem?: "ofx" | "csv" | "ia"; documento?: DocumentoLido } | null;
  if (!imp || !imp.conta_id || !resposta?.documento) return null;
  const doc = resposta.documento;

  const [{ data: conta }, { data: categorias }, { data: regras }, { data: dup }, { data: abertas }] = await Promise.all([
    supabase.from("contas").select("id, nome, tipo, dia_fechamento, dia_vencimento, ativa").eq("familia_id", familiaId).eq("id", imp.conta_id).single(),
    supabase.from("categorias").select("id, nome, classe_padrao, ordem, arquivada").eq("familia_id", familiaId).order("ordem").order("nome"),
    supabase.from("regras").select("id, padrao, natureza, categoria_id, classe, conta_id, assinatura").eq("familia_id", familiaId),
    supabase.rpc("possiveis_duplicadas", {
      p_familia: familiaId,
      p_conta: imp.conta_id,
      p_itens: doc.itens.map((x, idx) => ({ idx, data: x.data, valor: x.valor, descricao: x.descricao })),
    }),
    supabase
      .from("lancamentos")
      .select("id, descricao, valor, parcela, grupo_parcela, mes_competencia, origem, categoria_id, classe")
      .eq("familia_id", familiaId)
      .eq("conta_id", imp.conta_id)
      .eq("tipo", "Previsto")
      .is("realizado_id", null)
      .not("parcela", "is", null)
      .not("grupo_parcela", "is", null)
      .order("mes_competencia"),
  ]);
  if (!conta) return null;

  // A família só consegue ligar parcelas criadas pela importação; o consultor, qualquer uma.
  const parcelas = ((abertas ?? []) as (ParcelaAberta & { origem: string })[]).filter((p) => consultor || p.origem === "ia-parcela");
  const duplicadas = new Map<number, Duplicada>(
    ((dup ?? []) as { idx: number; lancamento_id: string; descricao: string; data: string; valor: number }[]).map((d) => [
      d.idx,
      { lancamento_id: d.lancamento_id, descricao: d.descricao, data: d.data, valor: Number(d.valor) },
    ]),
  );

  const ctx = {
    conta: conta as Conta,
    categorias: (categorias ?? []) as Categoria[],
    regras: (regras ?? []) as Regra[],
    duplicadas,
    parcelas_abertas: parcelas.map((p) => ({ ...p, valor: Number(p.valor) })),
  };
  const linhas = montarRevisao(doc, ctx);
  return {
    importacao: {
      id: imp.id,
      status: imp.status,
      arquivos: imp.arquivos ?? [],
      nomes_arquivos: imp.nomes_arquivos ?? [],
      criado_em: imp.criado_em,
      origem: resposta.origem ?? "ia",
    },
    documento: doc,
    conta: conta as Conta,
    categorias: ctx.categorias,
    linhas,
    conferencia: conferirTotal(doc, linhas),
    mes_fatura: ehFatura(doc, conta) ? (mesFaturaSugerido(doc, conta) ?? null) : null,
  };
}

import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Categoria, Conta, Lancamento, Regra } from "@/lib/dominio";
import type { Filtros } from "./schema";

export const LIMITE_LISTA = 1000;

const CAMPOS =
  "id, tipo, natureza, mes_competencia, data, descricao, valor, estorno, conta_id, categoria_id, classe, subtipo_receita, parcela, grupo_parcela, realizado_id, ativo_id, assinatura, obs, origem";

export type Cadastros = {
  contas: Conta[];
  categorias: Categoria[];
  regras: Regra[];
  ativos: { id: string; nome: string }[];
  familia: { inicio_planejamento: string; meses_horizonte: number };
};

export async function carregarCadastros(familiaId: string): Promise<Cadastros> {
  const supabase = await criarClienteServidor();
  const [contas, categorias, regras, ativos, familia] = await Promise.all([
    supabase.from("contas").select("id, nome, tipo, dia_fechamento, dia_vencimento, ativa").eq("familia_id", familiaId).order("nome"),
    supabase.from("categorias").select("id, nome, classe_padrao, ordem, arquivada").eq("familia_id", familiaId).order("ordem").order("nome"),
    supabase.from("regras").select("id, padrao, natureza, categoria_id, classe, conta_id, assinatura").eq("familia_id", familiaId).order("padrao"),
    supabase.from("ativos").select("id, nome").eq("familia_id", familiaId).in("categoria", ["Reserva", "Investimentos", "Previdência", "Fundo Fechado"]).order("nome"),
    supabase.from("familias").select("inicio_planejamento, meses_horizonte").eq("id", familiaId).single(),
  ]);
  return {
    contas: (contas.data ?? []) as Conta[],
    categorias: (categorias.data ?? []) as Categoria[],
    regras: (regras.data ?? []) as Regra[],
    ativos: ativos.data ?? [],
    familia: familia.data ?? { inicio_planejamento: "2026-01", meses_horizonte: 12 },
  };
}

/** Tira da busca os caracteres que têm significado na sintaxe de filtro do PostgREST. */
function limparBusca(q: string) {
  return q.replace(/[%_,.()*\\:"']/g, " ").replace(/\s+/g, " ").trim();
}

export async function listarLancamentos(familiaId: string, f: Filtros, mesPadrao: string) {
  const supabase = await criarClienteServidor();
  let q = supabase.from("lancamentos").select(CAMPOS).eq("familia_id", familiaId);

  const mes = f.mes ?? mesPadrao;
  if (mes !== "todos") q = q.eq("mes_competencia", mes);
  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.natureza) q = q.eq("natureza", f.natureza);
  if (f.classe) q = q.eq("classe", f.classe);
  if (f.categoria) q = q.eq("categoria_id", f.categoria);
  if (f.conta === "sem") q = q.is("conta_id", null);
  else if (f.conta) q = q.eq("conta_id", f.conta);
  const busca = f.q ? limparBusca(f.q) : "";
  if (busca) q = q.or(`descricao.ilike.*${busca}*,obs.ilike.*${busca}*`);

  const { data, error } = await q
    .order("mes_competencia", { ascending: false })
    .order("data", { ascending: false, nullsFirst: false })
    .order("descricao")
    .limit(LIMITE_LISTA + 1);
  if (error) throw new Error("Falha ao carregar os lançamentos.");

  const linhas = (data ?? []).map((l) => ({ ...l, valor: Number(l.valor) })) as Lancamento[];
  return { mes, lancamentos: linhas.slice(0, LIMITE_LISTA), cortado: linhas.length > LIMITE_LISTA };
}

/** Compras parceladas com parcela no mês: a do mês + quantas previstas ainda faltam. */
export async function parceladasDoMes(familiaId: string, mes: string) {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("lancamentos")
    .select("id, tipo, grupo_parcela, mes_competencia, descricao, valor, parcela, conta_id, realizado_id")
    .eq("familia_id", familiaId)
    .not("grupo_parcela", "is", null)
    .gte("mes_competencia", mes)
    .order("mes_competencia");
  if (!data) return [];

  const grupos = new Map<
    string,
    { grupo: string; descricao: string; conta_id: string | null; parcelaDoMes: string | null; valorDoMes: number; restantes: number; valorRestante: number }
  >();
  for (const l of data) {
    const g = l.grupo_parcela as string;
    const item = grupos.get(g) ?? {
      grupo: g,
      descricao: l.descricao,
      conta_id: l.conta_id,
      parcelaDoMes: null,
      valorDoMes: 0,
      restantes: 0,
      valorRestante: 0,
    };
    // No mês: vale a real se já chegou; senão, a prevista.
    if (l.mes_competencia === mes) {
      if (l.tipo === "Realizado" || (l.tipo === "Previsto" && !item.parcelaDoMes)) {
        item.parcelaDoMes = l.parcela;
        item.valorDoMes = Number(l.valor);
      }
    } else if (l.tipo === "Previsto" && !l.realizado_id) {
      item.restantes++;
      item.valorRestante += Number(l.valor);
    }
    grupos.set(g, item);
  }
  return [...grupos.values()].filter((g) => g.parcelaDoMes).sort((a, b) => b.valorDoMes - a.valorDoMes);
}

import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Classe } from "@/lib/dominio";
import type { LancamentoGasto } from "@/lib/gastos";

const CAMPOS = "id, tipo, natureza, classe, categoria_id, conta_id, valor, estorno, data, descricao, parcela, mes_competencia, assinatura";

/** Busca em páginas de 1000 (limite do PostgREST). */
async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const r: T[] = [];
  for (let de = 0; de < 20000; de += 1000) {
    const { data } = await consulta(de, de + 999);
    r.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return r;
}

const numero = (l: Record<string, unknown>) => ({ ...l, valor: Number(l.valor) }) as LancamentoGasto;

export async function carregarGastos(familiaId: string, mes: string) {
  const supabase = await criarClienteServidor();
  const [lancamentos, futuras, { data: contas }, { data: categorias }, { data: metas }, { data: meses }] = await Promise.all([
    todas((de, ate) =>
      supabase.from("lancamentos").select(CAMPOS).eq("familia_id", familiaId).eq("mes_competencia", mes).order("data").range(de, ate),
    ),
    todas((de, ate) =>
      supabase
        .from("lancamentos")
        .select(CAMPOS)
        .eq("familia_id", familiaId)
        .eq("tipo", "Previsto")
        .gt("mes_competencia", mes)
        .not("parcela", "is", null)
        .is("realizado_id", null)
        .range(de, ate),
    ),
    supabase.from("contas").select("id, nome, tipo").eq("familia_id", familiaId).order("nome"),
    supabase.from("categorias").select("id, nome").eq("familia_id", familiaId),
    supabase.from("metas_classe").select("classe, percentual_max_receita").eq("familia_id", familiaId),
    // Meses com algum gasto realizado (para o seletor).
    supabase.rpc("resumo_dfc", { p_familia: familiaId, p_de: "2000-01", p_ate: "2100-12" }),
  ]);
  const metasPorClasse: Partial<Record<Classe, number>> = {};
  for (const m of metas ?? []) metasPorClasse[m.classe as Classe] = Number(m.percentual_max_receita);
  const mesesComRealizado = [
    ...new Set(((meses ?? []) as { mes_competencia: string; tipo: string }[]).filter((x) => x.tipo === "Realizado").map((x) => x.mes_competencia)),
  ].sort();
  return {
    lancamentos: lancamentos.map(numero),
    parcelasFuturas: futuras.map(numero),
    contas: contas ?? [],
    categorias: categorias ?? [],
    metas: metasPorClasse,
    mesesComRealizado,
  };
}

/**
 * Nome do consultor da família, para o cabeçalho do relatório. Só o consultor enxerga a tabela de
 * consultores (RLS); quando quem gera é a família, o cabeçalho sai sem o nome.
 */
export async function consultorDaFamilia(familiaId: string): Promise<string | null> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("familia_consultores")
    .select("principal, consultores(nome)")
    .eq("familia_id", familiaId)
    .order("principal", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.consultores as unknown as { nome: string } | null)?.nome ?? null;
}

import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import { mesAtual, somarMeses } from "@/lib/format";
import { evolucao, type Ativo, type Passivo, type PontoHistorico } from "@/lib/patrimonio";

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function carregarPatrimonio(familiaId: string, mesesEvolucao = 12) {
  const supabase = await criarClienteServidor();
  const fim = mesAtual();
  const inicio = somarMeses(fim, -(mesesEvolucao - 1));
  // Pontos de antes do início também contam: são o saldo vigente no primeiro mês.
  const [{ data: a }, { data: p }, { data: ha }, { data: hp }] = await Promise.all([
    supabase
      .from("ativos")
      .select(
        "id, nome, categoria, instituicao, produto, valor, valor_liquido, liquidez, risco, data_saldo, origem, conta_liberdade, previdencia_tipo, equity_participacao, equity_metodo, equity_base, equity_multiplo, consorcio_prazo_meses, consorcio_parcelas_pagas, consorcio_parcela_mensal, consorcio_contemplado",
      )
      .eq("familia_id", familiaId)
      .order("valor", { ascending: false }),
    supabase
      .from("passivos")
      .select("id, nome, tipo, instituicao, saldo_devedor, parcela_mensal, taxa_am, parcelas_restantes, data_saldo")
      .eq("familia_id", familiaId)
      .order("saldo_devedor", { ascending: false }),
    supabase.from("historico_ativos").select("ativo_id, data, valor").eq("familia_id", familiaId).order("data").limit(5000),
    supabase.from("historico_passivos").select("passivo_id, data, saldo_devedor").eq("familia_id", familiaId).order("data").limit(5000),
  ]);

  const ativos: Ativo[] = (a ?? []).map((x) => ({
    ...x,
    valor: Number(x.valor),
    valor_liquido: n(x.valor_liquido),
    consorcio_parcela_mensal: n(x.consorcio_parcela_mensal),
    equity_participacao: n(x.equity_participacao),
    equity_base: n(x.equity_base),
    equity_multiplo: n(x.equity_multiplo),
  })) as Ativo[];
  const passivos: Passivo[] = (p ?? []).map((x) => ({
    ...x,
    saldo_devedor: Number(x.saldo_devedor),
    parcela_mensal: n(x.parcela_mensal),
    taxa_am: n(x.taxa_am),
  })) as Passivo[];

  const meses = Array.from({ length: mesesEvolucao }, (_, i) => somarMeses(inicio, i));
  const pontos = evolucao(
    meses,
    ativos,
    (ha ?? []).map((h) => ({ id: h.ativo_id, data: h.data, valor: Number(h.valor) }) satisfies PontoHistorico),
    (hp ?? []).map((h) => ({ id: h.passivo_id, data: h.data, valor: Number(h.saldo_devedor) }) satisfies PontoHistorico),
  );
  return { ativos, passivos, evolucao: pontos };
}

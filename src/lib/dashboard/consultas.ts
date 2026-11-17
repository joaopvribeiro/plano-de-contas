import "server-only";
import { totalReserva, type CategoriaAtivo } from "@/lib/patrimonio";
import { criarClienteServidor } from "@/lib/supabase/server";
import { calcularDFC, type ClasseDespesa, type LancamentoDFC } from "@/lib/dfc";
import { mesesDoHorizonte } from "@/lib/format";

export async function carregarDashboard(familiaId: string) {
  const supabase = await criarClienteServidor();
  const { data: familia, error } = await supabase
    .from("familias")
    .select("nome, inicio_planejamento, meses_horizonte, saldo_inicial_caixa")
    .eq("id", familiaId)
    .single();
  if (error || !familia) throw new Error("Família não encontrada.");

  const meses = mesesDoHorizonte(familia.inicio_planejamento, familia.meses_horizonte);
  const [resumo, metas, objetivos, reserva] = await Promise.all([
    supabase.rpc("resumo_dfc", { p_familia: familiaId, p_de: meses[0], p_ate: meses[meses.length - 1] }),
    supabase.from("metas_classe").select("classe, percentual_max_receita").eq("familia_id", familiaId),
    supabase.from("objetivos_config").select("reserva_meses").eq("familia_id", familiaId).maybeSingle(),
    supabase.from("ativos").select("categoria, valor, reserva_valor").eq("familia_id", familiaId).in("categoria", ["Reserva", "Investimentos"]),
  ]);
  if (resumo.error) throw new Error("Falha ao calcular a DFC.");

  type LinhaResumo = { mes_competencia: string; tipo: string; natureza: string; classe: string | null; estorno: boolean; valor: string | number };
  const lancamentos: LancamentoDFC[] = ((resumo.data ?? []) as LinhaResumo[]).map((r) => ({
    mes_competencia: r.mes_competencia,
    tipo: r.tipo as LancamentoDFC["tipo"],
    natureza: r.natureza as LancamentoDFC["natureza"],
    classe: r.classe as LancamentoDFC["classe"],
    estorno: r.estorno,
    valor: Number(r.valor),
  }));

  const dfc = calcularDFC({ lancamentos, meses, saldoInicial: Number(familia.saldo_inicial_caixa) });
  const metasPorClasse: Partial<Record<ClasseDespesa, number>> = {};
  for (const m of metas.data ?? []) metasPorClasse[m.classe as ClasseDespesa] = Number(m.percentual_max_receita);

  return {
    familia,
    meses,
    dfc,
    metas: metasPorClasse,
    reservaMeses: objetivos.data?.reserva_meses ?? 6,
    // Inclui a parte de investimentos separada como reserva.
    saldoReserva: totalReserva((reserva.data ?? []).map((a) => ({ categoria: a.categoria as CategoriaAtivo, valor: Number(a.valor), reserva_valor: a.reserva_valor === null ? null : Number(a.reserva_valor) }))),
    vazio: lancamentos.length === 0,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { carregarDashboard } from "@/lib/dashboard/consultas";
import { carregarGastos } from "@/lib/gastos-consultas";
import { resumirGastos } from "@/lib/gastos";
import { metaDaReserva } from "@/lib/dfc";
import { montarResumoIA } from "@/lib/insights";
import { situacaoIA } from "@/lib/importacao/consultas";
import { gerarInsightsComIA } from "@/lib/importacao/ia";

/** Gera as observações do mês com a IA e guarda em `insights`. Conta no limite mensal de insights. */
export async function gerarInsights(mes: string): Promise<{ erro?: string }> {
  const { familia } = await obterFamiliaAtiva();
  if (!z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).safeParse(mes).success) return { erro: "Mês inválido." };

  const s = await situacaoIA(familia.id, "insight");
  if (!s.consentimento) return { erro: "Antes, autorize o uso de IA nesta família (em Lançamentos → Importar extrato)." };
  if (!s.disponivel) return { erro: "A IA ainda não foi configurada." };
  if (s.restantes <= 0) return { erro: `O limite de ${s.limite} análises neste mês acabou.` };

  const [dash, g] = await Promise.all([carregarDashboard(familia.id), carregarGastos(familia.id, mes)]);
  const col = dash.dfc.meses.find((m) => m.mes === mes);
  if (!col?.realizado) return { erro: "Ainda não há lançamentos realizados neste mês para analisar." };
  const r = resumirGastos({ mes, lancamentos: g.lancamentos, parcelasFuturas: g.parcelasFuturas, contas: g.contas, categorias: g.categorias, metas: g.metas, filtro: "todas" });
  const nomeCat = new Map(g.categorias.map((c) => [c.id, c.nome]));
  const gastosDoMes = r.porCategoria.flatMap((c) => c.lancamentos).filter((l) => !l.estorno);

  const resumo = montarResumoIA({
    mes,
    previsto: col.previsto,
    realizado: col.realizado,
    metas: dash.metas as Record<string, number>,
    categorias: r.porCategoria.map((c) => ({ nome: c.nome, realizado: c.valor, previsto: c.previsto })),
    maiores: [...gastosDoMes]
      .sort((a, b) => b.valor - a.valor)
      .map((l) => ({ descricao: l.descricao, categoria: (l.categoria_id && nomeCat.get(l.categoria_id)) || "Outros", valor: l.valor })),
    assinaturas: gastosDoMes.filter((l) => l.assinatura).map((l) => ({ descricao: l.descricao, valor: l.valor })),
    parcelasAVencer: r.dividaFutura,
    reserva: { saldo: dash.saldoReserva, meta: metaDaReserva(dash.dfc, dash.reservaMeses) },
  });

  const ia = await gerarInsightsComIA(resumo);
  const supabase = await criarClienteServidor();
  if (ia.uso)
    await supabase.rpc("registrar_uso_ia", { p_familia: familia.id, p_recurso: "insight", p_modelo: ia.uso.modelo, p_tokens_entrada: ia.uso.entrada, p_tokens_saida: ia.uso.saida });
  if (!ia.observacoes) return { erro: ia.erro ?? "Não foi possível gerar a análise." };

  const { error } = await supabase.from("insights").insert({ familia_id: familia.id, mes, texto: JSON.stringify({ observacoes: ia.observacoes, modelo: ia.uso?.modelo }) });
  if (error) return { erro: "Não foi possível guardar a análise." };
  revalidatePath("/dashboard");
  return {};
}

/**
 * Indicadores e alertas de cada família no painel do consultor. Puro, testado.
 */
import { DIAS_DESATUALIZADO, diasDesde } from "@/lib/patrimonio";
import type { ColunaMes } from "@/lib/dfc";

export const DIAS_SEM_LANCAMENTO = 15;

export type EntradaIndicadores = {
  hoje: string;
  /** Coluna do mês analisado (o atual, ou o anterior se o atual ainda não tem realizado). */
  coluna: ColunaMes | null;
  ultimoLancamento: string | null;
  patrimonioLiquido: number;
  reserva: { saldo: number; meta: number };
  /** Ativos com saldo, com a data do último saldo informado. */
  ativos: { nome: string; data_saldo: string | null; valor: number; categoria: string }[];
  renovacoes: { seguradora: string; vigencia_fim: string }[];
  ia: { usados: number; limite: number };
};

export type Alerta = { tom: "negativo" | "atencao" | "info"; texto: string };

export type Indicadores = {
  mes: string | null;
  previstoDespesas: number | null;
  realizadoDespesas: number | null;
  saldoMes: number | null;
  patrimonioLiquido: number;
  reservaPct: number | null;
  desatualizados: number;
  alertas: Alerta[];
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export function indicadoresDaFamilia(e: EntradaIndicadores): Indicadores {
  const alertas: Alerta[] = [];
  const c = e.coluna;
  const r = c?.realizado ?? null;

  if (c && r && r.despesas > c.previsto.despesas + 0.5) {
    const extra = Math.round((r.despesas - c.previsto.despesas) * 100) / 100;
    alertas.push({ tom: "negativo", texto: `Despesas acima do previsto em ${extra.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` });
  }
  if (!e.ultimoLancamento) alertas.push({ tom: "info", texto: "Nenhum lançamento realizado ainda" });
  else if (diasDesde(e.ultimoLancamento, e.hoje) > DIAS_SEM_LANCAMENTO)
    alertas.push({ tom: "atencao", texto: `Sem lançamentos há ${diasDesde(e.ultimoLancamento, e.hoje)} dias` });

  const reservaPct = pct(e.reserva.saldo, e.reserva.meta);
  if (reservaPct !== null && reservaPct < 50) alertas.push({ tom: "atencao", texto: `Reserva em ${reservaPct}% da meta` });

  // Consórcio e Bem têm valor de referência (sem saldo que muda todo mês).
  const desatualizados = e.ativos.filter(
    (a) => a.valor > 0 && a.categoria !== "Bem" && a.categoria !== "Consórcio" && (!a.data_saldo || diasDesde(a.data_saldo, e.hoje) > DIAS_DESATUALIZADO),
  ).length;
  if (desatualizados) alertas.push({ tom: "atencao", texto: `${desatualizados} ${desatualizados === 1 ? "ativo desatualizado" : "ativos desatualizados"} (mais de ${DIAS_DESATUALIZADO} dias)` });

  for (const a of e.renovacoes) {
    const dias = diasDesde(e.hoje, a.vigencia_fim);
    alertas.push({ tom: dias <= 15 ? "negativo" : "atencao", texto: `${a.seguradora} vence ${dias <= 0 ? "hoje" : `em ${dias} dias`}` });
  }
  if (e.ia.limite > 0 && e.ia.usados >= e.ia.limite) alertas.push({ tom: "info", texto: "Limite de leituras com IA do mês atingido" });

  return {
    mes: c?.mes ?? null,
    previstoDespesas: c ? c.previsto.despesas : null,
    realizadoDespesas: r ? r.despesas : null,
    saldoMes: r ? r.saldo : c ? c.previsto.saldo : null,
    patrimonioLiquido: e.patrimonioLiquido,
    reservaPct,
    desatualizados,
    alertas,
  };
}

/** Mês do painel: o atual se já tem realizado; senão o anterior com realizado; senão o atual. */
export function colunaDoPainel(meses: ColunaMes[], atual: string, anterior: string): ColunaMes | null {
  const a = meses.find((m) => m.mes === atual);
  if (a?.realizado) return a;
  const b = meses.find((m) => m.mes === anterior);
  if (b?.realizado) return b;
  return a ?? null;
}

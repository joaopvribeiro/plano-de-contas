/**
 * Cálculos da aba Objetivos. Puro e testado (objetivos.test.ts).
 * Tudo em reais de hoje: o retorno é real (acima da inflação) e o aporte é constante em termos reais.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Meses de `de` (AAAA-MM) até `ate` (AAAA-MM); negativo se `ate` já passou. */
export function mesesEntre(de: string, ate: string): number {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

/** Valor futuro de um saldo com juros compostos mensais. taxa em fração (0,004 = 0,40% a.m.). */
export function valorFuturo(saldo: number, taxa: number, meses: number): number {
  return saldo * Math.pow(1 + taxa, meses);
}

/** Aporte mensal constante (no fim de cada mês) para ir de `saldo` a `meta` em `meses`. Nunca negativo. */
export function aporteNecessario(meta: number, saldo: number, taxa: number, meses: number): number {
  if (meses <= 0) return Math.max(meta - saldo, 0);
  const falta = meta - valorFuturo(saldo, taxa, meses);
  if (falta <= 0) return 0;
  const fator = taxa === 0 ? meses : (Math.pow(1 + taxa, meses) - 1) / taxa;
  return r2(falta / fator);
}

export type Liberdade = {
  saldo: number;
  meta: number | null;
  percentual: number | null;
  meses: number;
  /** Quanto o saldo de hoje vira no prazo, só com o retorno real. */
  projetado: number;
  aporte: number | null;
  atingeSemAporte: boolean;
};

export function liberdade(saldo: number, meta: number | null, retornoRealAmPct: number, prazoAnos: number): Liberdade {
  const meses = prazoAnos * 12;
  const taxa = retornoRealAmPct / 100;
  const projetado = r2(valorFuturo(saldo, taxa, meses));
  const temMeta = meta !== null && meta > 0;
  return {
    saldo: r2(saldo),
    meta: temMeta ? meta : null,
    percentual: temMeta ? Math.min(saldo / meta, 1) : null,
    meses,
    projetado,
    aporte: temMeta ? aporteNecessario(meta, saldo, taxa, meses) : null,
    atingeSemAporte: temMeta ? projetado >= meta : false,
  };
}

export type Reserva = { saldo: number; meta: number; percentual: number | null; cobreMeses: number | null; falta: number };

export function reserva(saldo: number, meta: number, despesaBasicaMensal: number): Reserva {
  return {
    saldo: r2(saldo),
    meta: r2(meta),
    percentual: meta > 0 ? Math.min(saldo / meta, 1) : null,
    cobreMeses: despesaBasicaMensal > 0 ? Math.floor((saldo / despesaBasicaMensal) * 10) / 10 : null,
    falta: r2(Math.max(meta - saldo, 0)),
  };
}

export type Projeto = { id: string; nome: string; valor_alvo: number; ja_guardado: number; prazo_mes: string; ativo_id: string | null };
export type SituacaoProjeto = {
  percentual: number;
  falta: number;
  /** Meses de aporte até o prazo (do próximo mês até o mês do prazo). */
  mesesRestantes: number;
  porMes: number;
  status: "concluido" | "vencido" | "andamento";
};

export function situacaoProjeto(p: Pick<Projeto, "valor_alvo" | "ja_guardado" | "prazo_mes">, mesAtual: string): SituacaoProjeto {
  const falta = r2(Math.max(p.valor_alvo - p.ja_guardado, 0));
  const mesesRestantes = Math.max(mesesEntre(mesAtual, p.prazo_mes), 0);
  const status = falta === 0 ? "concluido" : mesesRestantes === 0 ? "vencido" : "andamento";
  return {
    percentual: Math.min(p.ja_guardado / p.valor_alvo, 1),
    falta,
    mesesRestantes,
    porMes: status === "andamento" ? r2(falta / mesesRestantes) : status === "vencido" ? falta : 0,
    status,
  };
}

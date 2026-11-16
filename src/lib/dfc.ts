/**
 * Demonstração de Fluxo de Caixa (DFC) — regras únicas, puras e testadas.
 * Usada pela tela, pelo CSV e (na Etapa 8) pela área do consultor.
 *
 * Regras (prompt v2 + DECISOES.md):
 * 1. Competência: cada lançamento conta no seu mes_competencia.
 * 2. Natureza: fluxo entra pela classe; transferência fica fora;
 *    aporte e resgate formam "Investimentos (líquido)" = resgates − aportes.
 * 3. Sinal: receita soma, despesa subtrai; estorno abate dentro da própria classe.
 * 4. Saldo do mês = receitas − despesas; Saldo após investimentos = saldo + investimentos;
 *    Caixa acumulado = saldo inicial + soma dos saldos após investimentos.
 * 5. Previsto e realizado separados. Divergência = realizado − previsto,
 *    zerada quando |diferença| < R$ 0,50.
 * 6. Mês sem realizado (transferências não contam): realizado "—". O caixa realizado de um mês sem realizado
 *    entre meses com realizado repete o anterior; depois do último mês com
 *    realizado fica vazio.
 * 7. Lançamentos fora do horizonte não entram.
 */
import type { Classe } from "@/lib/dominio";

export const CLASSES_DESPESA_DFC = ["Despesa básica", "Padrão de vida", "Doações", "Sonhos"] as const;
export type ClasseDespesa = (typeof CLASSES_DESPESA_DFC)[number];

export type LancamentoDFC = {
  tipo: "Previsto" | "Realizado";
  natureza: "fluxo" | "transferencia" | "aporte" | "resgate";
  classe: Classe | null;
  valor: number;
  estorno: boolean;
  mes_competencia: string;
};

export type Valores = {
  receitas: number;
  "Despesa básica": number;
  "Padrão de vida": number;
  Doações: number;
  Sonhos: number;
  despesas: number;
  saldo: number;
  investimentos: number;
  saldoAposInvestimentos: number;
};

export type ChaveLinha = keyof Valores | "caixa";

/** Linhas da matriz, na ordem de exibição. */
export const LINHAS_DFC: { chave: ChaveLinha; rotulo: string; destaque?: boolean; classe?: Classe; natureza?: string }[] = [
  { chave: "receitas", rotulo: "Total de receitas", classe: "Receita" },
  { chave: "Despesa básica", rotulo: "Despesa básica", classe: "Despesa básica" },
  { chave: "Padrão de vida", rotulo: "Padrão de vida", classe: "Padrão de vida" },
  { chave: "Doações", rotulo: "Doações", classe: "Doações" },
  { chave: "Sonhos", rotulo: "Sonhos", classe: "Sonhos" },
  { chave: "despesas", rotulo: "Total de despesas" },
  { chave: "saldo", rotulo: "Saldo do mês", destaque: true },
  { chave: "investimentos", rotulo: "Investimentos (líquido)" },
  { chave: "saldoAposInvestimentos", rotulo: "Saldo após investimentos", destaque: true },
  { chave: "caixa", rotulo: "Caixa acumulado" },
];

export type ColunaMes = {
  mes: string;
  temRealizado: boolean;
  previsto: Valores;
  realizado: Valores | null;
  divergencia: Valores | null;
  caixa: { previsto: number; realizado: number | null; divergencia: number | null };
};

export type ResultadoDFC = {
  meses: ColunaMes[];
  total: {
    previsto: Valores;
    /** Soma dos meses com realizado. */
    realizado: Valores | null;
    /** Realizado − previsto, só nos meses com realizado. */
    divergencia: Valores | null;
    caixa: { previsto: number; realizado: number | null; divergencia: number | null };
  };
  ultimoMesComRealizado: string | null;
};

export const LIMITE_DIVERGENCIA = 0.5;

const r2 = (n: number) => Math.round(n * 100) / 100;

function zerado(): Valores {
  return {
    receitas: 0,
    "Despesa básica": 0,
    "Padrão de vida": 0,
    Doações: 0,
    Sonhos: 0,
    despesas: 0,
    saldo: 0,
    investimentos: 0,
    saldoAposInvestimentos: 0,
  };
}

/** Soma um lançamento num acumulador (sem os totais derivados). */
function acumular(v: Valores, l: LancamentoDFC) {
  const sinal = l.estorno ? -1 : 1;
  if (l.natureza === "fluxo" && l.classe) {
    if (l.classe === "Receita") v.receitas += sinal * l.valor;
    else v[l.classe as ClasseDespesa] += sinal * l.valor;
  } else if (l.natureza === "aporte") {
    v.investimentos -= l.valor;
  } else if (l.natureza === "resgate") {
    v.investimentos += l.valor;
  }
  // transferência: fora da DFC.
}

/** Calcula os totais derivados e arredonda tudo para centavos. */
function fechar(v: Valores): Valores {
  const despesas = v["Despesa básica"] + v["Padrão de vida"] + v.Doações + v.Sonhos;
  const saldo = v.receitas - despesas;
  return {
    receitas: r2(v.receitas),
    "Despesa básica": r2(v["Despesa básica"]),
    "Padrão de vida": r2(v["Padrão de vida"]),
    Doações: r2(v.Doações),
    Sonhos: r2(v.Sonhos),
    despesas: r2(despesas),
    saldo: r2(saldo),
    investimentos: r2(v.investimentos),
    saldoAposInvestimentos: r2(saldo + v.investimentos),
  };
}

function somar(a: Valores, b: Valores): Valores {
  const out = zerado();
  for (const k of Object.keys(out) as (keyof Valores)[]) out[k] = a[k] + b[k];
  return out;
}

export function diferenca(real: number, prev: number): number {
  const d = r2(real - prev);
  return Math.abs(d) < LIMITE_DIVERGENCIA ? 0 : d;
}

function divergir(real: Valores, prev: Valores): Valores {
  const out = zerado();
  for (const k of Object.keys(out) as (keyof Valores)[]) out[k] = diferenca(real[k], prev[k]);
  return out;
}

export function calcularDFC({
  lancamentos,
  meses,
  saldoInicial = 0,
}: {
  lancamentos: LancamentoDFC[];
  meses: string[];
  saldoInicial?: number;
}): ResultadoDFC {
  const dentro = new Set(meses);
  const prev = new Map(meses.map((m) => [m, zerado()]));
  const real = new Map(meses.map((m) => [m, zerado()]));
  const comRealizado = new Set<string>();

  for (const l of lancamentos) {
    if (!dentro.has(l.mes_competencia)) continue;
    if (l.tipo === "Previsto") acumular(prev.get(l.mes_competencia)!, l);
    else {
      acumular(real.get(l.mes_competencia)!, l);
      // Transferência não entra na DFC, então também não marca o mês como "com realizado".
      if (l.natureza !== "transferencia") comRealizado.add(l.mes_competencia);
    }
  }

  const ultimo = [...meses].reverse().find((m) => comRealizado.has(m)) ?? null;
  const idxUltimo = ultimo ? meses.indexOf(ultimo) : -1;

  let caixaPrev = saldoInicial;
  let caixaReal = saldoInicial;
  let somaPrev = zerado();
  let somaReal = zerado();
  let somaPrevComparavel = zerado();

  const colunas: ColunaMes[] = meses.map((mes, i) => {
    const p = fechar(prev.get(mes)!);
    caixaPrev = r2(caixaPrev + p.saldoAposInvestimentos);
    somaPrev = somar(somaPrev, p);

    const tem = comRealizado.has(mes);
    let r: Valores | null = null;
    let d: Valores | null = null;
    if (tem) {
      r = fechar(real.get(mes)!);
      caixaReal = r2(caixaReal + r.saldoAposInvestimentos);
      somaReal = somar(somaReal, r);
      somaPrevComparavel = somar(somaPrevComparavel, p);
      d = divergir(r, p);
    }
    const caixaRealizado = i <= idxUltimo ? caixaReal : null;

    return {
      mes,
      temRealizado: tem,
      previsto: p,
      realizado: r,
      divergencia: d,
      caixa: {
        previsto: caixaPrev,
        realizado: caixaRealizado,
        divergencia: tem && caixaRealizado !== null ? diferenca(caixaRealizado, caixaPrev) : null,
      },
    };
  });

  const algumRealizado = comRealizado.size > 0;
  const totalReal = algumRealizado ? fechar(somaReal) : null;
  const totalPrevComparavel = fechar(somaPrevComparavel);
  const ultimaColuna = colunas[colunas.length - 1];
  const colunaUltimoReal = idxUltimo >= 0 ? colunas[idxUltimo] : null;

  return {
    meses: colunas,
    total: {
      previsto: fechar(somaPrev),
      realizado: totalReal,
      divergencia: totalReal ? divergir(totalReal, totalPrevComparavel) : null,
      caixa: {
        previsto: ultimaColuna ? ultimaColuna.caixa.previsto : r2(saldoInicial),
        realizado: colunaUltimoReal ? colunaUltimoReal.caixa.realizado : null,
        divergencia: colunaUltimoReal ? colunaUltimoReal.caixa.divergencia : null,
      },
    },
    ultimoMesComRealizado: ultimo,
  };
}

/** Lê o valor de uma linha (inclusive a de caixa) numa coluna. */
export function valorDaLinha(
  col: Pick<ColunaMes, "previsto" | "realizado" | "divergencia" | "caixa">,
  chave: ChaveLinha,
  visao: "previsto" | "realizado" | "divergencia",
): number | null {
  if (chave === "caixa") return col.caixa[visao];
  const v = col[visao];
  return v ? v[chave] : null;
}

// ---------------------------------------------------------------------------
// Distribuição das despesas sobre a receita
// ---------------------------------------------------------------------------

export type StatusMeta = "ok" | "atencao" | "acima" | "sem-meta";

/** Até a meta: ok. Até 5 pontos acima: atenção. Mais que isso: acima. */
export function statusDaMeta(percentual: number | null, meta: number | null | undefined): StatusMeta {
  if (meta === null || meta === undefined || percentual === null) return "sem-meta";
  if (percentual <= meta) return "ok";
  if (percentual <= meta + 5) return "atencao";
  return "acima";
}

export type ItemDistribuicao = {
  classe: ClasseDespesa;
  valor: number;
  /** % da receita (0–100+). Null quando não há receita. */
  percentual: number | null;
  meta: number | null;
  status: StatusMeta;
};

export function distribuicao(v: Valores, metas: Partial<Record<ClasseDespesa, number>>): ItemDistribuicao[] {
  return CLASSES_DESPESA_DFC.map((classe) => {
    const valor = v[classe];
    const percentual = v.receitas > 0 ? Math.round((valor / v.receitas) * 1000) / 10 : null;
    const meta = metas[classe] ?? null;
    return { classe, valor, percentual, meta, status: statusDaMeta(percentual, meta) };
  });
}

// ---------------------------------------------------------------------------
// Reserva de emergência
// ---------------------------------------------------------------------------

/** Meta = N × média mensal da despesa básica prevista no horizonte. */
export function metaDaReserva(resultado: ResultadoDFC, mesesDeReserva: number): number {
  const n = resultado.meses.length;
  if (n === 0) return 0;
  const media = resultado.total.previsto["Despesa básica"] / n;
  return r2(media * mesesDeReserva);
}

/** Quantos meses de despesa básica a reserva cobre (1 casa decimal). */
export function mesesCobertos(saldoReserva: number, resultado: ResultadoDFC): number | null {
  const n = resultado.meses.length;
  const media = n ? resultado.total.previsto["Despesa básica"] / n : 0;
  if (media <= 0) return null;
  return Math.floor((saldoReserva / media) * 10) / 10;
}

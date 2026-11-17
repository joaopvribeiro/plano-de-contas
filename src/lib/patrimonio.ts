/**
 * Cálculos da aba Patrimônio. Puro e testado (patrimonio.test.ts).
 *
 * - Carteira investida = Reserva + Investimentos + Previdência + Fundo Fechado.
 * - Patrimônio líquido = carteira + FGTS + bens + participações em empresas − dívidas.
 * - Direitos futuros = soma das cartas de consórcio (informativo).
 * - Patrimônio com direitos = patrimônio líquido + direito líquido dos consórcios.
 *   Direito líquido: contemplado = carta − saldo a pagar; não contemplado = o que já foi pago.
 */
export const CATEGORIAS_ATIVO = ["Reserva", "Investimentos", "Previdência", "Fundo Fechado", "FGTS", "Bem", "Equity", "Consórcio"] as const;
export type CategoriaAtivo = (typeof CATEGORIAS_ATIVO)[number];
export const CATEGORIAS_CARTEIRA: CategoriaAtivo[] = ["Reserva", "Investimentos", "Previdência", "Fundo Fechado"];

export const ROTULO_CATEGORIA: Record<CategoriaAtivo, string> = {
  Reserva: "Reserva de emergência",
  Investimentos: "Investimentos",
  Previdência: "Previdência",
  "Fundo Fechado": "Fundo fechado",
  FGTS: "FGTS",
  Bem: "Bem (imóvel, veículo, terreno)",
  Equity: "Equity (participação em empresa)",
  Consórcio: "Consórcio",
};

/** Campos de cada categoria no formulário. */
export const CAMPOS_DA_CATEGORIA: Record<CategoriaAtivo, { instituicao: boolean; produto: boolean; liquidezRisco: boolean; liberdade: boolean }> = {
  Reserva: { instituicao: true, produto: true, liquidezRisco: true, liberdade: false },
  Investimentos: { instituicao: true, produto: true, liquidezRisco: true, liberdade: true },
  Previdência: { instituicao: true, produto: true, liquidezRisco: true, liberdade: true },
  "Fundo Fechado": { instituicao: true, produto: true, liquidezRisco: true, liberdade: true },
  FGTS: { instituicao: false, produto: false, liquidezRisco: false, liberdade: false },
  Bem: { instituicao: false, produto: false, liquidezRisco: false, liberdade: false },
  Equity: { instituicao: false, produto: false, liquidezRisco: false, liberdade: false },
  Consórcio: { instituicao: true, produto: true, liquidezRisco: false, liberdade: false },
};

export const TIPOS_BEM = ["Imóvel", "Terreno", "Veículo", "Outro"] as const;
export const METODOS_EQUITY = ["valuation", "lucro", "faturamento"] as const;
export type MetodoEquity = (typeof METODOS_EQUITY)[number];
export const ROTULO_METODO: Record<MetodoEquity, string> = {
  valuation: "Valuation da empresa",
  lucro: "Múltiplo do lucro anual",
  faturamento: "Múltiplo do faturamento anual",
};

/**
 * Valor da participação: valuation × % ou (lucro/faturamento anual × múltiplo) × %.
 * Sem valuation, a estimativa por múltiplo é uma referência para o planejamento, não um laudo.
 */
export function valorEquity(metodo: MetodoEquity, base: number, multiplo: number | null, participacaoPct: number): number {
  const empresa = metodo === "valuation" ? base : base * (multiplo ?? 0);
  return Math.round(empresa * (participacaoPct / 100) * 100) / 100;
}

export const RISCOS = ["baixo", "médio", "alto"] as const;
export type Risco = (typeof RISCOS)[number];

export const TIPOS_PASSIVO = ["financiamento_imobiliario", "financiamento_veiculo", "emprestimo", "cartao_rotativo", "outro"] as const;
export type TipoPassivo = (typeof TIPOS_PASSIVO)[number];
export const ROTULO_PASSIVO: Record<TipoPassivo, string> = {
  financiamento_imobiliario: "Financiamento imobiliário",
  financiamento_veiculo: "Financiamento de veículo",
  emprestimo: "Empréstimo",
  cartao_rotativo: "Cartão (rotativo)",
  outro: "Outra dívida",
};

/** Grupos do balanço, na ordem da tela. */
export const GRUPOS: { categoria: CategoriaAtivo; titulo: string; subtitulo: string }[] = [
  { categoria: "Reserva", titulo: "Reserva de emergência", subtitulo: "Liquidez diária" },
  { categoria: "Investimentos", titulo: "Investimentos", subtitulo: "Renda fixa, multimercados e renda variável" },
  { categoria: "Previdência", titulo: "Previdência", subtitulo: "Aposentadoria · PGBL e VGBL" },
  { categoria: "Fundo Fechado", titulo: "Fundos fechados", subtitulo: "Resgate só no vencimento" },
  { categoria: "FGTS", titulo: "FGTS", subtitulo: "Saque-aniversário ou rescisão" },
  { categoria: "Bem", titulo: "Bens", subtitulo: "Imóveis, terrenos e veículos · valor de mercado" },
  { categoria: "Equity", titulo: "Participações em empresas", subtitulo: "Valor estimado da participação" },
  { categoria: "Consórcio", titulo: "Cartas de consórcio", subtitulo: "Direito futuro" },
];

export type Ativo = {
  id: string;
  nome: string;
  categoria: CategoriaAtivo;
  instituicao: string | null;
  produto: string | null;
  valor: number;
  valor_liquido: number | null;
  liquidez: string | null;
  risco: Risco | null;
  data_saldo: string;
  origem: "manual" | "relatorio";
  /** Entra na conta da liberdade financeira (Objetivos). */
  conta_liberdade?: boolean | null;
  previdencia_tipo?: "PGBL" | "VGBL" | null;
  equity_participacao?: number | null;
  equity_metodo?: MetodoEquity | null;
  equity_base?: number | null;
  equity_multiplo?: number | null;
  /** Parte deste investimento que conta como reserva de emergência. */
  reserva_valor?: number | null;
  consorcio_prazo_meses: number | null;
  consorcio_parcelas_pagas: number | null;
  consorcio_parcela_mensal: number | null;
  consorcio_contemplado: boolean | null;
};

export type Passivo = {
  id: string;
  nome: string;
  tipo: TipoPassivo;
  instituicao: string | null;
  saldo_devedor: number;
  parcela_mensal: number | null;
  taxa_am: number | null;
  parcelas_restantes: number | null;
  data_saldo: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const soma = (xs: number[]) => r2(xs.reduce((s, x) => s + x, 0));

/** Quanto do ativo é reserva: o saldo todo (categoria Reserva) ou a parte separada de um investimento. */
export function parteReserva(a: Pick<Ativo, "categoria" | "valor"> & { reserva_valor?: number | null }): number {
  if (a.categoria === "Reserva") return a.valor;
  if (a.categoria === "Investimentos" && a.reserva_valor) return Math.min(a.reserva_valor, Math.max(a.valor, 0));
  return 0;
}

export function totalReserva(ativos: (Pick<Ativo, "categoria" | "valor"> & { reserva_valor?: number | null })[]): number {
  return Math.round(ativos.reduce((s, a) => s + parteReserva(a), 0) * 100) / 100;
}

/** Ativo com saldo zero (posição resgatada) fica fora do balanço e dos totais. */
export const ativoVisivel = (a: Pick<Ativo, "valor" | "categoria">) => a.valor > 0 || a.categoria === "Consórcio";

export function consorcio(a: Pick<Ativo, "valor" | "consorcio_prazo_meses" | "consorcio_parcelas_pagas" | "consorcio_parcela_mensal" | "consorcio_contemplado">) {
  const parcela = a.consorcio_parcela_mensal ?? 0;
  const pagas = a.consorcio_parcelas_pagas ?? 0;
  const prazo = a.consorcio_prazo_meses ?? pagas;
  const pago = r2(pagas * parcela);
  const aPagar = r2(Math.max(prazo - pagas, 0) * parcela);
  const direitoLiquido = a.consorcio_contemplado ? r2(Math.max(a.valor - aPagar, 0)) : pago;
  return { pago, aPagar, direitoLiquido, progresso: prazo > 0 ? pagas / prazo : 0 };
}

export type Resumo = {
  carteira: number;
  ativosCarteira: number;
  instituicoesCarteira: number;
  fgts: number;
  bens: number;
  empresas: number;
  dividas: number;
  patrimonioLiquido: number;
  cartas: number;
  direitoLiquido: number;
  patrimonioComDireitos: number;
};

export function resumir(ativos: Ativo[], passivos: Passivo[]): Resumo {
  const vis = ativos.filter(ativoVisivel);
  const carteira = vis.filter((a) => CATEGORIAS_CARTEIRA.includes(a.categoria));
  const cats = vis.filter((a) => a.categoria === "Consórcio");
  const fgts = soma(vis.filter((a) => a.categoria === "FGTS").map((a) => a.valor));
  const bens = soma(vis.filter((a) => a.categoria === "Bem").map((a) => a.valor));
  const empresas = soma(vis.filter((a) => a.categoria === "Equity").map((a) => a.valor));
  const dividas = soma(passivos.map((p) => p.saldo_devedor));
  const totalCarteira = soma(carteira.map((a) => a.valor));
  const patrimonioLiquido = r2(totalCarteira + fgts + bens + empresas - dividas);
  const direitoLiquido = soma(cats.map((a) => consorcio(a).direitoLiquido));
  return {
    carteira: totalCarteira,
    ativosCarteira: carteira.length,
    instituicoesCarteira: new Set(carteira.map((a) => (a.instituicao ?? "").trim().toUpperCase()).filter(Boolean)).size,
    fgts,
    bens,
    empresas,
    dividas,
    patrimonioLiquido,
    cartas: soma(cats.map((a) => a.valor)),
    direitoLiquido,
    patrimonioComDireitos: r2(patrimonioLiquido + direitoLiquido),
  };
}

export type Fatia = { rotulo: string; valor: number; percentual: number };

/** Distribuição da carteira por uma chave, do maior para o menor; o que passar de `max` vira "Outras". */
export function distribuir(ativos: Ativo[], chave: (a: Ativo) => string, max = 6): Fatia[] {
  const carteira = ativos.filter((a) => ativoVisivel(a) && CATEGORIAS_CARTEIRA.includes(a.categoria));
  const total = carteira.reduce((s, a) => s + a.valor, 0);
  if (total <= 0) return [];
  const mapa = new Map<string, number>();
  for (const a of carteira) mapa.set(chave(a), (mapa.get(chave(a)) ?? 0) + a.valor);
  const ordenado = [...mapa.entries()].sort((x, y) => y[1] - x[1]);
  const principais = ordenado.slice(0, max);
  const resto = ordenado.slice(max).reduce((s, [, v]) => s + v, 0);
  if (resto > 0) principais.push(["Outras", resto]);
  return principais.map(([rotulo, valor]) => ({ rotulo, valor: r2(valor), percentual: valor / total }));
}

export const porInstituicao = (a: Ativo) => a.instituicao?.trim() || "Sem instituição";

/** Carteira por categoria, com a parte de reserva dos investimentos contada em Reserva. */
export function distribuirPorCategoria(ativos: Ativo[]): Fatia[] {
  const partes: Ativo[] = [];
  for (const a of ativos) {
    const parte = a.categoria === "Investimentos" ? parteReserva(a) : 0;
    if (parte > 0) {
      partes.push({ ...a, categoria: "Reserva", valor: parte });
      if (a.valor - parte > 0) partes.push({ ...a, valor: a.valor - parte });
    } else partes.push(a);
  }
  return distribuir(partes, (a) => a.categoria);
}

/** Grupos do balanço com subtotal; ativos do maior para o menor. Grupos vazios ficam de fora. */
export type ItemBalanco = Ativo & {
  /** Valor mostrado neste grupo (o saldo, ou a parte que cabe ao grupo). */
  exibido: number;
  /** "parte-reserva": linha da reserva que é parte de um investimento; "com-reserva": investimento que tem parte na reserva. */
  papel?: "parte-reserva" | "com-reserva";
};

export function agrupar(ativos: Ativo[]) {
  return GRUPOS.map((g) => {
    const itens: ItemBalanco[] = [];
    for (const a of ativos) {
      if (!ativoVisivel(a)) continue;
      const parte = a.categoria === "Investimentos" ? parteReserva(a) : 0;
      if (a.categoria === g.categoria) {
        if (parte > 0) {
          if (a.valor - parte > 0) itens.push({ ...a, exibido: r2(a.valor - parte), papel: "com-reserva" });
        } else itens.push({ ...a, exibido: a.valor });
      } else if (g.categoria === "Reserva" && parte > 0) itens.push({ ...a, exibido: parte, papel: "parte-reserva" });
    }
    itens.sort((x, y) => y.exibido - x.exibido);
    return { ...g, itens, subtotal: soma(itens.map((a) => a.exibido)) };
  }).filter((g) => g.itens.length > 0);
}

/** Dias desde a data do saldo; acima de 45, o saldo está desatualizado. */
export function diasDesde(data: string, hoje: string): number {
  return Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${data}T12:00:00Z`)) / 86_400_000);
}
export const DIAS_DESATUALIZADO = 45;

// ---------------------------------------------------------------------------
// Evolução mensal
// ---------------------------------------------------------------------------

export type PontoHistorico = { id: string; data: string; valor: number };
export type PontoEvolucao = { mes: string; carteira: number; patrimonioLiquido: number };

function ultimoDia(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/**
 * Saldo de cada ativo e dívida no fim de cada mês: o último ponto do histórico até aquela data.
 * - Investimento sem ponto até o mês ainda não existia (vale zero).
 * - Bens e dívidas costumam ser cadastrados depois de existirem: antes do primeiro ponto,
 *   valem o primeiro saldo conhecido (senão o gráfico mostraria um salto falso no mês do cadastro).
 * - A série começa no primeiro mês com algum saldo de carteira, FGTS ou previdência.
 */
export function evolucao(
  meses: string[],
  ativos: Pick<Ativo, "id" | "categoria">[],
  histAtivos: PontoHistorico[],
  histPassivos: PontoHistorico[],
): PontoEvolucao[] {
  const categoria = new Map(ativos.map((a) => [a.id, a.categoria]));
  const porId = (pontos: PontoHistorico[]) => {
    const m = new Map<string, PontoHistorico[]>();
    for (const p of pontos) m.set(p.id, [...(m.get(p.id) ?? []), p]);
    for (const l of m.values()) l.sort((x, y) => x.data.localeCompare(y.data));
    return m;
  };
  const ha = porId(histAtivos);
  const hp = porId(histPassivos);
  const ate = (l: PontoHistorico[], dia: string, retroagir = false) => {
    let v: number | null = retroagir && l.length ? l[0].valor : null;
    for (const p of l) if (p.data <= dia) v = p.valor;
    return v;
  };

  const pontos: PontoEvolucao[] = [];
  for (const mes of meses) {
    const dia = ultimoDia(mes);
    let carteira = 0;
    let liquido = 0;
    let algum = false;
    for (const [id, l] of ha) {
      const cat = categoria.get(id);
      if (!cat || cat === "Consórcio") continue;
      const fixo = cat === "Bem" || cat === "Equity";
      const v = ate(l, dia, fixo);
      if (v === null) continue;
      if (!fixo) algum = true;
      if (CATEGORIAS_CARTEIRA.includes(cat)) carteira += v;
      liquido += v;
    }
    for (const l of hp.values()) {
      const v = ate(l, dia, true);
      if (v !== null) liquido -= v;
    }
    if (algum) pontos.push({ mes, carteira: r2(carteira), patrimonioLiquido: r2(liquido) });
  }
  return pontos;
}

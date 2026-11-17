/**
 * Cálculos da aba Patrimônio. Puro e testado (patrimonio.test.ts).
 *
 * - Carteira investida = Reserva + Investimentos + Previdência + Fundo Fechado.
 * - Patrimônio líquido = carteira + FGTS + bens − dívidas.
 * - Direitos futuros = soma das cartas de consórcio (informativo).
 * - Patrimônio com direitos = patrimônio líquido + direito líquido dos consórcios.
 *   Direito líquido: contemplado = carta − saldo a pagar; não contemplado = o que já foi pago.
 */
export const CATEGORIAS_ATIVO = ["Reserva", "Investimentos", "Previdência", "Fundo Fechado", "FGTS", "Bem", "Consórcio"] as const;
export type CategoriaAtivo = (typeof CATEGORIAS_ATIVO)[number];
export const CATEGORIAS_CARTEIRA: CategoriaAtivo[] = ["Reserva", "Investimentos", "Previdência", "Fundo Fechado"];

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
  { categoria: "Bem", titulo: "Bens", subtitulo: "Imóveis e veículos" },
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
  const dividas = soma(passivos.map((p) => p.saldo_devedor));
  const totalCarteira = soma(carteira.map((a) => a.valor));
  const patrimonioLiquido = r2(totalCarteira + fgts + bens - dividas);
  const direitoLiquido = soma(cats.map((a) => consorcio(a).direitoLiquido));
  return {
    carteira: totalCarteira,
    ativosCarteira: carteira.length,
    instituicoesCarteira: new Set(carteira.map((a) => (a.instituicao ?? "").trim().toUpperCase()).filter(Boolean)).size,
    fgts,
    bens,
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

/** Grupos do balanço com subtotal; ativos do maior para o menor. Grupos vazios ficam de fora. */
export function agrupar(ativos: Ativo[]) {
  return GRUPOS.map((g) => {
    const itens = ativos.filter((a) => a.categoria === g.categoria && ativoVisivel(a)).sort((x, y) => y.valor - x.valor);
    return { ...g, itens, subtotal: soma(itens.map((a) => a.valor)) };
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
      const v = ate(l, dia, cat === "Bem");
      if (v === null) continue;
      if (cat !== "Bem") algum = true;
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

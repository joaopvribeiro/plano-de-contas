/**
 * Resumo de gastos de um mês: tudo o que saiu (faturas e contas), com filtro por conta.
 * Puro, testado em gastos.test.ts.
 *
 * Gasto = lançamento realizado de natureza fluxo, classe de despesa, líquido de estornos.
 * Transferências (pagamento de fatura) e aportes não são gastos.
 */
import { CLASSES_DESPESA, type Classe } from "@/lib/dominio";
import { statusDaMeta, type StatusMeta } from "@/lib/dfc";

export type ContaResumo = { id: string; nome: string; tipo: string };
export type CategoriaResumo = { id: string; nome: string };

export type LancamentoGasto = {
  id: string;
  tipo: "Previsto" | "Realizado";
  natureza: string;
  classe: Classe | null;
  categoria_id: string | null;
  conta_id: string | null;
  valor: number;
  estorno: boolean;
  data: string | null;
  descricao: string;
  parcela: string | null;
  mes_competencia: string;
  assinatura?: boolean;
};

export type Filtro = "todas" | "cartoes" | "contas" | string;

const r2 = (n: number) => Math.round(n * 100) / 100;
const ehCartao = (c: ContaResumo | undefined) => c?.tipo === "cartao_credito";
const ehGasto = (l: Pick<LancamentoGasto, "natureza" | "classe">) => l.natureza === "fluxo" && l.classe !== null && l.classe !== "Receita";
const sinal = (l: Pick<LancamentoGasto, "valor" | "estorno">) => (l.estorno ? -l.valor : l.valor);

export function passaFiltro(l: Pick<LancamentoGasto, "conta_id">, filtro: Filtro, contas: Map<string, ContaResumo>): boolean {
  if (filtro === "todas") return true;
  const c = l.conta_id ? contas.get(l.conta_id) : undefined;
  if (filtro === "cartoes") return ehCartao(c);
  if (filtro === "contas") return !ehCartao(c);
  return l.conta_id === filtro;
}

export type Resumo = ReturnType<typeof resumirGastos>;

export function resumirGastos(entrada: {
  mes: string;
  lancamentos: LancamentoGasto[];
  /** Previstos com parcela de meses futuros (para o comprometimento dos cartões). */
  parcelasFuturas: LancamentoGasto[];
  contas: ContaResumo[];
  categorias: CategoriaResumo[];
  metas: Partial<Record<Classe, number>>;
  filtro: Filtro;
}) {
  const { mes, filtro } = entrada;
  const contas = new Map(entrada.contas.map((c) => [c.id, c]));
  const nomeCat = new Map(entrada.categorias.map((c) => [c.id, c.nome]));
  const doMes = entrada.lancamentos.filter((l) => l.mes_competencia === mes);
  const realizados = doMes.filter((l) => l.tipo === "Realizado");
  const previstos = doMes.filter((l) => l.tipo === "Previsto");
  const gastos = realizados.filter((l) => ehGasto(l) && passaFiltro(l, filtro, contas));
  const total = r2(gastos.reduce((s, l) => s + sinal(l), 0));

  // Total de cada conta no mês (sem filtro): o "valor da fatura" de cada cartão.
  const porConta = entrada.contas
    .map((c) => ({
      ...c,
      cartao: ehCartao(c),
      total: r2(realizados.filter((l) => ehGasto(l) && l.conta_id === c.id).reduce((s, l) => s + sinal(l), 0)),
    }))
    .filter((c) => c.total !== 0)
    .sort((a, b) => b.total - a.total);

  // Por categoria, com o previsto da mesma seleção de contas.
  const previstosFiltrados = previstos.filter((l) => ehGasto(l) && passaFiltro(l, filtro, contas));
  const ids = new Set([...gastos, ...previstosFiltrados].map((l) => l.categoria_id ?? "sem"));
  const porCategoria = [...ids]
    .map((id) => {
      const valor = r2(gastos.filter((l) => (l.categoria_id ?? "sem") === id).reduce((s, l) => s + sinal(l), 0));
      const previsto = r2(previstosFiltrados.filter((l) => (l.categoria_id ?? "sem") === id).reduce((s, l) => s + sinal(l), 0));
      return {
        id,
        nome: id === "sem" ? "Sem categoria" : (nomeCat.get(id) ?? "Categoria removida"),
        valor,
        percentual: total > 0 ? valor / total : 0,
        previsto,
        diferenca: r2(valor - previsto),
        lancamentos: gastos.filter((l) => (l.categoria_id ?? "sem") === id).sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "")),
      };
    })
    .filter((c) => c.valor !== 0 || c.previsto !== 0)
    .sort((a, b) => b.valor - a.valor || b.previsto - a.previsto);

  // Por classe contra a meta (percentual da receita do mês; realizada, ou a prevista se ainda não houver).
  const receitaRealizada = realizados.filter((l) => l.natureza === "fluxo" && l.classe === "Receita").reduce((s, l) => s + sinal(l), 0);
  const receitaPrevista = previstos.filter((l) => l.natureza === "fluxo" && l.classe === "Receita").reduce((s, l) => s + sinal(l), 0);
  const receita = receitaRealizada > 0 ? receitaRealizada : receitaPrevista;
  const porClasse = CLASSES_DESPESA.map((classe) => {
    const valor = r2(gastos.filter((l) => l.classe === classe).reduce((s, l) => s + sinal(l), 0));
    const metaPct = entrada.metas[classe] ?? null;
    const metaValor = metaPct !== null && receita > 0 ? r2((metaPct / 100) * receita) : null;
    const percentualReceita = receita > 0 ? Math.round((valor / receita) * 1000) / 10 : null;
    // Com filtro, a meta é a do mês inteiro: o status só vale na visão de todas as contas.
    const status: StatusMeta = filtro === "todas" ? statusDaMeta(percentualReceita, metaPct) : "sem-meta";
    return { classe, valor, metaPct, metaValor, percentualReceita, status };
  });

  // Parcelas e estornos do mês.
  const parcelas = gastos
    .filter((l) => l.parcela && !l.estorno)
    .map((l) => {
      const [k, n] = l.parcela!.split("/").map(Number);
      return { id: l.id, descricao: l.descricao, parcela: l.parcela!, valor: l.valor, restantes: n - k, aPagar: r2((n - k) * l.valor), conta: l.conta_id ? contas.get(l.conta_id)?.nome : undefined };
    })
    .sort((a, b) => b.aPagar - a.aPagar);
  const estornos = gastos.filter((l) => l.estorno);

  // Comprometimento futuro dos cartões: parcelas previstas dos meses seguintes.
  const futuras = entrada.parcelasFuturas.filter(
    (l) => l.tipo === "Previsto" && l.parcela && l.mes_competencia > mes && ehCartao(l.conta_id ? contas.get(l.conta_id) : undefined) && passaFiltro(l, filtro, contas),
  );
  const meses = [...new Set(futuras.map((l) => l.mes_competencia))].sort();
  const comprometimento = meses.map((m) => ({ mes: m, valor: r2(futuras.filter((l) => l.mes_competencia === m).reduce((s, l) => s + l.valor, 0)) }));

  return {
    total,
    porConta,
    porCategoria,
    maiorCategoria: porCategoria.find((c) => c.valor > 0) ?? null,
    porClasse,
    receita: r2(receita),
    parcelas,
    estornos,
    totalEstornos: r2(estornos.reduce((s, l) => s + l.valor, 0)),
    comprometimento,
    dividaFutura: r2(comprometimento.reduce((s, c) => s + c.valor, 0)),
    quantidade: gastos.length,
  };
}

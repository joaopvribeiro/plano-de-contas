/**
 * Monta a revisão de uma importação a partir do que foi lido. Puro e testado (revisao.test.ts).
 *
 * Ordem de decisão de cada linha:
 * 1. Regra da família ("quando a descrição contiver X") — sempre vence.
 * 2. Sugestão da IA (natureza e categoria).
 * 3. Padrão: entrada em conta vira Receita; pagamento recebido no cartão vira transferência;
 *    o resto fica pendente de categoria.
 *
 * Mês de competência: cartão = mês da fatura (o do fechamento, editável na revisão);
 * conta = mês da data. Estorno: entrada numa categoria de despesa, ou saída na de receita.
 */
import type { Categoria, Classe, Conta, Natureza, Regra } from "@/lib/dominio";
import { normalizarDescricao, regraParaDescricao, sugerirCompetencia, sugerirPadrao } from "@/lib/lancamentos/regras-de-negocio";
import { arredondar, extrairParcela, type DocumentoLido, type ItemLido, type Sentido } from "./tipos";

export type Duplicada = { lancamento_id: string; descricao: string; data: string; valor: number };

export type ParcelaAberta = {
  id: string;
  descricao: string;
  valor: number;
  parcela: string;
  grupo_parcela: string;
  mes_competencia: string;
  categoria_id?: string | null;
  classe?: Classe | null;
};

export type OrigemSugestao = "regra" | "ia" | "padrao" | "manual";

export type LinhaRevisao = {
  idx: number;
  data: string;
  descricao: string;
  valor: number;
  sentido: Sentido;
  parcela: string | null;
  natureza: Natureza;
  categoria_id: string | null;
  classe: Classe | null;
  estorno: boolean;
  assinatura: boolean;
  mes_competencia: string;
  sugestao: OrigemSugestao | null;
  /** Padrão da regra aplicada, para mostrar "regra: PETZ". */
  regra: string | null;
  duplicada: Duplicada | null;
  /** Previsto de parcela já existente que esta linha realiza. */
  vinculo: { previsto_id: string; grupo_parcela: string; mes_competencia: string } | null;
  /** Criar as parcelas seguintes como previstas (só quando há parcela k/n, k < n, sem vínculo). */
  criar_futuras: boolean;
  incluir: boolean;
};

export type ContextoRevisao = {
  conta: Pick<Conta, "id" | "tipo" | "dia_fechamento">;
  categorias: Pick<Categoria, "id" | "nome" | "classe_padrao" | "arquivada">[];
  regras: Pick<Regra, "padrao" | "natureza" | "categoria_id" | "classe" | "assinatura">[];
  /** Mês da fatura escolhido (cartão). Sem ele, vale o do fechamento lido; sem fechamento, a regra do cartão. */
  mes_fatura?: string | null;
  duplicadas?: Map<number, Duplicada>;
  parcelas_abertas?: ParcelaAberta[];
};

const mesDaData = (d: string) => d.slice(0, 7);

/** Mês da fatura sugerido: o do fechamento lido. */
export function mesFaturaSugerido(doc: DocumentoLido): string | null {
  return doc.fechamento ? mesDaData(doc.fechamento) : null;
}

export function ehCartao(conta: Pick<Conta, "tipo">) {
  return conta.tipo === "cartao_credito";
}

/** Estorno: entrada numa classe de despesa, ou saída na classe Receita. */
export function estornoPara(classe: Classe | null, sentido: Sentido): boolean {
  if (!classe) return false;
  return classe === "Receita" ? sentido === "saida" : sentido === "entrada";
}

function competencia(item: ItemLido, ctx: ContextoRevisao, doc: DocumentoLido): string {
  if (!ehCartao(ctx.conta)) return mesDaData(item.data);
  return ctx.mes_fatura ?? mesFaturaSugerido(doc) ?? sugerirCompetencia(item.data, ctx.conta);
}

/** Primeira palavra significativa igual, ou uma descrição contida na outra. */
function mesmaCompra(a: string, b: string): boolean {
  const na = normalizarDescricao(extrairParcela(a).base);
  const nb = normalizarDescricao(extrairParcela(b).base);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na) || sugerirPadrao(na) === sugerirPadrao(nb);
}

/** Previsto aberto da mesma compra e da mesma parcela (valor com tolerância de R$ 1). */
export function acharParcelaAberta(item: Pick<ItemLido, "descricao" | "valor" | "parcela">, abertas: ParcelaAberta[], usadas: Set<string>) {
  if (!item.parcela) return null;
  return (
    abertas.find(
      (p) => !usadas.has(p.id) && p.parcela === item.parcela && Math.abs(p.valor - item.valor) <= 1 && mesmaCompra(p.descricao, item.descricao),
    ) ?? null
  );
}

function ehPagamentoDeCartao(descricao: string) {
  const n = normalizarDescricao(descricao);
  return /\bPAGAMENTO\b|\bPAGTO\b|\bPGTO\b/.test(n) && !/\bESTORNO\b/.test(n);
}

export function montarRevisao(doc: DocumentoLido, ctx: ContextoRevisao): LinhaRevisao[] {
  const ativas = ctx.categorias.filter((c) => !c.arquivada);
  const porNome = new Map(ativas.map((c) => [c.nome, c]));
  const porId = new Map(ativas.map((c) => [c.id, c]));
  const receita = ativas.find((c) => c.classe_padrao === "Receita");
  const usadas = new Set<string>();
  const cartao = ehCartao(ctx.conta);

  const linhas = doc.itens.map((item, idx): LinhaRevisao => {
    let natureza: Natureza = "fluxo";
    let categoria_id: string | null = null;
    let classe: Classe | null = null;
    let assinatura = false;
    let sugestao: OrigemSugestao | null = null;
    let regraPadrao: string | null = null;

    const regra = regraParaDescricao(item.descricao, ctx.regras);
    const categoriaDaRegra = regra?.categoria_id ? porId.get(regra.categoria_id) : undefined;
    if (regra && (regra.natureza !== "fluxo" || categoriaDaRegra)) {
      natureza = regra.natureza;
      categoria_id = categoriaDaRegra?.id ?? null;
      classe = natureza === "fluxo" ? (regra.classe ?? categoriaDaRegra?.classe_padrao ?? null) : null;
      assinatura = regra.assinatura;
      sugestao = "regra";
      regraPadrao = regra.padrao;
    } else if (item.natureza_sugerida && (item.natureza_sugerida !== "fluxo" || (item.categoria_sugerida && porNome.has(item.categoria_sugerida)))) {
      natureza = item.natureza_sugerida;
      if (natureza === "fluxo") {
        const c = porNome.get(item.categoria_sugerida!)!;
        categoria_id = c.id;
        classe = c.classe_padrao;
      }
      sugestao = "ia";
    } else if (cartao && item.sentido === "entrada" && ehPagamentoDeCartao(item.descricao)) {
      natureza = "transferencia";
      sugestao = "padrao";
    } else if (!cartao && item.sentido === "entrada" && receita) {
      categoria_id = receita.id;
      classe = "Receita";
      sugestao = "padrao";
    }

    const duplicada = ctx.duplicadas?.get(idx) ?? null;
    const aberta = acharParcelaAberta(item, ctx.parcelas_abertas ?? [], usadas);
    if (aberta) {
      usadas.add(aberta.id);
      // A parcela realizada herda a classificação do previsto, salvo regra explícita.
      const cat = aberta.categoria_id ? porId.get(aberta.categoria_id) : undefined;
      if (sugestao !== "regra" && cat && aberta.classe) {
        natureza = "fluxo";
        categoria_id = cat.id;
        classe = aberta.classe;
        sugestao = "padrao";
      }
    }
    const [k, n] = item.parcela ? item.parcela.split("/").map(Number) : [0, 0];

    return {
      idx,
      data: item.data,
      descricao: item.descricao,
      valor: item.valor,
      sentido: item.sentido,
      parcela: item.parcela,
      natureza,
      categoria_id,
      classe,
      estorno: natureza === "fluxo" ? estornoPara(classe, item.sentido) : false,
      assinatura,
      mes_competencia: competencia(item, ctx, doc),
      sugestao,
      regra: regraPadrao,
      duplicada,
      vinculo: aberta ? { previsto_id: aberta.id, grupo_parcela: aberta.grupo_parcela, mes_competencia: aberta.mes_competencia } : null,
      criar_futuras: !aberta && k > 0 && k < n,
      // Duplicada vem desmarcada: a pessoa confirma se é mesmo outra transação.
      incluir: !duplicada,
    };
  });

  // Transferências no fim: são as que menos precisam de atenção.
  return [...linhas.filter((l) => l.natureza !== "transferencia"), ...linhas.filter((l) => l.natureza === "transferencia")];
}

/** O que falta para a linha poder ser gravada. */
export function pendenciaDaLinha(l: Pick<LinhaRevisao, "incluir" | "natureza" | "categoria_id" | "classe">): string | null {
  if (!l.incluir) return null;
  if (l.natureza === "fluxo" && (!l.categoria_id || !l.classe)) return "Escolha a categoria";
  return null;
}

/** Ajusta a linha depois de uma edição na revisão, mantendo classe e estorno coerentes. */
export function editarLinha(
  l: LinhaRevisao,
  mudanca: Partial<Pick<LinhaRevisao, "natureza" | "categoria_id" | "classe" | "incluir" | "criar_futuras" | "mes_competencia">>,
  categorias: Pick<Categoria, "id" | "classe_padrao">[],
): LinhaRevisao {
  const r: LinhaRevisao = { ...l, ...mudanca };
  if ("natureza" in mudanca || "categoria_id" in mudanca || "classe" in mudanca) r.sugestao = "manual";
  if (r.natureza !== "fluxo") {
    r.categoria_id = null;
    r.classe = null;
  } else if ("categoria_id" in mudanca && !("classe" in mudanca)) {
    r.classe = categorias.find((c) => c.id === r.categoria_id)?.classe_padrao ?? null;
  }
  r.estorno = r.natureza === "fluxo" ? estornoPara(r.classe, r.sentido) : false;
  return r;
}

// ---------------------------------------------------------------------------
// Conferência com o total do documento
// ---------------------------------------------------------------------------

export type Conferencia = { rotulo: string; esperado: number; lido: number; diferenca: number; confere: boolean };

/**
 * Fatura: compras − estornos (sem os pagamentos) contra o total da fatura.
 * Extrato: entradas − saídas contra saldo final − saldo inicial.
 * Usa todas as linhas lidas, marcadas ou não: o objetivo é ver se a leitura pegou tudo.
 */
export function conferirTotal(doc: DocumentoLido, linhas: Pick<LinhaRevisao, "natureza" | "sentido" | "valor">[]): Conferencia | null {
  if (doc.tipo === "fatura_cartao" && doc.total_fatura !== null) {
    const lido = arredondar(
      linhas.filter((l) => l.natureza !== "transferencia").reduce((s, l) => s + (l.sentido === "saida" ? l.valor : -l.valor), 0),
    );
    const diferenca = arredondar(doc.total_fatura - lido);
    return { rotulo: "Total da fatura", esperado: doc.total_fatura, lido, diferenca, confere: Math.abs(diferenca) <= 0.05 };
  }
  if (doc.tipo === "extrato_conta" && doc.saldo_inicial !== null && doc.saldo_final !== null) {
    const esperado = arredondar(doc.saldo_final - doc.saldo_inicial);
    const lido = arredondar(linhas.reduce((s, l) => s + (l.sentido === "entrada" ? l.valor : -l.valor), 0));
    const diferenca = arredondar(esperado - lido);
    return { rotulo: "Variação do saldo no extrato", esperado, lido, diferenca, confere: Math.abs(diferenca) <= 0.05 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parcelas futuras
// ---------------------------------------------------------------------------

function somarMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Parcelas k+1..n como previstas, uma por mês a partir do mês seguinte ao da linha. */
export function parcelasFuturas(l: Pick<LinhaRevisao, "parcela" | "mes_competencia" | "descricao" | "valor">) {
  if (!l.parcela) return [];
  const [k, n] = l.parcela.split("/").map(Number);
  const base = extrairParcela(l.descricao).base;
  return Array.from({ length: Math.max(n - k, 0) }, (_, j) => ({
    parcela: `${k + j + 1}/${n}`,
    mes_competencia: somarMes(l.mes_competencia, j + 1),
    descricao: base,
    valor: l.valor,
  }));
}

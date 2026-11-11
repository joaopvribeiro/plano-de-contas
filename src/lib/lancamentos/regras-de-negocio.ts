/**
 * Regras de negócio dos lançamentos que não dependem do banco.
 * Tudo aqui é puro e testado em regras-de-negocio.test.ts.
 */
import type { Classe, Conta, Lancamento, Natureza, Regra } from "@/lib/dominio";

// ---------------------------------------------------------------------------
// Valores em reais
// ---------------------------------------------------------------------------

/**
 * Lê um valor digitado em reais. Aceita "1.234,56", "1234,56", "1234.56",
 * "R$ 1.234,56" e "1234". Devolve null se não for um número válido.
 */
export function lerValorBRL(texto: string | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  let s = String(texto).replace(/R\$|\s/g, "").trim();
  if (!s) return null;
  const negativo = s.startsWith("-");
  s = s.replace(/^[-+]/, "");

  if (s.includes(",")) {
    // Formato brasileiro: ponto é milhar, vírgula é decimal.
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" ou "1.234.567" sem vírgula: pontos são milhar.
    s = s.replace(/\./g, "");
  } else if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return null;
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((negativo ? -n : n) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Competência pela regra da fatura
// ---------------------------------------------------------------------------

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Mês de competência sugerido para um lançamento.
 * Cartão: a compra entra na fatura que fecha no próprio mês se for feita até o
 * dia de fechamento; depois disso, na fatura do mês seguinte. A fatura conta no
 * mês em que fecha (fecha 28/10, vence 05/11 → outubro).
 * Outras contas: o mês da data.
 * Fechamento em dia que o mês não tem (ex.: 31 em fevereiro) vale o último dia.
 */
export function sugerirCompetencia(dataISO: string, conta?: Pick<Conta, "tipo" | "dia_fechamento"> | null): string {
  const [a, m, d] = dataISO.slice(0, 10).split("-").map(Number);
  if (!conta || conta.tipo !== "cartao_credito" || !conta.dia_fechamento) {
    return `${a}-${String(m).padStart(2, "0")}`;
  }
  const fechamento = Math.min(conta.dia_fechamento, ultimoDiaDoMes(a, m));
  if (d <= fechamento) return `${a}-${String(m).padStart(2, "0")}`;
  const total = a * 12 + m; // mês seguinte (m é 1-based, então isto já soma 1)
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Regras aprendidas
// ---------------------------------------------------------------------------

/** Maiúsculas, sem acento e com espaços simples, para comparar descrições. */
export function normalizarDescricao(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Regra que se aplica a uma descrição ("quando a descrição contiver X"): a de padrão mais longo
 * (mais específica vence; "UBER EATS" ganha de "UBER"). Empate: ordem alfabética.
 */
export function regraParaDescricao<T extends Pick<Regra, "padrao">>(descricao: string, regras: T[]): T | null {
  const alvo = normalizarDescricao(descricao);
  let melhor: T | null = null;
  let tamanhoMelhor = 0;
  for (const r of regras) {
    const p = normalizarDescricao(r.padrao);
    if (!p) continue;
    if (alvo.includes(p)) {
      if (p.length > tamanhoMelhor || (p.length === tamanhoMelhor && melhor && r.padrao < melhor.padrao)) {
        melhor = r;
        tamanhoMelhor = p.length;
      }
    }
  }
  return melhor;
}

/**
 * Sugere um padrão de regra a partir de uma descrição: a primeira palavra
 * significativa (ignora números, datas e códigos curtos). "PETZ*123 SP" → "PETZ".
 */
export function sugerirPadrao(descricao: string): string {
  const palavras = normalizarDescricao(descricao).split(" ");
  const boa = palavras.find((p) => p.length >= 3 && !/^\d+$/.test(p));
  return boa ?? palavras[0] ?? "";
}

// ---------------------------------------------------------------------------
// Efeito no saldo
// ---------------------------------------------------------------------------

export type EfeitoLancamento = Pick<Lancamento, "natureza" | "classe" | "valor" | "estorno">;

/**
 * Quanto um lançamento soma ao Saldo do mês da DFC.
 * Receita soma; despesa subtrai; estorno inverte dentro da própria classe.
 * Transferência, aporte e resgate não entram no Saldo do mês (valor 0).
 */
export function efeitoNoSaldo(l: EfeitoLancamento): number {
  if (l.natureza !== "fluxo" || !l.classe) return 0;
  const base = l.classe === "Receita" ? l.valor : -l.valor;
  return l.estorno ? -base : base;
}

/** Totais de um conjunto de lançamentos, separando o que está fora da DFC. */
export function totaisDoFiltro(lancamentos: EfeitoLancamento[]) {
  let receitas = 0;
  let despesas = 0;
  let investimentos = 0; // resgates − aportes
  let transferencias = 0;
  for (const l of lancamentos) {
    if (l.natureza === "fluxo" && l.classe) {
      const e = efeitoNoSaldo(l);
      if (l.classe === "Receita") receitas += e;
      else despesas -= e;
    } else if (l.natureza === "aporte") investimentos -= l.valor;
    else if (l.natureza === "resgate") investimentos += l.valor;
    else transferencias += l.valor;
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    receitas: r(receitas),
    despesas: r(despesas),
    saldo: r(receitas - despesas),
    investimentos: r(investimentos),
    transferencias: r(transferencias),
  };
}

// ---------------------------------------------------------------------------
// Coerência dos campos
// ---------------------------------------------------------------------------

/**
 * Ajusta campos dependentes antes de gravar, para nunca violar os checks do banco:
 * - natureza diferente de fluxo: sem classe, categoria nem subtipo;
 * - classe diferente de Receita: sem subtipo;
 * - ativo só em aporte/resgate.
 */
export function normalizarCampos<
  T extends {
    natureza: Natureza;
    classe: Classe | null;
    categoria_id: string | null;
    subtipo_receita: string | null;
    ativo_id?: string | null;
  },
>(l: T): T {
  const r = { ...l };
  if (r.natureza !== "fluxo") {
    r.classe = null;
    r.categoria_id = null;
    r.subtipo_receita = null;
  }
  if (r.classe !== "Receita") r.subtipo_receita = null;
  if (r.natureza !== "aporte" && r.natureza !== "resgate" && "ativo_id" in r) r.ativo_id = null;
  return r;
}

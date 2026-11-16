/**
 * Leitura de CSV exportado pelo banco (Nubank, Inter, C6, planilhas próprias).
 * Reconhece as colunas pelo nome e não precisa de IA.
 *
 * Sinal do valor:
 * - colunas separadas de crédito e débito (ou entrada e saída): usa cada uma;
 * - uma coluna só, em conta: negativo = saída;
 * - uma coluna só, em cartão: o sinal da maioria é compra (o CSV de fatura do
 *   Nubank traz compras positivas; outros trazem negativas).
 */
import { dividir } from "@/lib/planilha/previsto";
import { lerValorBRL, normalizarDescricao } from "@/lib/lancamentos/regras-de-negocio";
import { arredondar, extrairParcela, type DocumentoLido, type ItemLido } from "./tipos";

const SINONIMOS = {
  data: ["DATA", "DATE", "DATA LANCAMENTO", "DATA DA TRANSACAO", "DATA DA COMPRA", "DT LANCAMENTO", "DATA MOVIMENTO"],
  descricao: ["DESCRICAO", "HISTORICO", "LANCAMENTO", "TITLE", "ESTABELECIMENTO", "DESCRIPTION", "MEMO", "DETALHES"],
  valor: ["VALOR", "AMOUNT", "VALOR R", "VALOR EM R", "VALOR BRL", "QUANTIA"],
  credito: ["CREDITO", "ENTRADA", "ENTRADAS", "CREDITOS"],
  debito: ["DEBITO", "SAIDA", "SAIDAS", "DEBITOS"],
  parcela: ["PARCELA", "PARCELAS"],
} as const;
type Coluna = keyof typeof SINONIMOS;

/** "05/10/2026", "05/10/26", "2026-10-05", "05-10-2026". */
export function lerData(texto: string): string | null {
  const t = texto.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (m) {
    const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (d < 1 || d > 31 || mes < 1 || mes > 12) return null;
    const ano = a < 100 ? 2000 + a : a;
    return `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

export function lerCSVBanco(texto: string, ehCartao: boolean): DocumentoLido | { erro: string } {
  const linhas = dividir(texto);
  // O cabeçalho pode não ser a primeira linha (alguns bancos põem título e agência antes).
  let cab = -1;
  const indice = new Map<Coluna, number>();
  for (let i = 0; i < Math.min(linhas.length, 15) && cab < 0; i++) {
    indice.clear();
    linhas[i].forEach((h, j) => {
      const n = normalizarDescricao(h);
      const col = (Object.keys(SINONIMOS) as Coluna[]).find((c) => (SINONIMOS[c] as readonly string[]).includes(n));
      if (col && !indice.has(col)) indice.set(col, j);
    });
    if (indice.has("data") && indice.has("descricao") && (indice.has("valor") || indice.has("credito") || indice.has("debito"))) cab = i;
  }
  if (cab < 0) return { erro: "Não reconheci as colunas do CSV. Preciso de data, descrição e valor (ou crédito e débito)." };

  const v = (l: string[], c: Coluna) => (indice.has(c) ? (l[indice.get(c)!] ?? "").trim() : "");
  const brutos: { data: string; descricao: string; valor: number; parcela: string | null }[] = [];
  const avisos: string[] = [];
  for (const l of linhas.slice(cab + 1)) {
    const data = lerData(v(l, "data"));
    const descricao = v(l, "descricao");
    let valor: number | null;
    if (indice.has("valor")) valor = lerValorBRLouPonto(v(l, "valor"));
    else {
      const c = lerValorBRLouPonto(v(l, "credito")) ?? 0;
      const d = lerValorBRLouPonto(v(l, "debito")) ?? 0;
      valor = c - Math.abs(d);
    }
    if (!data && !descricao) continue;
    // Linhas de saldo não são transações.
    if (/^SALDO\b/.test(normalizarDescricao(descricao))) continue;
    if (!data || !descricao || valor === null) {
      avisos.push(`Linha ignorada: ${l.join(" | ").slice(0, 80)}`);
      continue;
    }
    if (valor === 0) continue;
    const parcelaColuna = v(l, "parcela");
    const parcela = /^\d{1,2}\/\d{1,2}$/.test(parcelaColuna) ? parcelaColuna.replace(/^0/, "").replace(/\/0/, "/") : extrairParcela(descricao).parcela;
    brutos.push({ data, descricao, valor, parcela });
  }
  if (!brutos.length) return { erro: "Não encontrei transações no CSV." };

  // Em cartão com uma coluna de valor, o sinal da maioria é compra.
  let compraPositiva = false;
  if (ehCartao && indice.has("valor")) {
    const positivos = brutos.filter((b) => b.valor > 0).length;
    compraPositiva = positivos > brutos.length / 2;
  }
  const itens: ItemLido[] = brutos.map((b) => {
    const saida = compraPositiva ? b.valor > 0 : b.valor < 0;
    return { data: b.data, descricao: b.descricao, valor: arredondar(Math.abs(b.valor)), sentido: saida ? "saida" : "entrada", parcela: b.parcela };
  });

  return {
    tipo: ehCartao ? "fatura_cartao" : "extrato_conta",
    banco: null,
    fechamento: null,
    vencimento: null,
    total_fatura: null,
    saldo_inicial: null,
    saldo_final: null,
    itens,
    avisos,
  };
}

/** Valor em real ("1.234,56") ou em ponto decimal ("-1234.56", exportação em inglês). */
function lerValorBRLouPonto(texto: string): number | null {
  if (!texto) return null;
  const br = lerValorBRL(texto);
  if (br !== null) return br;
  const s = texto.replace(/R\$|\s/g, "");
  if (/^[-+]?\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 100) / 100;
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Math.round(Number(s.replace(/,/g, "")) * 100) / 100;
  return null;
}


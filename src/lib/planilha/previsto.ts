/**
 * Leitura do orçamento previsto vindo de planilha.
 * Aceita CSV (vírgula ou ponto e vírgula) e o trecho colado direto do Excel
 * ou do Google Sheets (tabulação). Puro e testado (previsto.test.ts).
 */
import { CLASSES, type Classe, type Natureza } from "@/lib/dominio";
import { lerValorBRL, normalizarDescricao } from "@/lib/lancamentos/regras-de-negocio";

export const COLUNAS = ["mes", "descricao", "valor", "conta", "categoria", "classe", "natureza", "obs"] as const;
type Coluna = (typeof COLUNAS)[number];

/** Nomes aceitos no cabeçalho (comparados sem acento e sem caixa). */
const SINONIMOS: Record<Coluna, string[]> = {
  mes: ["MES", "COMPETENCIA", "MES DE COMPETENCIA", "MES COMPETENCIA", "DATA"],
  descricao: ["DESCRICAO", "HISTORICO", "LANCAMENTO", "ITEM"],
  valor: ["VALOR", "VALOR R", "VALOR PREVISTO", "PREVISTO"],
  conta: ["CONTA", "CARTAO", "CONTA OU CARTAO", "CONTA CARTAO", "MEIO"],
  categoria: ["CATEGORIA"],
  classe: ["CLASSE"],
  natureza: ["NATUREZA"],
  obs: ["OBS", "OBSERVACAO", "OBSERVACOES", "NOTA"],
};

export const MODELO_CSV =
  "mês;descrição;valor;conta;categoria;classe;natureza;obs\n" +
  "2026-12;Salário titular 1;12.000,00;;Receita;Receita;;\n" +
  "2026-12;Aluguel;4.200,00;CC - C6;Moradia;Despesa básica;;\n" +
  "2026-12;Supermercado;2.200,00;Nubank;Alimentação;;;classe vazia = padrão da categoria\n" +
  "2026-12;Aporte mensal;1.000,00;CC - C6;;;aporte;\n";

const MESES_PT: Record<string, number> = {
  JAN: 1, JANEIRO: 1, FEV: 2, FEVEREIRO: 2, MAR: 3, MARCO: 3, ABR: 4, ABRIL: 4, MAI: 5, MAIO: 5,
  JUN: 6, JUNHO: 6, JUL: 7, JULHO: 7, AGO: 8, AGOSTO: 8, SET: 9, SETEMBRO: 9, OUT: 10, OUTUBRO: 10,
  NOV: 11, NOVEMBRO: 11, DEZ: 12, DEZEMBRO: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const anoCompleto = (a: number) => (a < 100 ? 2000 + a : a);

/**
 * Lê o mês: "2026-11", "11/2026", "11/26", "nov/26", "novembro de 2026",
 * "01/11/2026" (data → mês) e "2026-11-15".
 */
export function lerMes(texto: string): string | null {
  const t = texto.trim();
  let m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(t);
  if (m) return +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}-${pad(+m[2])}` : null;
  m = /^(?:\d{1,2}\/)?(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
  if (m) return +m[1] >= 1 && +m[1] <= 12 ? `${anoCompleto(+m[2])}-${pad(+m[1])}` : null;
  const n = normalizarDescricao(t).split(" ").filter((p) => p !== "DE");
  if (n.length === 2 && MESES_PT[n[0]] && /^\d{2}(\d{2})?$/.test(n[1])) return `${anoCompleto(+n[1])}-${pad(MESES_PT[n[0]])}`;
  return null;
}

const NATUREZAS_TEXTO: Record<string, Natureza> = {
  "": "fluxo",
  FLUXO: "fluxo",
  RECEITA: "fluxo",
  DESPESA: "fluxo",
  "RECEITA OU DESPESA": "fluxo",
  TRANSFERENCIA: "transferencia",
  APORTE: "aporte",
  INVESTIMENTO: "aporte",
  RESGATE: "resgate",
};

/** Divide o texto em linhas e células, respeitando aspas. Detecta o separador pelo cabeçalho. */
export function dividir(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const primeira = limpo.split("\n", 1)[0] ?? "";
  const sep = primeira.includes("\t") ? "\t" : (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";

  const linhas: string[][] = [];
  let celula = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        celula += '"';
        i++;
      } else if (c === '"') aspas = false;
      else celula += c;
    } else if (c === '"' && celula === "") aspas = true;
    else if (c === sep) {
      linha.push(celula);
      celula = "";
    } else if (c === "\n") {
      linha.push(celula);
      linhas.push(linha);
      linha = [];
      celula = "";
    } else celula += c;
  }
  if (celula !== "" || linha.length) {
    linha.push(celula);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

export type Cadastro = { id: string; nome: string };
export type CategoriaCadastro = Cadastro & { classe_padrao: Classe };

export type LinhaPrevisto = {
  mes_competencia: string;
  descricao: string;
  valor: number;
  conta_id: string | null;
  categoria_id: string | null;
  classe: Classe | null;
  natureza: Natureza;
  obs: string | null;
};

export type ResultadoLinha =
  | { linha: number; ok: true; dados: LinhaPrevisto; rotulos: { conta?: string; categoria?: string } }
  | { linha: number; ok: false; erros: string[]; bruto: string[] };

export type ResultadoLeitura =
  | { ok: false; erro: string }
  | { ok: true; linhas: ResultadoLinha[]; colunas: Coluna[]; ignoradas: string[] };

function mapaPorNome<T extends Cadastro>(itens: T[]) {
  return new Map(itens.map((i) => [normalizarDescricao(i.nome), i]));
}

export function lerPlanilhaPrevisto(
  texto: string,
  cadastros: { contas: Cadastro[]; categorias: CategoriaCadastro[] },
  limite = 2000,
): ResultadoLeitura {
  const linhas = dividir(texto);
  if (linhas.length < 2) return { ok: false, erro: "A planilha precisa de um cabeçalho e ao menos uma linha." };

  // Cabeçalho → coluna
  const indice = new Map<Coluna, number>();
  const ignoradas: string[] = [];
  linhas[0].forEach((h, i) => {
    const n = normalizarDescricao(h);
    const col = COLUNAS.find((c) => SINONIMOS[c].includes(n));
    if (col && !indice.has(col)) indice.set(col, i);
    else if (h.trim()) ignoradas.push(h.trim());
  });
  const faltando = (["mes", "descricao", "valor"] as const).filter((c) => !indice.has(c));
  if (faltando.length) {
    return {
      ok: false,
      erro: `Não encontrei a(s) coluna(s) ${faltando.map((c) => `"${c === "mes" ? "mês" : c === "descricao" ? "descrição" : c}"`).join(", ")} no cabeçalho.`,
    };
  }
  if (linhas.length - 1 > limite) return { ok: false, erro: `A planilha tem ${linhas.length - 1} linhas; o limite é ${limite} por importação.` };

  const contas = mapaPorNome(cadastros.contas);
  const categorias = mapaPorNome(cadastros.categorias);
  const classes = new Map(CLASSES.map((c) => [normalizarDescricao(c), c]));

  const resultado = linhas.slice(1).map((celulas, i): ResultadoLinha => {
    const v = (c: Coluna) => (indice.has(c) ? (celulas[indice.get(c)!] ?? "").trim() : "");
    const erros: string[] = [];

    const mes = lerMes(v("mes"));
    if (!mes) erros.push(`Mês inválido: "${v("mes")}" (use 2026-11, 11/2026 ou nov/26).`);

    const descricao = v("descricao");
    if (!descricao) erros.push("Descrição vazia.");
    else if (descricao.length > 200) erros.push("Descrição com mais de 200 caracteres.");

    const valor = lerValorBRL(v("valor"));
    if (valor === null) erros.push(`Valor inválido: "${v("valor")}".`);
    else if (valor <= 0) erros.push("O valor precisa ser positivo (receita ou despesa é definida pela classe).");

    const natTexto = normalizarDescricao(v("natureza"));
    const natureza = NATUREZAS_TEXTO[natTexto];
    if (!natureza) erros.push(`Natureza inválida: "${v("natureza")}" (use vazio, transferência, aporte ou resgate).`);

    let conta: Cadastro | undefined;
    if (v("conta")) {
      conta = contas.get(normalizarDescricao(v("conta")));
      if (!conta) erros.push(`Conta "${v("conta")}" não cadastrada.`);
    }

    let categoria: CategoriaCadastro | undefined;
    let classe: Classe | null = null;
    if (natureza === "fluxo") {
      if (!v("categoria")) erros.push("Categoria vazia.");
      else {
        categoria = categorias.get(normalizarDescricao(v("categoria")));
        if (!categoria) erros.push(`Categoria "${v("categoria")}" não cadastrada.`);
      }
      if (v("classe")) {
        classe = classes.get(normalizarDescricao(v("classe"))) ?? null;
        if (!classe) erros.push(`Classe inválida: "${v("classe")}".`);
      } else classe = categoria?.classe_padrao ?? null;
    }

    if (erros.length) return { linha: i + 2, ok: false, erros, bruto: celulas };
    return {
      linha: i + 2,
      ok: true,
      dados: {
        mes_competencia: mes!,
        descricao,
        valor: valor!,
        conta_id: conta?.id ?? null,
        categoria_id: natureza === "fluxo" ? categoria!.id : null,
        classe: natureza === "fluxo" ? classe : null,
        natureza: natureza!,
        obs: v("obs") || null,
      },
      rotulos: { conta: conta?.nome, categoria: categoria?.nome },
    };
  });

  return { ok: true, linhas: resultado, colunas: [...indice.keys()], ignoradas };
}

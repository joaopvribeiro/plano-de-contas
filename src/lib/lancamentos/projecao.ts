/**
 * Projeção do orçamento previsto: a partir de um mês já montado, repete cada linha
 * nos meses seguintes do horizonte conforme a regra escolhida. Puro, testado.
 */
import { normalizarDescricao } from "./regras-de-negocio";

export const REPETICOES = ["todos", "unico", "meses", "por_n"] as const;
export type Repeticao = (typeof REPETICOES)[number];

export const ROTULO_REPETICAO: Record<Repeticao, string> = {
  todos: "Todos os meses",
  unico: "Só neste mês",
  meses: "Meses escolhidos",
  por_n: "Pelos próximos N meses",
};

/** Termos de receitas e despesas que não se repetem todo mês. */
const PONTUAIS = ["13", "DECIMO", "FERIAS", "PLR", "BONUS", "BONIFICACAO", "IPVA", "MATRICULA", "RESTITUICAO", "PREMIO"];

export function sugerirRepeticao(descricao: string): Repeticao {
  const palavras = normalizarDescricao(descricao).split(" ");
  return palavras.some((p) => PONTUAIS.includes(p) || /^13O?$/.test(p)) ? "unico" : "todos";
}

export function somarMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Meses do horizonte depois de `origem`. */
export function mesesSeguintes(origem: string, fimHorizonte: string): string[] {
  const r: string[] = [];
  for (let m = somarMes(origem, 1); m <= fimHorizonte; m = somarMes(m, 1)) r.push(m);
  return r;
}

export type RegraLinha = { repeticao: Repeticao; meses?: string[]; n?: number; valor: number };

export function destinos(regra: RegraLinha, origem: string, fimHorizonte: string): string[] {
  const seguintes = mesesSeguintes(origem, fimHorizonte);
  switch (regra.repeticao) {
    case "todos":
      return seguintes;
    case "unico":
      return [];
    case "meses":
      return seguintes.filter((m) => regra.meses?.includes(m));
    case "por_n":
      return seguintes.slice(0, Math.max(regra.n ?? 0, 0));
  }
}

export type LinhaOrigem = {
  id: string;
  descricao: string;
  valor: number;
  conta_id: string | null;
  categoria_id: string | null;
  classe: string | null;
  natureza: string;
  assinatura: boolean;
  obs: string | null;
};

/** Chave para não duplicar: mesmo mês, mesma descrição e mesma conta. */
export const chaveExistente = (mes: string, descricao: string, conta: string | null) => `${mes}|${normalizarDescricao(descricao)}|${conta ?? ""}`;

export function montarProjecao(
  linhas: LinhaOrigem[],
  regras: Map<string, RegraLinha>,
  origem: string,
  fimHorizonte: string,
  existentes: Set<string>,
) {
  const novos: (Omit<LinhaOrigem, "id"> & { mes_competencia: string })[] = [];
  let repetidos = 0;
  for (const l of linhas) {
    const regra = regras.get(l.id);
    if (!regra) continue;
    for (const mes of destinos(regra, origem, fimHorizonte)) {
      if (existentes.has(chaveExistente(mes, l.descricao, l.conta_id))) {
        repetidos++;
        continue;
      }
      const { id: _id, ...resto } = l;
      void _id;
      novos.push({ ...resto, valor: regra.valor, mes_competencia: mes });
    }
  }
  return { novos, repetidos };
}

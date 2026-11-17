/**
 * Revisão de um relatório de investimentos antes de gravar no Patrimônio. Puro, testado.
 *
 * - Cada posição atualiza o ativo que já representa ela (mesma chave do relatório
 *   anterior, ou ativo manual da mesma instituição com o mesmo nome) ou vira um ativo novo.
 * - Ativo existente mantém a categoria que o consultor escolheu.
 * - Posição nova: Previdência vai para Previdência; caixa e pós-fixados com liquidez
 *   D+0/D+1 são sugeridos como Reserva até completar a meta, passando dela o mínimo possível;
 *   o resto vira Investimentos.
 * - Ativos da mesma instituição que não vieram no relatório: sugeridos para zerar
 *   (resgatados) quando vieram de um relatório anterior; os manuais ficam a critério.
 * - Conferência: soma das posições contra o patrimônio bruto do relatório.
 */
import { normalizarDescricao } from "@/lib/lancamentos/regras-de-negocio";
import type { Ativo, CategoriaAtivo, Risco } from "@/lib/patrimonio";
import type { Estrategia, Posicao, RelatorioLido } from "./esquema";

export type AtivoExistente = Pick<Ativo, "id" | "nome" | "categoria" | "instituicao" | "valor" | "origem"> & { chave_relatorio: string | null; reserva_valor?: number | null };

export type LinhaRelatorio = {
  idx: number;
  nome: string;
  estrategia: Estrategia;
  produto: string | null;
  valor: number;
  valor_liquido: number | null;
  liquidez: string | null;
  risco: Risco | null;
  chave: string;
  /** Ativo que esta posição atualiza; null = ativo novo. */
  ativo_id: string | null;
  categoria: CategoriaAtivo;
  /** Por que a categoria foi sugerida (para mostrar na revisão). */
  motivo: "existente" | "previdencia" | "reserva" | "investimentos";
  incluir: boolean;
};

export type Sumido = { ativo: AtivoExistente; zerar: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;

const RISCO: Record<Estrategia, Risco> = {
  caixa: "baixo",
  pos_fixado: "baixo",
  inflacao: "médio",
  pre_fixado: "médio",
  multimercado: "médio",
  previdencia: "médio",
  renda_variavel: "alto",
  fii: "alto",
  internacional: "alto",
  alternativo: "alto",
  outro: "médio",
};

/** Mesma instituição: a primeira palavra significativa de uma está na outra ("BTG" e "BTG Pactual"). */
export function mesmaInstituicao(a: string | null, b: string | null): boolean {
  const na = normalizarDescricao(a ?? "");
  const nb = normalizarDescricao(b ?? "");
  if (!na || !nb) return false;
  const pa = na.split(" ")[0];
  const pb = nb.split(" ")[0];
  return pa === pb || nb.split(" ").includes(pa) || na.split(" ").includes(pb);
}

export function chaveDaPosicao(instituicao: string | null, p: Pick<Posicao, "nome" | "vencimento" | "taxa">): string {
  return [normalizarDescricao(instituicao ?? "").split(" ")[0] ?? "", normalizarDescricao(p.nome), p.vencimento ?? "", normalizarDescricao(p.taxa ?? "")].join("|");
}

export function liquidezTexto(p: Pick<Posicao, "liquidez_dias" | "vencimento">): string | null {
  if (p.liquidez_dias !== null) return `D+${p.liquidez_dias}`;
  if (p.vencimento) return "No vencimento";
  return null;
}

export function montarRevisaoRelatorio(
  rel: RelatorioLido,
  instituicao: string | null,
  existentes: AtivoExistente[],
  reserva: { meta: number; foraDoRelatorio: number },
): { linhas: LinhaRelatorio[]; sumidos: Sumido[] } {
  const daInstituicao = existentes.filter((a) => mesmaInstituicao(a.instituicao, instituicao));
  const usados = new Set<string>();
  const contagem = new Map<string, number>();

  const linhas: LinhaRelatorio[] = rel.posicoes.map((p, idx) => {
    let chave = chaveDaPosicao(instituicao, p);
    const n = (contagem.get(chave) ?? 0) + 1;
    contagem.set(chave, n);
    if (n > 1) chave = `${chave}#${n}`;

    const porChave = existentes.find((a) => !usados.has(a.id) && a.chave_relatorio === chave);
    const nomeP = normalizarDescricao(p.nome);
    const porNome =
      porChave ??
      daInstituicao.find((a) => {
        if (usados.has(a.id) || a.chave_relatorio) return false;
        const na = normalizarDescricao(a.nome);
        return na === nomeP || (na.length >= 6 && nomeP.includes(na)) || (nomeP.length >= 6 && na.includes(nomeP));
      });
    if (porNome) usados.add(porNome.id);

    return {
      idx,
      nome: p.nome,
      estrategia: p.estrategia,
      produto: p.produto,
      valor: p.saldo_bruto,
      valor_liquido: p.saldo_liquido,
      liquidez: liquidezTexto(p),
      risco: RISCO[p.estrategia],
      chave,
      ativo_id: porNome?.id ?? null,
      categoria: porNome?.categoria ?? (p.estrategia === "previdencia" ? "Previdência" : "Investimentos"),
      motivo: porNome ? "existente" : p.estrategia === "previdencia" ? "previdencia" : "investimentos",
      incluir: true,
    };
  });

  // Reserva até a meta: conta o que já é Reserva fora deste relatório e nas posições existentes.
  const porId = new Map(existentes.map((a) => [a.id, a]));
  let reservaAtual =
    reserva.foraDoRelatorio +
    linhas
      .filter((l) => l.ativo_id)
      .reduce((s, l) => {
        if (l.categoria === "Reserva") return s + l.valor;
        // Investimento com parte separada como reserva: a parte continua valendo (até o saldo novo).
        const parte = porId.get(l.ativo_id!)?.reserva_valor ?? 0;
        return s + (l.categoria === "Investimentos" ? Math.min(parte, l.valor) : 0);
      }, 0);
  const candidatas = linhas
    .filter((l) => !l.ativo_id && (l.estrategia === "caixa" || l.estrategia === "pos_fixado"))
    .map((l) => ({ l, dias: rel.posicoes[l.idx].liquidez_dias ?? (l.estrategia === "caixa" ? 0 : null) }))
    .filter((c) => c.dias !== null && c.dias <= 1);
  // Completa a meta sem passar muito dela: a menor posição que cobre o que falta;
  // se nenhuma cobre sozinha, a maior, e repete. Empate: a mais líquida.
  while (reservaAtual < reserva.meta && candidatas.length) {
    const falta = reserva.meta - reservaAtual;
    const cobrem = candidatas.filter((c) => c.l.valor >= falta).sort((a, b) => a.l.valor - b.l.valor || a.dias! - b.dias!);
    const escolhida = cobrem[0] ?? [...candidatas].sort((a, b) => b.l.valor - a.l.valor || a.dias! - b.dias!)[0];
    candidatas.splice(candidatas.indexOf(escolhida), 1);
    escolhida.l.categoria = "Reserva";
    escolhida.l.motivo = "reserva";
    reservaAtual += escolhida.l.valor;
  }

  const sumidos = daInstituicao
    .filter((a) => !usados.has(a.id) && a.valor > 0 && a.categoria !== "Consórcio" && a.categoria !== "Bem" && a.categoria !== "FGTS")
    .map((a) => ({ ativo: a, zerar: a.origem === "relatorio" }));

  return { linhas, sumidos };
}

export type ConferenciaRelatorio = { esperado: number; lido: number; diferenca: number; confere: boolean };

/** Soma de todas as posições lidas (marcadas ou não) contra o patrimônio bruto do relatório. */
export function conferirRelatorio(rel: Pick<RelatorioLido, "patrimonio_bruto" | "posicoes">): ConferenciaRelatorio | null {
  if (rel.patrimonio_bruto === null) return null;
  const lido = r2(rel.posicoes.reduce((s, p) => s + p.saldo_bruto, 0));
  const diferenca = r2(rel.patrimonio_bruto - lido);
  // Tolerância: R$ 1 ou 0,01% do patrimônio (arredondamentos do próprio relatório).
  return { esperado: rel.patrimonio_bruto, lido, diferenca, confere: Math.abs(diferenca) <= Math.max(1, rel.patrimonio_bruto * 0.0001) };
}

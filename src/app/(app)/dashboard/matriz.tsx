"use client";

import Link from "next/link";
import { useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/components/ui";
import { LINHAS_DFC, valorDaLinha, type ChaveLinha, type ResultadoDFC } from "@/lib/dfc";
import { formatBRL, formatMesCurto } from "@/lib/format";

type Visao = "previsto" | "realizado" | "divergencia";
const VISOES: { id: Visao; rotulo: string }[] = [
  { id: "previsto", rotulo: "Previsto" },
  { id: "realizado", rotulo: "Realizado" },
  { id: "divergencia", rotulo: "Divergência" },
];

/** Linhas em que um valor maior é bom (para colorir a divergência). */
const MAIOR_E_MELHOR = new Set<ChaveLinha>(["receitas", "saldo", "saldoAposInvestimentos", "caixa"]);
const LINHAS_DE_DESPESA = new Set<ChaveLinha>(["Despesa básica", "Padrão de vida", "Doações", "Sonhos", "despesas"]);

/** 23.500 (sem centavos na grade; o valor completo aparece ao passar o mouse). */
function inteiro(v: number) {
  return Math.round(v).toLocaleString("pt-BR");
}

function corDivergencia(chave: ChaveLinha, v: number) {
  if (v === 0) return "text-muted";
  if (MAIOR_E_MELHOR.has(chave)) return v > 0 ? "text-positive" : "text-negative";
  if (LINHAS_DE_DESPESA.has(chave)) return v > 0 ? "text-negative" : "text-positive";
  return "text-text";
}

function linkDaCelula(chave: ChaveLinha, mes: string, visao: Visao): string | null {
  const linha = LINHAS_DFC.find((l) => l.chave === chave);
  if (!linha?.classe) return null;
  const p = new URLSearchParams({ mes, classe: linha.classe });
  if (visao === "previsto") p.set("tipo", "Previsto");
  if (visao === "realizado") p.set("tipo", "Realizado");
  return `/lancamentos?${p.toString()}`;
}

function gerarCSV(dfc: ResultadoDFC, visao: Visao) {
  const num = (v: number | null) => (v === null ? "" : v.toFixed(2).replace(".", ","));
  const cab = ["Linha", ...dfc.meses.map((m) => m.mes), "Total"];
  const linhas = LINHAS_DFC.map((l) => [
    l.rotulo,
    ...dfc.meses.map((m) => num(valorDaLinha(m, l.chave, visao))),
    num(valorDaLinha(dfc.total, l.chave, visao)),
  ]);
  // Ponto e vírgula + BOM: abre direto no Excel em português.
  return "﻿" + [cab, ...linhas].map((r) => r.map((c) => `"${c}"`).join(";")).join("\r\n");
}

export function MatrizDFC({ dfc, mesSelecionado, nomeFamilia }: { dfc: ResultadoDFC; mesSelecionado: string; nomeFamilia: string }) {
  const [visao, setVisao] = useState<Visao>(dfc.ultimoMesComRealizado ? "realizado" : "previsto");

  function exportar() {
    const blob = new Blob([gerarCSV(dfc, visao)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DFC ${nomeFamilia} - ${VISOES.find((v) => v.id === visao)!.rotulo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Visão da DFC" className="inline-flex rounded-lg bg-surface-2 p-1 text-sm">
          {VISOES.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={visao === v.id}
              onClick={() => setVisao(v.id)}
              className={cn("rounded-md px-3 py-1.5 font-medium", visao === v.id ? "bg-surface shadow-sm" : "text-muted hover:text-text")}
            >
              {v.rotulo}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={exportar}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-2"
        >
          <Download className="size-4" aria-hidden /> Exportar (CSV/Excel)
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="num w-full min-w-max border-separate border-spacing-0 text-sm">
          <caption className="sr-only">
            Demonstração de fluxo de caixa, visão {VISOES.find((v) => v.id === visao)!.rotulo.toLowerCase()}, valores em reais
          </caption>
          <thead>
            <tr className="text-xs text-muted">
              <th scope="col" className="sticky left-0 z-10 border-b border-border bg-surface-2 px-3 py-2.5 text-left font-medium">
                R$
              </th>
              {dfc.meses.map((m) => (
                <th
                  key={m.mes}
                  scope="col"
                  className={cn(
                    "border-b border-border bg-surface-2 px-3 py-2.5 text-right font-medium",
                    m.mes === mesSelecionado && "text-brand",
                  )}
                >
                  {formatMesCurto(m.mes)}
                  {visao !== "previsto" && !m.temRealizado && <span className="sr-only"> (sem realizado)</span>}
                </th>
              ))}
              <th scope="col" className="border-b border-l border-border bg-surface-2 px-3 py-2.5 text-right font-semibold text-text">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {LINHAS_DFC.map((linha) => (
              <tr key={linha.chave} className={cn(linha.destaque && "font-semibold")}>
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-10 border-b border-border px-3 py-2 text-left font-medium whitespace-nowrap",
                    linha.destaque ? "bg-surface-2" : "bg-surface",
                    !linha.classe && !linha.destaque && "text-muted",
                  )}
                >
                  {linha.rotulo}
                </th>
                {[...dfc.meses, null].map((m, i) => {
                  const fonte = m ?? dfc.total;
                  const v = valorDaLinha(fonte, linha.chave, visao);
                  const mes = m?.mes;
                  const href = mes && v !== null && v !== 0 ? linkDaCelula(linha.chave, mes, visao) : null;
                  const conteudo =
                    v === null ? (
                      <span className="text-muted" aria-label="sem dados">
                        —
                      </span>
                    ) : visao === "divergencia" ? (
                      <span className={corDivergencia(linha.chave, v)}>
                        {v > 0 ? "+" : ""}
                        {inteiro(v)}
                      </span>
                    ) : (
                      <span className={cn(v < 0 && "text-negative")}>{inteiro(v)}</span>
                    );
                  return (
                    <td
                      key={mes ?? "total"}
                      title={v === null ? undefined : formatBRL(v)}
                      className={cn(
                        "border-b border-border px-3 py-2 text-right whitespace-nowrap",
                        linha.destaque && "bg-surface-2",
                        mes === mesSelecionado && !linha.destaque && "bg-brand/5",
                        i === dfc.meses.length && "border-l font-semibold",
                      )}
                    >
                      {href ? (
                        <Link href={href} className="rounded hover:underline focus-visible:underline" aria-label={`${linha.rotulo}, ${formatMesCurto(mes!)}: ${formatBRL(v)}. Ver lançamentos`}>
                          {conteudo}
                        </Link>
                      ) : (
                        conteudo
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Clique num valor de receita ou de classe de despesa para ver os lançamentos. Transferências e pagamentos de fatura
        não entram. {visao === "divergencia" && "Divergência = realizado − previsto; diferenças menores que R$ 0,50 aparecem como zero."}
      </p>
    </div>
  );
}

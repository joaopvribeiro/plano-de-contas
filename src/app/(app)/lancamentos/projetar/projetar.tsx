"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Botao, Cartao, cn } from "@/components/ui";
import { projetarOrcamento } from "@/app/actions/lancamentos";
import { formatBRL, formatMesCurto, formatMesLongo } from "@/lib/format";
import { ROTULO_NATUREZA, type Natureza } from "@/lib/dominio";
import { REPETICOES, ROTULO_REPETICAO, type Repeticao } from "@/lib/lancamentos/projecao";

type Linha = {
  id: string;
  descricao: string;
  valor: number;
  natureza: string;
  classe: string | null;
  conta: string | null;
  categoria: string | null;
  sugestao: Repeticao;
};
type Escolha = { repeticao: Repeticao; meses: string[]; n: number; valor: string };

const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Projetar({ origem, seguintes, linhas }: { origem: string; seguintes: string[]; linhas: Linha[] }) {
  const router = useRouter();
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>(() =>
    Object.fromEntries(linhas.map((l) => [l.id, { repeticao: l.sugestao, meses: [], n: Math.min(3, seguintes.length), valor: brl(l.valor) }])),
  );
  const [res, setRes] = useState<{ erro?: string; criados?: number; repetidos?: number } | null>(null);
  const [pendente, iniciar] = useTransition();
  const mudar = (id: string, m: Partial<Escolha>) => setEscolhas((e) => ({ ...e, [id]: { ...e[id], ...m } }));

  const total = useMemo(
    () =>
      linhas.reduce((s, l) => {
        const e = escolhas[l.id];
        return s + (e.repeticao === "todos" ? seguintes.length : e.repeticao === "meses" ? e.meses.length : e.repeticao === "por_n" ? Math.min(e.n, seguintes.length) : 0);
      }, 0),
    [linhas, escolhas, seguintes.length],
  );

  if (!seguintes.length) return <Aviso tom="info">{formatMesLongo(origem)} é o último mês do horizonte: não há meses seguintes para projetar.</Aviso>;

  return (
    <div className="flex flex-col gap-4">
      <Cartao className="p-0">
        <ul className="divide-y divide-border">
          {linhas.map((l) => {
            const e = escolhas[l.id];
            return (
              <li key={l.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{l.descricao}</p>
                    <p className="text-xs text-muted">
                      {[l.natureza === "fluxo" ? l.classe : ROTULO_NATUREZA[l.natureza as Natureza], l.categoria, l.conta].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <p className="num text-sm font-semibold">{formatBRL(l.valor)}</p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${l.id}-rep`} className="text-xs text-muted">
                      Repetição
                    </label>
                    <select
                      id={`${l.id}-rep`}
                      value={e.repeticao}
                      onChange={(x) => mudar(l.id, { repeticao: x.target.value as Repeticao })}
                      className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
                    >
                      {REPETICOES.map((r) => (
                        <option key={r} value={r}>
                          {ROTULO_REPETICAO[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {e.repeticao === "por_n" && (
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${l.id}-n`} className="text-xs text-muted">
                        Meses
                      </label>
                      <input
                        id={`${l.id}-n`}
                        type="number"
                        min={1}
                        max={seguintes.length}
                        value={e.n}
                        onChange={(x) => mudar(l.id, { n: Math.max(0, Number(x.target.value) || 0) })}
                        className="h-9 w-20 rounded-lg border border-border bg-surface px-2 text-sm"
                      />
                    </div>
                  )}
                  {e.repeticao !== "unico" && (
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${l.id}-valor`} className="text-xs text-muted">
                        Valor nos próximos meses (R$)
                      </label>
                      <input
                        id={`${l.id}-valor`}
                        inputMode="decimal"
                        value={e.valor}
                        onChange={(x) => mudar(l.id, { valor: x.target.value })}
                        className="h-9 w-36 rounded-lg border border-border bg-surface px-2 text-sm"
                      />
                    </div>
                  )}
                </div>
                {e.repeticao === "meses" && (
                  <fieldset className="flex flex-wrap gap-1.5">
                    <legend className="sr-only">Meses de {l.descricao}</legend>
                    {seguintes.map((m) => {
                      const marcado = e.meses.includes(m);
                      return (
                        <label
                          key={m}
                          className={cn(
                            "cursor-pointer rounded-full border px-2.5 py-1 text-xs",
                            marcado ? "border-brand bg-brand text-brand-contrast" : "border-border hover:bg-surface-2",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={marcado}
                            onChange={() => mudar(l.id, { meses: marcado ? e.meses.filter((x) => x !== m) : [...e.meses, m] })}
                          />
                          {formatMesCurto(m)}
                        </label>
                      );
                    })}
                  </fieldset>
                )}
              </li>
            );
          })}
        </ul>
      </Cartao>

      <Cartao className="flex flex-col gap-3 p-4 sm:sticky sm:bottom-4 sm:z-10 sm:shadow-lg">
        <p className="text-sm">
          Vai criar até <strong>{total}</strong> lançamentos previstos de {formatMesCurto(seguintes[0])} a {formatMesCurto(seguintes[seguintes.length - 1])}.
        </p>
        {res?.erro && <Aviso tom="negativo">{res.erro}</Aviso>}
        {res?.criados !== undefined && !res.erro && (
          <Aviso tom="positivo">
            {res.criados} lançamentos previstos criados
            {res.repetidos ? `; ${res.repetidos} já existiam e não foram duplicados` : ""}.{" "}
            <Link href="/dashboard" className="font-semibold underline">
              Ver a DFC
            </Link>
          </Aviso>
        )}
        <div>
          <Botao
            disabled={pendente || total === 0}
            onClick={() =>
              iniciar(async () => {
                const r = await projetarOrcamento({
                  origem,
                  linhas: linhas.map((l) => ({ id: l.id, repeticao: escolhas[l.id].repeticao, meses: escolhas[l.id].meses, n: escolhas[l.id].n, valor: escolhas[l.id].valor })),
                });
                setRes(r);
                if (!r.erro) router.refresh();
              })
            }
          >
            {pendente ? "Projetando…" : "Projetar orçamento"}
          </Botao>
        </div>
      </Cartao>
    </div>
  );
}

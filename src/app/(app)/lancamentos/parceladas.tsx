"use client";

import { useState, useTransition } from "react";
import { CreditCard } from "lucide-react";
import { Botao, Cartao } from "@/components/ui";
import { Dialogo } from "@/components/dialogo";
import { removerParcelasFuturas } from "@/app/actions/lancamentos";
import { formatBRL, formatMesCurto } from "@/lib/format";

export type Parcelada = {
  grupo: string;
  descricao: string;
  conta: string | null;
  parcelaDoMes: string | null;
  valorDoMes: number;
  restantes: number;
  valorRestante: number;
};

export function ComprasParceladas({ itens, mes }: { itens: Parcelada[]; mes: string }) {
  const [quitando, setQuitando] = useState<Parcelada | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const total = itens.reduce((s, i) => s + i.valorDoMes, 0);

  return (
    <Cartao className="p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <CreditCard className="size-4 text-brand" aria-hidden /> Compras parceladas do mês
        </h2>
        <p className="num text-sm">
          <span className="text-muted">Total em parcelas </span>
          <strong>{formatBRL(total)}</strong>
        </p>
      </div>
      {resultado && <p className="border-b border-border bg-positive-soft px-5 py-2 text-sm">{resultado}</p>}
      <ul className="divide-y divide-border">
        {itens.map((i) => (
          <li key={i.grupo} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{i.descricao}</p>
              <p className="text-xs text-muted">
                Parcela {i.parcelaDoMes}
                {i.conta ? ` · ${i.conta}` : ""}
                {i.restantes > 0
                  ? ` · faltam ${i.restantes} prevista${i.restantes > 1 ? "s" : ""} (${formatBRL(i.valorRestante)})`
                  : " · última parcela"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="num font-semibold">{formatBRL(i.valorDoMes)}</span>
              {i.restantes > 0 && (
                <button type="button" onClick={() => setQuitando(i)} className="rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand/10">
                  Quitou ou antecipou?
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Dialogo aberto={quitando !== null} aoFechar={() => setQuitando(null)} titulo="Quitou ou antecipou?" largura="max-w-sm">
        {quitando && (
          <>
            <p className="text-sm">
              Remover do previsto as {quitando.restantes} parcela(s) de <strong>{quitando.descricao}</strong> depois de{" "}
              {formatMesCurto(mes)}, somando {formatBRL(quitando.valorRestante)}? Parcelas que já chegaram não são afetadas.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Botao variante="secundario" onClick={() => setQuitando(null)}>
                Cancelar
              </Botao>
              <Botao
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await removerParcelasFuturas(quitando.grupo, mes);
                    setQuitando(null);
                    setResultado(r.erro ?? `${r.removidas} parcela(s) futura(s) removida(s) do previsto.`);
                  })
                }
              >
                {pendente ? "Removendo…" : "Remover parcelas futuras"}
              </Botao>
            </div>
          </>
        )}
      </Dialogo>
    </Cartao>
  );
}

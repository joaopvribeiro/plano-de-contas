"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL, formatMesCurto } from "@/lib/format";
import type { PontoEvolucao } from "@/lib/patrimonio";

const SERIES = [
  { chave: "patrimonioLiquido", cor: "var(--serie-1)", rotulo: "Patrimônio líquido" },
  { chave: "carteira", cor: "var(--serie-2)", rotulo: "Carteira investida" },
] as const;

function compacto(v: number) {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("pt-BR");
}

function Dica({ active, payload }: { active?: boolean; payload?: { payload: PontoEvolucao }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{formatMesCurto(p.mes)}</p>
      {SERIES.map((s) => (
        <p key={s.chave} className="num flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: s.cor }} aria-hidden />
          {s.rotulo}: {formatBRL(p[s.chave])}
        </p>
      ))}
    </div>
  );
}

export function GraficoEvolucao({ pontos }: { pontos: PontoEvolucao[] }) {
  const ultimo = pontos[pontos.length - 1];
  return (
    <figure>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
        {SERIES.map((s) => (
          <li key={s.chave} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: s.cor }} aria-hidden />
            {s.rotulo}
          </li>
        ))}
      </ul>
      <div className="h-64" role="img" aria-label={`Evolução do patrimônio: ${formatBRL(ultimo.patrimonioLiquido)} de patrimônio líquido em ${formatMesCurto(ultimo.mes)}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pontos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grade)" vertical={false} />
            <XAxis dataKey="mes" tickFormatter={formatMesCurto} tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={compacto} tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={56} />
            <Tooltip content={<Dica />} cursor={{ stroke: "var(--border)" }} />
            {SERIES.map((s) => (
              <Line key={s.chave} dataKey={s.chave} stroke={s.cor} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "var(--surface)" }} activeDot={{ r: 5 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted">Ver em tabela</summary>
        <table className="num mt-2 w-full text-left">
          <thead>
            <tr className="text-muted">
              <th className="py-1 font-medium">Mês</th>
              <th className="py-1 text-right font-medium">Carteira</th>
              <th className="py-1 text-right font-medium">Patrimônio líquido</th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((p) => (
              <tr key={p.mes} className="border-t border-border">
                <td className="py-1">{formatMesCurto(p.mes)}</td>
                <td className="py-1 text-right">{formatBRL(p.carteira)}</td>
                <td className="py-1 text-right">{formatBRL(p.patrimonioLiquido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

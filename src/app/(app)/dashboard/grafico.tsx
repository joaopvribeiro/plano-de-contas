"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL, formatMesCurto } from "@/lib/format";

export type PontoGrafico = {
  mes: string;
  receitas: number;
  despesas: number;
  caixaPrevisto: number;
  caixaRealizado: number | null;
  realizado: boolean;
};

const SERIES = {
  receitas: { cor: "var(--serie-1)", rotulo: "Receitas previstas" },
  despesas: { cor: "var(--serie-2)", rotulo: "Despesas previstas" },
  caixaPrevisto: { cor: "var(--serie-3)", rotulo: "Caixa acumulado previsto" },
  caixaRealizado: { cor: "var(--serie-3)", rotulo: "Caixa acumulado realizado" },
} as const;

/** R$ 23,5 mil · R$ 1,2 mi */
function compacto(v: number) {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("pt-BR");
}

function Legenda() {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm" style={{ background: SERIES.receitas.cor }} aria-hidden />
        {SERIES.receitas.rotulo}
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm" style={{ background: SERIES.despesas.cor }} aria-hidden />
        {SERIES.despesas.rotulo}
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="18" height="6" aria-hidden>
          <line x1="0" y1="3" x2="18" y2="3" stroke={SERIES.caixaPrevisto.cor} strokeWidth="2" strokeDasharray="4 3" />
        </svg>
        {SERIES.caixaPrevisto.rotulo}
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="18" height="6" aria-hidden>
          <line x1="0" y1="3" x2="18" y2="3" stroke={SERIES.caixaRealizado.cor} strokeWidth="2" />
        </svg>
        {SERIES.caixaRealizado.rotulo}
      </li>
    </ul>
  );
}

function Dica({ active, payload }: { active?: boolean; payload?: { payload: PontoGrafico }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const linhas: [string, number | null, string, boolean?][] = [
    [SERIES.receitas.rotulo, p.receitas, SERIES.receitas.cor],
    [SERIES.despesas.rotulo, p.despesas, SERIES.despesas.cor],
    [SERIES.caixaPrevisto.rotulo, p.caixaPrevisto, SERIES.caixaPrevisto.cor, true],
    [SERIES.caixaRealizado.rotulo, p.caixaRealizado, SERIES.caixaRealizado.cor],
  ];
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">
        {formatMesCurto(p.mes)} {p.realizado ? "" : <span className="font-normal text-muted">· sem realizado</span>}
      </p>
      {linhas
        .filter(([, v]) => v !== null)
        .map(([rotulo, v, cor, tracejado]) => (
          <p key={rotulo} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span
                className="inline-block h-0.5 w-3"
                style={{ background: tracejado ? `repeating-linear-gradient(90deg, ${cor} 0 3px, transparent 3px 5px)` : cor }}
                aria-hidden
              />
              {rotulo}
            </span>
            <span className="num font-semibold">{formatBRL(v)}</span>
          </p>
        ))}
    </div>
  );
}

export function GraficoFluxo({ pontos, mesSelecionado }: { pontos: PontoGrafico[]; mesSelecionado: string }) {
  return (
    <figure>
      <Legenda />
      <div className="h-72 w-full" role="img" aria-label="Gráfico de receitas e despesas previstas por mês, com o caixa acumulado previsto e realizado. Os valores estão na matriz DFC abaixo.">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={pontos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--grade)" />
            <XAxis
              dataKey="mes"
              tickFormatter={formatMesCurto}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={compacto}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip content={<Dica />} cursor={{ fill: "var(--surface-2)", opacity: 0.6 }} />
            <Bar dataKey="receitas" fill={SERIES.receitas.cor} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="despesas" fill={SERIES.despesas.cor} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Line
              dataKey="caixaPrevisto"
              stroke={SERIES.caixaPrevisto.cor}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              dataKey="caixaRealizado"
              stroke={SERIES.caixaRealizado.cor}
              strokeWidth={2}
              dot={(props: { cx?: number; cy?: number; payload?: PontoGrafico; index?: number }) =>
                props.payload?.mes === mesSelecionado && props.payload.caixaRealizado !== null ? (
                  <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill={SERIES.caixaRealizado.cor} stroke="var(--surface)" strokeWidth={2} />
                ) : (
                  <g key={props.index} />
                )
              }
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

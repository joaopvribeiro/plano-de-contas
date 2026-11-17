"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CircleCheck, Lightbulb, LoaderCircle, Sparkles } from "lucide-react";
import { Aviso, Botao, Cartao, cn } from "@/components/ui";
import { gerarInsights } from "@/app/actions/insights";
import type { Observacao } from "@/lib/insights";

const ICONE = { alerta: AlertTriangle, positivo: CircleCheck, dica: Lightbulb } as const;
const COR = { alerta: "text-warning", positivo: "text-positive", dica: "text-brand" } as const;
const ROTULO = { alerta: "Atenção", positivo: "Bom sinal", dica: "Dica" } as const;

export function InsightsDoMes({
  mes,
  rotuloMes,
  observacoes,
  geradoEm,
  ia,
  temRealizado,
}: {
  mes: string;
  rotuloMes: string;
  observacoes: Observacao[] | null;
  geradoEm: string | null;
  ia: { liberada: boolean; consentimento: boolean; restantes: number; limite: number };
  temRealizado: boolean;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const podeGerar = ia.liberada && ia.restantes > 0 && temRealizado;

  return (
    <Cartao role="region" className="mt-6 flex flex-col gap-4 p-5" aria-labelledby="titulo-insights">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-insights" className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="size-5 text-brand" aria-hidden /> O que os gastos estão dizendo
          </h2>
          <p className="text-xs text-muted">
            Análise da IA de {rotuloMes}, feita com os totais do mês (sem nomes de pessoas).
            {geradoEm && ` Gerada em ${geradoEm}.`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Botao
            variante={observacoes ? "secundario" : "primario"}
            disabled={pendente || !podeGerar}
            onClick={() =>
              iniciar(async () => {
                setErro(null);
                const r = await gerarInsights(mes);
                if (r.erro) setErro(r.erro);
                else router.refresh();
              })
            }
          >
            {pendente ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {pendente ? "Analisando…" : observacoes ? "Gerar de novo" : "Gerar análise"}
          </Botao>
          {ia.liberada && (
            <span className="text-xs text-muted">
              {ia.restantes} de {ia.limite} análises restantes neste mês
            </span>
          )}
        </div>
      </div>
      {!ia.consentimento && <Aviso tom="info">Para usar a análise, autorize a IA em Lançamentos → Importar extrato.</Aviso>}
      {ia.consentimento && !temRealizado && <p className="text-sm text-muted">A análise fica disponível quando o mês tiver lançamentos realizados.</p>}
      {erro && <Aviso tom="negativo">{erro}</Aviso>}
      {observacoes ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {observacoes.map((o, i) => {
            const Icone = ICONE[o.tipo];
            return (
              <li key={i} className="flex gap-3 rounded-lg border border-border p-3">
                <Icone className={cn("mt-0.5 size-5 shrink-0", COR[o.tipo])} aria-hidden />
                <div>
                  <p className="text-sm font-semibold">
                    <span className="sr-only">{ROTULO[o.tipo]}: </span>
                    {o.titulo}
                  </p>
                  <p className="text-sm text-muted">{o.texto}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        temRealizado && ia.liberada && <p className="text-sm text-muted">Nenhuma análise ainda para este mês.</p>
      )}
    </Cartao>
  );
}

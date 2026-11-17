import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Cartao, cn } from "@/components/ui";
import { TituloPagina } from "@/components/em-construcao";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { situacaoIA } from "@/lib/importacao/consultas";
import { ROTULO_TIPO, TIPOS_APOLICE, resumoProtecoes, type Apolice } from "@/lib/apolices/modelo";
import { formatBRL, formatData, hojeISO } from "@/lib/format";
import { CardApolice, EnviarApolice } from "./gestao";
import { ConsentimentoIA } from "@/app/(app)/lancamentos/importar/consentimento";

export const metadata = { title: "Proteções · Resolutto Family" };
export const maxDuration = 300;

function Indicador({ rotulo, children, detalhe, alerta }: { rotulo: string; children: React.ReactNode; detalhe?: React.ReactNode; alerta?: boolean }) {
  return (
    <Cartao className={cn("p-4", alerta && "border-warning/50")}>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{rotulo}</p>
      <div className={cn("num mt-1 font-[family-name:var(--font-display)] text-lg font-bold sm:text-2xl", alerta && "text-warning")}>{children}</div>
      {detalhe && <div className="mt-1 text-xs text-muted">{detalhe}</div>}
    </Cartao>
  );
}

export default async function PaginaProtecoes() {
  const { familia } = await obterFamiliaAtiva();
  const supabase = await criarClienteServidor();
  const [{ data }, { data: leituras }, ia] = await Promise.all([
    supabase
      .from("apolices")
      .select("id, tipo, seguradora, produto, segurado, premio, periodicidade, premio_mensal, vigencia_inicio, vigencia_fim, destaques, carencias, exclusoes, como_acionar, resumo, origem, arquivo")
      .eq("familia_id", familia.id)
      .order("vigencia_inicio", { ascending: false, nullsFirst: false }),
    supabase
      .from("importacoes")
      .select("id, status, nomes_arquivos, resposta_ia")
      .eq("familia_id", familia.id)
      .eq("tipo", "apolice")
      .in("status", ["lendo", "revisao"])
      .order("criado_em", { ascending: false }),
    situacaoIA(familia.id, "apolice"),
  ]);
  const apolices = (data ?? []).map((a) => ({
    ...a,
    premio: a.premio === null ? null : Number(a.premio),
    premio_mensal: a.premio_mensal === null ? null : Number(a.premio_mensal),
    destaques: (a.destaques ?? {}) as Record<string, string>,
  })) as Apolice[];
  const hoje = hojeISO();
  const r = resumoProtecoes(apolices, hoje);

  return (
    <>
      <TituloPagina titulo="Proteções" subtitulo={familia.nome} />

      <section aria-label="Resumo das proteções" className="mb-5 grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Prêmios mensais" detalhe={`${r.ativasNoOrcamento} ${r.ativasNoOrcamento === 1 ? "proteção ativa" : "proteções ativas"} no orçamento`}>
          {formatBRL(r.premiosMensais)}
        </Indicador>
        <Indicador rotulo="Apólices lidas pela IA" alerta={r.total > 0 && r.lidasPelaIA < r.total} detalhe={r.lidasPelaIA < r.total ? "Envie o PDF das que faltam para ter carências e exclusões" : "Todas com leitura completa"}>
          {r.lidasPelaIA} de {r.total}
        </Indicador>
        <Indicador rotulo="Renovações em 60 dias" alerta={r.renovacoes.length > 0}>
          {r.renovacoes.length === 0 ? (
            <span className="text-base font-medium text-muted">Nenhuma</span>
          ) : (
            <ul className="text-sm font-medium">
              {r.renovacoes.map((x) => (
                <li key={x.id} className="flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                  {x.seguradora} · {formatData(x.vigencia_fim)}
                </li>
              ))}
            </ul>
          )}
        </Indicador>
      </section>

      {(leituras ?? []).length > 0 && (
        <Cartao className="mb-5 flex flex-col gap-2 p-4">
          <h2 className="text-sm font-semibold">Leituras em andamento</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {(leituras ?? []).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate">{l.nomes_arquivos.join(", ")}</span>
                <Link href={`/protecoes/importar/${l.id}`} className="font-semibold text-brand hover:underline">
                  {l.status === "revisao" ? "Revisar e salvar" : "Ver leitura"}
                </Link>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <div className="mb-6 flex flex-col gap-5">
        {TIPOS_APOLICE.map((t) => {
          const doTipo = apolices.filter((a) => a.tipo === t);
          return (
            <section key={t} aria-labelledby={`tipo-${t}`} className="flex flex-col gap-2">
              <h2 id={`tipo-${t}`} className="text-base font-semibold">
                {ROTULO_TIPO[t]}
              </h2>
              {doTipo.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">Nenhuma apólice cadastrada. Envie o PDF abaixo.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {doTipo.map((a) => (
                    <CardApolice key={a.id} a={a} consultor={familia.consultor} hoje={hoje} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {!ia.consentimento && (
        <div className="mb-4">
          <ConsentimentoIA consultor={familia.consultor && familia.papel === "consultor"} />
        </div>
      )}
      <EnviarApolice ia={{ liberada: ia.consentimento && ia.disponivel, consentimento: ia.consentimento, configurada: ia.disponivel, restantes: ia.restantes, limite: ia.limite }} />
    </>
  );
}

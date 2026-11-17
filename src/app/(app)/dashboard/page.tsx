import Link from "next/link";
import { AlertTriangle, CircleCheck, FileUp, Info } from "lucide-react";
import { Aviso, Cartao, Selo, cn } from "@/components/ui";
import { TituloPagina } from "@/components/em-construcao";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { carregarDashboard } from "@/lib/dashboard/consultas";
import { distribuicao, mesesCobertos, metaDaReserva, type StatusMeta } from "@/lib/dfc";
import { formatBRL, formatDataHora, formatMesCurto, formatMesLongo, mesAtual, mesPadraoNoHorizonte, somarMeses } from "@/lib/format";
import { GraficoFluxo } from "./grafico";
import { InsightsDoMes } from "./insights";
import { criarClienteServidor } from "@/lib/supabase/server";
import { situacaoIA } from "@/lib/importacao/consultas";
import { lerInsightGuardado } from "@/lib/insights";
import { MatrizDFC } from "./matriz";
import { SeletorMes } from "./seletor-mes";

export const metadata = { title: "Dashboard & DFC · Resolutto Family" };

const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

function Indicador({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe?: React.ReactNode; tom?: string }) {
  return (
    <Cartao className="p-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{rotulo}</p>
      <p className={cn("num mt-1 font-[family-name:var(--font-display)] text-lg font-bold whitespace-nowrap sm:text-2xl", tom)}>{valor}</p>
      {detalhe && <div className="num mt-1 text-xs text-muted">{detalhe}</div>}
    </Cartao>
  );
}

const STATUS: Record<StatusMeta, { rotulo: string; cor: string; barra: string; Icone?: typeof AlertTriangle }> = {
  ok: { rotulo: "Dentro da meta", cor: "text-positive", barra: "bg-positive", Icone: CircleCheck },
  atencao: { rotulo: "Até 5 pontos acima", cor: "text-warning", barra: "bg-warning", Icone: AlertTriangle },
  acima: { rotulo: "Acima da meta", cor: "text-negative", barra: "bg-negative", Icone: AlertTriangle },
  "sem-meta": { rotulo: "Sem meta", cor: "text-muted", barra: "bg-serie-1" },
};

export default async function PaginaDashboard({ searchParams }: PageProps<"/dashboard">) {
  const { familia } = await obterFamiliaAtiva();
  const supabase = await criarClienteServidor();
  const [d, ia] = await Promise.all([carregarDashboard(familia.id), situacaoIA(familia.id, "insight")]);
  const sp = await searchParams;

  const atual = mesAtual();
  const pedido = typeof sp.mes === "string" ? sp.mes : undefined;
  const mes = pedido && d.meses.includes(pedido) ? pedido : mesPadraoNoHorizonte(d.meses, atual);
  const col = d.dfc.meses.find((m) => m.mes === mes)!;
  const { data: insight } = await supabase
    .from("insights")
    .select("texto, gerado_em")
    .eq("familia_id", familia.id)
    .eq("mes", mes)
    .order("gerado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  const fim = d.meses[d.meses.length - 1];

  // Aviso de horizonte: faltam 2 meses ou menos, ou já acabou.
  const horizonteAcabando = fim <= somarMeses(atual, 2);
  const horizonteAcabou = fim < atual;

  const r = col.realizado;
  const p = col.previsto;
  const pctReceita = r && p.receitas > 0 ? (r.receitas / p.receitas) * 100 : null;
  const pctDespesa = r && p.despesas > 0 ? (r.despesas / p.despesas) * 100 : null;

  const meta = metaDaReserva(d.dfc, d.reservaMeses);
  const cobertos = mesesCobertos(d.saldoReserva, d.dfc);
  const pctReserva = meta > 0 ? Math.min(100, (d.saldoReserva / meta) * 100) : null;

  // Distribuição: realizado quando o mês tem; senão, previsto.
  const baseDistribuicao = r ?? p;
  const itens = distribuicao(baseDistribuicao, d.metas);

  const pontos = d.dfc.meses.map((m) => ({
    mes: m.mes,
    receitas: m.previsto.receitas,
    despesas: m.previsto.despesas,
    caixaPrevisto: m.caixa.previsto,
    caixaRealizado: m.caixa.realizado,
    realizado: m.temRealizado,
  }));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TituloPagina titulo="Dashboard & DFC" subtitulo={familia.nome} />
        <SeletorMes meses={d.meses} atual={mes} />
      </div>

      {(horizonteAcabando || horizonteAcabou) && (
        <Aviso tom="atencao" className="mb-5 flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            {horizonteAcabou
              ? `O horizonte do planejamento terminou em ${formatMesLongo(fim)}.`
              : `O horizonte do planejamento termina em ${formatMesLongo(fim)}.`}{" "}
            {familia.consultor ? (
              <Link href={`/consultor/familias/${familia.id}`} className="font-semibold underline">
                Estender o horizonte
              </Link>
            ) : (
              "Fale com seu consultor para estender o planejamento."
            )}
          </span>
        </Aviso>
      )}

      {d.vazio && (
        <Aviso tom="info" className="mb-5 flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <span>
            Ainda não há lançamentos no horizonte ({formatMesCurto(d.meses[0])} a {formatMesCurto(fim)}).{" "}
            {familia.consultor ? (
              <Link href="/lancamentos/importar-previsto" className="inline-flex items-center gap-1 font-semibold underline">
                <FileUp className="size-3.5" aria-hidden /> Importar o orçamento previsto
              </Link>
            ) : (
              "Seu consultor vai montar o orçamento previsto."
            )}
          </span>
        </Aviso>
      )}

      <section aria-label={`Resumo de ${formatMesLongo(mes)}`} className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Receitas"
          valor={formatBRL(r ? r.receitas : p.receitas)}
          tom={r ? undefined : "text-muted"}
          detalhe={
            r ? (
              <>
                Previsto {formatBRL(p.receitas)} · <strong className="text-text">{pct(pctReceita)} atingido</strong>
              </>
            ) : (
              "Previsto · sem realizado no mês"
            )
          }
        />
        <Indicador
          rotulo="Despesas"
          valor={formatBRL(r ? r.despesas : p.despesas)}
          tom={r ? (pctDespesa !== null && pctDespesa > 100 ? "text-negative" : undefined) : "text-muted"}
          detalhe={
            r ? (
              <>
                Previsto {formatBRL(p.despesas)} ·{" "}
                <strong className={cn(pctDespesa !== null && pctDespesa > 100 ? "text-negative" : "text-text")}>
                  {pct(pctDespesa)} do previsto
                </strong>
              </>
            ) : (
              "Previsto · sem realizado no mês"
            )
          }
        />
        <Indicador
          rotulo="Saldo após investimentos"
          valor={formatBRL(r ? r.saldoAposInvestimentos : p.saldoAposInvestimentos)}
          tom={(r ?? p).saldoAposInvestimentos < 0 ? "text-negative" : r ? undefined : "text-muted"}
          detalhe={
            <>
              {r ? <>Previsto {formatBRL(p.saldoAposInvestimentos)}</> : "Previsto"}
              <span className="block">
                Caixa acumulado {formatBRL(col.caixa.realizado ?? col.caixa.previsto)}
                {col.caixa.realizado !== null && <> · previsto {formatBRL(col.caixa.previsto)}</>}
              </span>
            </>
          }
        />
        <Indicador
          rotulo="Reserva de emergência"
          valor={formatBRL(d.saldoReserva)}
          detalhe={
            meta > 0 ? (
              <>
                <span className="mb-1 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <span className="block h-full rounded-full bg-serie-1" style={{ width: `${pctReserva}%` }} />
                </span>
                Meta {formatBRL(meta)} ({d.reservaMeses} meses de despesa básica)
                {cobertos !== null && <> · cobre {cobertos.toLocaleString("pt-BR")} meses</>}
              </>
            ) : (
              "Sem despesa básica prevista para calcular a meta"
            )
          }
        />
      </section>
      <p className="-mt-4 mb-6 flex items-center gap-2 text-xs text-muted">
        {col.temRealizado ? <Selo tom="positivo">Mês com realizado</Selo> : <Selo tom="info">Mês sem realizado</Selo>}
        {formatMesLongo(mes)}
      </p>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Cartao>
          <h2 className="mb-3 font-semibold">Entradas, saídas e caixa acumulado</h2>
          <GraficoFluxo pontos={pontos} mesSelecionado={mes} />
        </Cartao>

        <Cartao>
          <h2 className="font-semibold">Despesas sobre a receita</h2>
          <p className="mb-4 text-xs text-muted">
            {formatMesLongo(mes)} · {r ? "realizado" : "previsto"} · receita {formatBRL(baseDistribuicao.receitas)}
          </p>
          <ul className="flex flex-col gap-4">
            {itens.map((i) => {
              const st = STATUS[i.status];
              const largura = i.percentual === null ? 0 : Math.min(100, i.percentual);
              return (
                <li key={i.classe}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{i.classe}</span>
                    <span className="num">
                      <strong>{pct(i.percentual)}</strong>
                      {i.meta !== null && <span className="text-muted"> / meta {pct(i.meta)}</span>}
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-surface-2" aria-hidden>
                    <div className={cn("h-full rounded-full", st.barra)} style={{ width: `${largura}%` }} />
                    {i.meta !== null && (
                      <div className="absolute -top-1 h-4 w-0.5 rounded bg-text" style={{ left: `${Math.min(100, i.meta)}%` }} />
                    )}
                  </div>
                  <p className={cn("mt-1 flex items-center gap-1 text-xs", st.cor)}>
                    {st.Icone && <st.Icone className="size-3.5" aria-hidden />}
                    <span>{st.rotulo}</span>
                    <span className="num ml-auto text-muted">{formatBRL(i.valor)}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </Cartao>
      </div>

      <section aria-labelledby="titulo-dfc">
        <h2 id="titulo-dfc" className="mb-3 text-lg font-semibold">
          Demonstração de fluxo de caixa
        </h2>
        <MatrizDFC dfc={d.dfc} mesSelecionado={mes} nomeFamilia={familia.nome} />
      </section>

      <InsightsDoMes
        mes={mes}
        rotuloMes={formatMesLongo(mes)}
        observacoes={insight ? lerInsightGuardado(insight.texto).observacoes : null}
        geradoEm={insight ? formatDataHora(insight.gerado_em) : null}
        ia={{ liberada: ia.consentimento && ia.disponivel, consentimento: ia.consentimento, restantes: ia.restantes, limite: ia.limite }}
        temRealizado={Boolean(r)}
      />
    </>
  );
}

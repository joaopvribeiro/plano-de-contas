import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Cartao, Selo, cn } from "@/components/ui";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { carregarGastos } from "@/lib/gastos-consultas";
import { resumirGastos, type Filtro } from "@/lib/gastos";
import { formatBRL, formatData, formatMesCurto, formatMesLongo, mesAtual, somarMeses } from "@/lib/format";

export const metadata = { title: "Resumo de gastos · Resolutto Family" };

const inicialMaiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const STATUS = {
  ok: { rotulo: "dentro da meta", tom: "positivo" },
  atencao: { rotulo: "no limite", tom: "atencao" },
  acima: { rotulo: "acima da meta", tom: "negativo" },
  "sem-meta": null,
} as const;

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: React.ReactNode; detalhe?: React.ReactNode }) {
  return (
    <Cartao className="p-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{rotulo}</p>
      <div className="num mt-1 font-[family-name:var(--font-display)] text-lg font-bold sm:text-2xl">{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-muted">{detalhe}</div>}
    </Cartao>
  );
}

export default async function PaginaGastos({ searchParams }: PageProps<"/lancamentos/gastos">) {
  const { familia } = await obterFamiliaAtiva();
  const sp = await searchParams;
  const pedido = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : null;

  // Sem mês pedido: o último mês com gastos realizados até hoje.
  const previa = await carregarGastos(familia.id, pedido ?? mesAtual());
  const mes = pedido ?? previa.mesesComRealizado.filter((m) => m <= mesAtual()).at(-1) ?? mesAtual();
  const d = mes === (pedido ?? mesAtual()) ? previa : await carregarGastos(familia.id, mes);

  const contaIds = new Set(d.contas.map((c) => c.id));
  const filtroPedido = typeof sp.conta === "string" ? sp.conta : "todas";
  const filtro: Filtro = ["todas", "cartoes", "contas"].includes(filtroPedido) || contaIds.has(filtroPedido) ? filtroPedido : "todas";
  const r = resumirGastos({ mes, lancamentos: d.lancamentos, parcelasFuturas: d.parcelasFuturas, contas: d.contas, categorias: d.categorias, metas: d.metas, filtro });
  const contaFiltrada = d.contas.find((c) => c.id === filtro);
  const url = (m: string, f: string) => `/lancamentos/gastos?mes=${m}${f !== "todas" ? `&conta=${f}` : ""}`;
  const maxCategoria = Math.max(...r.porCategoria.map((c) => Math.max(c.valor, c.previsto)), 1);

  const filtros: { id: string; rotulo: string }[] = [
    { id: "todas", rotulo: "Todas as contas" },
    { id: "cartoes", rotulo: "Só cartões" },
    { id: "contas", rotulo: "Só contas correntes" },
    ...d.contas.map((c) => ({ id: c.id, rotulo: c.nome })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Resumo de gastos</h2>
          <p className="text-sm text-muted">Tudo o que saiu no mês, nas faturas e nas contas. Pagamento de fatura e aplicações não contam como gasto.</p>
        </div>
        <nav aria-label="Mês" className="flex items-center gap-1">
          <Link href={url(somarMeses(mes, -1), filtro)} className="rounded-lg p-2 hover:bg-surface-2" aria-label="Mês anterior">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <span className="min-w-36 text-center text-sm font-semibold">{inicialMaiuscula(formatMesLongo(mes))}</span>
          <Link href={url(somarMeses(mes, 1), filtro)} className="rounded-lg p-2 hover:bg-surface-2" aria-label="Próximo mês">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </nav>
      </div>

      <nav aria-label="Filtrar por conta" className="flex flex-wrap gap-1.5">
        {filtros.map((f) => (
          <Link
            key={f.id}
            href={url(mes, f.id)}
            aria-current={filtro === f.id ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-sm",
              filtro === f.id ? "bg-brand font-semibold text-brand-contrast" : "border border-border hover:bg-surface-2",
            )}
          >
            {f.rotulo}
          </Link>
        ))}
      </nav>

      <section aria-label="Resumo do mês" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo={contaFiltrada?.tipo === "cartao_credito" ? "Total da fatura" : "Gastos do mês"} valor={formatBRL(r.total)} detalhe={`${r.quantidade} lançamento${r.quantidade === 1 ? "" : "s"}`} />
        <Indicador
          rotulo="Maior categoria"
          valor={<span className="text-base sm:text-xl">{r.maiorCategoria?.nome ?? "—"}</span>}
          detalhe={r.maiorCategoria ? `${formatBRL(r.maiorCategoria.valor)} · ${pct(r.maiorCategoria.percentual)} do total` : undefined}
        />
        <Indicador rotulo="Estornos" valor={formatBRL(r.totalEstornos)} detalhe={`${r.estornos.length} no mês, já descontados`} />
        <Indicador rotulo="Parcelas a vencer" valor={formatBRL(r.dividaFutura)} detalhe="Compras parceladas nos cartões, meses seguintes" />
      </section>

      {r.porConta.length > 0 && (
        <Cartao className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Por conta e cartão</h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {r.porConta.map((c) => (
              <li key={c.id} className={cn("flex items-center justify-between gap-2 rounded-lg border p-3", filtro === c.id ? "border-brand" : "border-border")}>
                <Link href={url(mes, c.id)} className="min-w-0 hover:underline">
                  <span className="block truncate text-sm font-medium">{c.nome}</span>
                  <span className="text-xs text-muted">{c.cartao ? "Fatura do mês" : "Gastos na conta"}</span>
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num text-sm font-semibold">{formatBRL(c.total)}</span>
                  {c.cartao && (
                    <Link href={`/relatorio/fatura?conta=${c.id}&mes=${mes}`} className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                      <FileText className="size-3.5" aria-hidden /> Relatório
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {r.porCategoria.length === 0 ? (
        <Cartao className="p-6 text-center text-sm text-muted">Nenhum gasto em {formatMesLongo(mes)} nesta seleção.</Cartao>
      ) : (
        <Cartao className="p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Gastos por categoria</h3>
            <p className="flex items-center gap-3 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-sm bg-serie-1" aria-hidden /> Realizado
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-0.5 bg-text" aria-hidden /> Previsto
              </span>
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {r.porCategoria.map((c) => (
              <li key={c.id} title={`${c.nome}: ${formatBRL(c.valor)} realizado, ${formatBRL(c.previsto)} previsto`}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="font-medium">{c.nome}</span>
                  <span className="num text-muted">
                    <strong className="text-text">{formatBRL(c.valor)}</strong> · {pct(c.percentual)}
                    {c.previsto > 0 && (
                      <>
                        {" "}
                        · previsto {formatBRL(c.previsto)}
                        {c.diferenca !== 0 && (
                          <span className={cn("ml-1 font-medium", c.diferenca > 0 ? "text-negative" : "text-positive")}>
                            ({c.diferenca > 0 ? "+" : "−"}
                            {formatBRL(Math.abs(c.diferenca))} {c.diferenca > 0 ? "acima" : "abaixo"})
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </div>
                <div className="relative h-2.5 rounded-full bg-surface-2" aria-hidden>
                  <div className="h-2.5 rounded-full bg-serie-1" style={{ width: `${(Math.max(c.valor, 0) / maxCategoria) * 100}%` }} />
                  {c.previsto > 0 && <div className="absolute -top-1 h-4.5 w-0.5 bg-text" style={{ left: `calc(${(c.previsto / maxCategoria) * 100}% - 1px)` }} />}
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Cartao className="p-4">
          <h3 className="mb-1 text-sm font-semibold">Por classe contra a meta</h3>
          <p className="mb-3 text-xs text-muted">
            Meta: percentual da receita do mês ({formatBRL(r.receita)}).
            {filtro !== "todas" && " Com filtro, mostra quanto desta seleção ocupa da meta do mês inteiro."}
          </p>
          <ul className="flex flex-col gap-3">
            {r.porClasse.map((c) => {
              const s = STATUS[c.status];
              const uso = c.metaValor ? c.valor / c.metaValor : null;
              return (
                <li key={c.classe}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      {c.classe}
                      {s && <Selo tom={s.tom}>{s.rotulo}</Selo>}
                    </span>
                    <span className="num text-muted">
                      <strong className="text-text">{formatBRL(c.valor)}</strong>
                      {c.metaValor !== null && ` de ${formatBRL(c.metaValor)} (meta ${c.metaPct}%)`}
                    </span>
                  </div>
                  {uso !== null && (
                    <div className="h-2 rounded-full bg-surface-2" aria-hidden>
                      <div className={cn("h-2 rounded-full", uso > 1 ? "bg-negative" : "bg-serie-1")} style={{ width: `${Math.min(uso, 1) * 100}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Cartao>

        <Cartao className="flex flex-col gap-4 p-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Parcelas em andamento</h3>
            {r.parcelas.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma compra parcelada neste mês.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {r.parcelas.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                    <span>
                      {p.descricao} <span className="text-xs text-muted">{p.parcela}{p.conta ? ` · ${p.conta}` : ""}</span>
                    </span>
                    <span className="num text-muted">
                      {formatBRL(p.valor)}/mês · faltam {p.restantes} ({formatBRL(p.aPagar)})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Estornos</h3>
            {r.estornos.length === 0 ? (
              <p className="text-sm text-muted">Nenhum estorno neste mês.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {r.estornos.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3 py-1.5">
                    <span>
                      {e.descricao} {e.data && <span className="text-xs text-muted">{formatData(e.data)}</span>}
                    </span>
                    <span className="num text-positive">+ {formatBRL(e.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {r.comprometimento.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Parcelas a vencer por mês</h3>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {r.comprometimento.map((c) => (
                  <li key={c.mes} className="num">
                    <span className="text-muted">{formatMesCurto(c.mes)}</span> {formatBRL(c.valor)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Cartao>
      </div>
    </div>
  );
}

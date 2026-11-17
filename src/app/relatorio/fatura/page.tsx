import { notFound } from "next/navigation";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { carregarGastos, consultorDaFamilia } from "@/lib/gastos-consultas";
import { resumirGastos } from "@/lib/gastos";
import { formatBRL, formatData, formatMesCurto, formatMesLongo, hojeISO } from "@/lib/format";
import { BarraRelatorio } from "./imprimir";

export const metadata = { title: "Relatório da fatura · Resolutto" };

// Cores da marca Resolutto, fixas (o relatório não segue o tema claro/escuro do app).
const NAVY = "#040D40";
const AZUL = "#1431D9";
const AZUL_MEDIO = "#0F26A6";
const CINZA = "#D9D9D9";

const inicialMaiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function Secao({ titulo, children, quebra }: { titulo: string; children: React.ReactNode; quebra?: boolean }) {
  return (
    <section className={quebra ? "break-before-page pt-2" : "pt-2"}>
      <h2 className="mb-3 border-b-2 pb-1 text-sm font-bold tracking-widest uppercase" style={{ color: NAVY, borderColor: AZUL }}>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export default async function RelatorioFatura({ searchParams }: PageProps<"/relatorio/fatura">) {
  const { familia } = await obterFamiliaAtiva();
  const sp = await searchParams;
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : null;
  const contaId = typeof sp.conta === "string" ? sp.conta : null;
  if (!mes || !contaId) notFound();

  const [d, consultor] = await Promise.all([carregarGastos(familia.id, mes), consultorDaFamilia(familia.id)]);
  const conta = d.contas.find((c) => c.id === contaId);
  if (!conta || conta.tipo !== "cartao_credito") notFound();
  const r = resumirGastos({ mes, lancamentos: d.lancamentos, parcelasFuturas: d.parcelasFuturas, contas: d.contas, categorias: d.categorias, metas: d.metas, filtro: contaId });
  const parcelasDoMes = r.parcelas.reduce((s, p) => s + p.valor, 0);
  const maior = Math.max(...r.porCategoria.map((c) => c.valor), 1);
  const categorias = r.porCategoria.filter((c) => c.valor !== 0);

  return (
    <div className="min-h-dvh bg-neutral-100 text-neutral-900 print:bg-white [color-scheme:light]">
      <BarraRelatorio voltar={`/lancamentos/gastos?mes=${mes}&conta=${contaId}`} />
      <style>{`@page { size: A4; margin: 12mm; } @media print { body { background: white; } }`}</style>
      <article className="mx-auto my-6 flex max-w-[210mm] flex-col gap-6 bg-white p-8 shadow-sm print:my-0 print:max-w-none print:p-0 print:shadow-none [print-color-adjust:exact]">
        <header className="-mx-8 -mt-8 px-8 py-6 text-center text-white print:mx-0 print:mt-0 print:rounded-lg" style={{ background: NAVY }}>
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-[0.3em]">RESOLUTTO</p>
          <p className="mt-1 text-sm font-semibold tracking-widest uppercase" style={{ color: CINZA }}>
            Relatório de fatura e consumo
          </p>
          <p className="mt-3 text-sm">
            Mês de referência: <strong>{inicialMaiuscula(formatMesLongo(mes))}</strong> · Cartão: <strong>{conta.nome}</strong>
          </p>
          <p className="text-sm">
            Família: <strong>{familia.nome}</strong>
            {consultor && (
              <>
                {" "}
                · Wealth Advisor: <strong>{consultor}</strong>
              </>
            )}
          </p>
        </header>

        <Secao titulo="Visão consolidada">
          <div className="grid grid-cols-3 gap-3">
            {[
              { rotulo: "Total da fatura", valor: formatBRL(r.total), detalhe: `${r.quantidade} lançamentos` },
              {
                rotulo: "Maior categoria",
                valor: r.maiorCategoria?.nome ?? "—",
                detalhe: r.maiorCategoria ? `${formatBRL(r.maiorCategoria.valor)} · ${pct(r.maiorCategoria.percentual)}` : "",
              },
              { rotulo: "Parcelas a vencer", valor: formatBRL(r.dividaFutura), detalhe: "Compromisso dos próximos meses" },
            ].map((t) => (
              <div key={t.rotulo} className="rounded-lg border p-3 text-center" style={{ borderColor: CINZA }}>
                <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: AZUL_MEDIO }}>
                  {t.rotulo}
                </p>
                <p className="mt-1 text-lg font-bold" style={{ color: NAVY }}>
                  {t.valor}
                </p>
                <p className="text-xs text-neutral-500">{t.detalhe}</p>
              </div>
            ))}
          </div>
          {r.totalEstornos > 0 && <p className="mt-2 text-xs text-neutral-600">Estornos do mês já descontados: {formatBRL(r.totalEstornos)}.</p>}
        </Secao>

        <Secao titulo="Onde o dinheiro saiu">
          <ul className="flex flex-col gap-2">
            {categorias.map((c) => (
              <li key={c.id} className="grid grid-cols-[10rem_1fr_7rem] items-center gap-3 text-xs">
                <span className="truncate font-medium">{c.nome}</span>
                <span className="h-3 rounded-sm" style={{ background: "#EEF0F7" }}>
                  <span className="block h-3 rounded-sm" style={{ width: `${(Math.max(c.valor, 0) / maior) * 100}%`, background: AZUL }} />
                </span>
                <span className="text-right tabular-nums">
                  {formatBRL(c.valor)} · {pct(c.percentual)}
                </span>
              </li>
            ))}
          </ul>
        </Secao>

        <Secao titulo="Resumo executivo de categorias">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-white" style={{ background: AZUL_MEDIO }}>
                <th className="px-2 py-1.5 font-semibold">Categoria</th>
                <th className="px-2 py-1.5 text-right font-semibold">Peso</th>
                <th className="px-2 py-1.5 text-right font-semibold">Total gasto</th>
                <th className="px-2 py-1.5 text-right font-semibold">Previsto</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 ? "#F6F7FB" : "white" }}>
                  <td className="px-2 py-1.5">{c.nome}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pct(c.percentual)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(c.valor)}</td>
                  <td className="px-2 py-1.5 text-right text-neutral-500 tabular-nums">{c.previsto ? formatBRL(c.previsto) : "—"}</td>
                </tr>
              ))}
              <tr className="font-bold" style={{ color: NAVY, borderTop: `2px solid ${NAVY}` }}>
                <td className="px-2 py-1.5" colSpan={2}>
                  Total geral da fatura
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(r.total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </Secao>

        <Secao titulo="Detalhamento por categoria" quebra>
          <div className="flex flex-col gap-4">
            {categorias.map((c) => (
              <div key={c.id} className="break-inside-avoid-page">
                <h3 className="mb-1 text-xs font-bold tracking-wider uppercase" style={{ color: AZUL_MEDIO }}>
                  {c.nome}
                </h3>
                <table className="w-full text-xs">
                  <tbody>
                    {c.lancamentos.map((l) => (
                      <tr key={l.id} className="border-b" style={{ borderColor: "#EEF0F7" }}>
                        <td className="w-14 py-1 text-neutral-500 tabular-nums">{l.data ? formatData(l.data).slice(0, 5) : ""}</td>
                        <td className="py-1">
                          {l.descricao}
                          {l.parcela && <span className="text-neutral-500"> · {l.parcela}</span>}
                          {l.estorno && <span className="text-neutral-500"> · estorno</span>}
                        </td>
                        <td className="py-1 text-right tabular-nums">{l.estorno ? `− ${formatBRL(l.valor)}` : formatBRL(l.valor)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold" style={{ color: NAVY }}>
                      <td />
                      <td className="py-1 text-right">Total da categoria</td>
                      <td className="py-1 text-right tabular-nums">{formatBRL(c.valor)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </Secao>

        <Secao titulo="Comprometimento futuro">
          <p className="mb-3 text-xs text-neutral-600">
            Parcelas de compras já feitas que vão vencer nas próximas faturas deste cartão, conforme as importações confirmadas.
          </p>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3 text-center" style={{ borderColor: CINZA }}>
              <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: AZUL_MEDIO }}>
                Consumo do mês
              </p>
              <p className="text-lg font-bold" style={{ color: NAVY }}>
                {formatBRL(r.total)}
              </p>
            </div>
            <div className="rounded-lg border p-3 text-center" style={{ borderColor: CINZA }}>
              <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: AZUL_MEDIO }}>
                Parcelas a vencer
              </p>
              <p className="text-lg font-bold" style={{ color: NAVY }}>
                {formatBRL(r.dividaFutura)}
              </p>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-white" style={{ background: AZUL_MEDIO }}>
                <th className="px-2 py-1.5 font-semibold">Mês</th>
                <th className="px-2 py-1.5 text-right font-semibold">Valor parcelado</th>
                <th className="px-2 py-1.5 text-right font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-1.5 capitalize">{formatMesCurto(mes)} (atual)</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(parcelasDoMes)}</td>
                <td className="px-2 py-1.5 text-right">Nesta fatura</td>
              </tr>
              {r.comprometimento.map((c, i) => (
                <tr key={c.mes} style={{ background: i % 2 ? "white" : "#F6F7FB" }}>
                  <td className="px-2 py-1.5 capitalize">{formatMesCurto(c.mes)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(c.valor)}</td>
                  <td className="px-2 py-1.5 text-right">Projetado</td>
                </tr>
              ))}
              <tr className="font-bold" style={{ color: NAVY, borderTop: `2px solid ${NAVY}` }}>
                <td className="px-2 py-1.5">Total a vencer</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(r.dividaFutura)}</td>
                <td />
              </tr>
            </tbody>
          </table>
          {r.parcelas.length > 0 && (
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="text-left" style={{ color: AZUL_MEDIO }}>
                  <th className="py-1 font-semibold">Compra parcelada</th>
                  <th className="py-1 text-right font-semibold">Parcela</th>
                  <th className="py-1 text-right font-semibold">Valor</th>
                  <th className="py-1 text-right font-semibold">Falta pagar</th>
                </tr>
              </thead>
              <tbody>
                {r.parcelas.map((p) => (
                  <tr key={p.id} className="border-b" style={{ borderColor: "#EEF0F7" }}>
                    <td className="py-1">{p.descricao}</td>
                    <td className="py-1 text-right">{p.parcela}</td>
                    <td className="py-1 text-right tabular-nums">{formatBRL(p.valor)}</td>
                    <td className="py-1 text-right tabular-nums">{formatBRL(p.aPagar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Secao>

        <footer className="mt-2 flex justify-between border-t pt-2 text-[10px] text-neutral-500" style={{ borderColor: CINZA }}>
          <span>Resolutto Wealth Management</span>
          <span>Gerado em {formatData(hojeISO())}</span>
        </footer>
      </article>
    </div>
  );
}

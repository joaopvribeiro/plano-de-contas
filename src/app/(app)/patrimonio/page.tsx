import Link from "next/link";
import { FileUp, Sheet } from "lucide-react";
import { Cartao, cn } from "@/components/ui";
import { TituloPagina } from "@/components/em-construcao";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { carregarPatrimonio } from "@/lib/patrimonio-consultas";
import { agrupar, distribuir, distribuirPorCategoria, porInstituicao, resumir, totalReserva } from "@/lib/patrimonio";
import { carregarDashboard } from "@/lib/dashboard/consultas";
import { metaDaReserva } from "@/lib/dfc";
import { formatBRL, hojeISO } from "@/lib/format";
import { GraficoEvolucao } from "./grafico";
import { Balanco, BotoesNovo } from "./gestao";

export const metadata = { title: "Patrimônio · Resolutto Family" };

function Indicador({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: number; detalhe?: React.ReactNode; destaque?: boolean }) {
  return (
    <Cartao className={cn("p-4", destaque && "border-brand/40")}>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{rotulo}</p>
      <p className={cn("num mt-1 font-[family-name:var(--font-display)] text-lg font-bold whitespace-nowrap sm:text-2xl", valor < 0 && "text-negative")}>
        {formatBRL(valor)}
      </p>
      {detalhe && <div className="num mt-1 text-xs text-muted">{detalhe}</div>}
    </Cartao>
  );
}

/** Barras horizontais de uma só cor (magnitude), com valor e percentual em texto. */
function Distribuicao({ titulo, fatias }: { titulo: string; fatias: { rotulo: string; valor: number; percentual: number }[] }) {
  return (
    <Cartao className="p-4">
      <h2 className="mb-3 text-sm font-semibold">{titulo}</h2>
      {fatias.length === 0 ? (
        <p className="text-sm text-muted">Sem ativos na carteira.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {fatias.map((f) => (
            <li key={f.rotulo} title={`${f.rotulo}: ${formatBRL(f.valor)}`}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{f.rotulo}</span>
                <span className="num shrink-0 text-muted">
                  {formatBRL(f.valor)} · {(f.percentual * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-2" aria-hidden>
                <div className="h-2 rounded-full bg-serie-1" style={{ width: `${Math.max(f.percentual * 100, 1)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

export default async function PaginaPatrimonio() {
  const { familia } = await obterFamiliaAtiva();
  const [d, dash] = await Promise.all([carregarPatrimonio(familia.id), carregarDashboard(familia.id)]);
  const reserva = { meta: metaDaReserva(dash.dfc, dash.reservaMeses), total: totalReserva(d.ativos) };
  const r = resumir(d.ativos, d.passivos);
  const grupos = agrupar(d.ativos);
  const hoje = hojeISO();

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <TituloPagina titulo="Patrimônio" subtitulo={familia.nome} />
        <div className="flex flex-wrap gap-2">
          <Link
            href="/patrimonio/importar"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-2"
          >
            <FileUp className="size-4" aria-hidden /> Importar relatório
          </Link>
          <Link
            href="/patrimonio/importar-planilha"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-2"
          >
            <Sheet className="size-4" aria-hidden /> Importar planilha
          </Link>
          <BotoesNovo reserva={reserva} />
        </div>
      </div>

      <section aria-label="Resumo do patrimônio" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Carteira investida"
          valor={r.carteira}
          detalhe={`${r.ativosCarteira} ativo${r.ativosCarteira === 1 ? "" : "s"} em ${r.instituicoesCarteira} instituiç${r.instituicoesCarteira === 1 ? "ão" : "ões"}`}
        />
        <Indicador
          rotulo="Patrimônio líquido"
          valor={r.patrimonioLiquido}
          destaque
          detalhe={
            <>
              Carteira + FGTS {formatBRL(r.fgts)} + bens {formatBRL(r.bens)}
              {r.empresas > 0 && <> + empresas {formatBRL(r.empresas)}</>}
              {r.dividas > 0 && <> − dívidas {formatBRL(r.dividas)}</>}
            </>
          }
        />
        <Indicador rotulo="Direitos futuros" valor={r.cartas} detalhe={r.cartas > 0 ? `Cartas de consórcio · direito líquido ${formatBRL(r.direitoLiquido)}` : "Sem consórcios"} />
        <Indicador rotulo="Patrimônio com direitos" valor={r.patrimonioComDireitos} detalhe="Patrimônio líquido + direito líquido dos consórcios" />
      </section>

      <section className="mb-5 grid gap-3 lg:grid-cols-2">
        <Distribuicao titulo="Carteira por categoria" fatias={distribuirPorCategoria(d.ativos)} />
        <Distribuicao titulo="Carteira por instituição" fatias={distribuir(d.ativos, porInstituicao)} />
      </section>

      <Cartao className="mb-5 p-4">
        <h2 className="mb-1 text-sm font-semibold">Evolução do patrimônio</h2>
        <p className="mb-3 text-xs text-muted">Saldo no fim de cada mês, pelo histórico de atualizações. Consórcios ficam de fora.</p>
        {d.evolucao.length < 2 ? (
          <p className="text-sm text-muted">A evolução aparece a partir de dois meses com saldos registrados.</p>
        ) : (
          <GraficoEvolucao pontos={d.evolucao} />
        )}
      </Cartao>

      <Balanco grupos={grupos} passivos={d.passivos} hoje={hoje} totalDividas={r.dividas} reserva={reserva} />
    </>
  );
}

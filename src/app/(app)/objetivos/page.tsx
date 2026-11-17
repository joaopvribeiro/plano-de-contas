import { Cartao, cn } from "@/components/ui";
import { TituloPagina } from "@/components/em-construcao";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { carregarObjetivos } from "@/lib/objetivos-consultas";
import { liberdade, reserva, situacaoProjeto } from "@/lib/objetivos";
import { consorcio } from "@/lib/patrimonio";
import { formatBRL, mesAtual } from "@/lib/format";
import { Barra } from "./barra";
import { BotaoConsorcio, BotaoPremissas, NovoProjeto, Projetos } from "./gestao";

export const metadata = { title: "Objetivos · Resolutto Family" };

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const taxa = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.m.`;


function Bloco({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <Cartao className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">{titulo}</h2>
        {acao}
      </div>
      {children}
    </Cartao>
  );
}

export default async function PaginaObjetivos() {
  const { familia } = await obterFamiliaAtiva();
  const d = await carregarObjetivos(familia.id);
  const p = d.premissas;

  const daLiberdade = d.ativos.filter((a) => a.conta_liberdade && a.valor > 0);
  const lib = liberdade(daLiberdade.reduce((s, a) => s + a.valor, 0), p.liberdade_meta, p.liberdade_retorno_real_am, p.liberdade_prazo_anos);
  const res = reserva(d.reserva.saldo, d.reserva.meta, d.reserva.despesaBasicaMensal);
  const consorcios = d.ativos.filter((a) => a.categoria === "Consórcio");
  const atual = mesAtual();
  const categoriasLib = [...new Set(daLiberdade.map((a) => a.categoria))];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <TituloPagina titulo="Objetivos" subtitulo={familia.nome} />
        {familia.consultor && <BotaoPremissas premissas={p} />}
      </div>

      <div className="mb-6 grid gap-3 lg:grid-cols-3">
        <Bloco titulo="Liberdade financeira">
          <div>
            <p className="num font-[family-name:var(--font-display)] text-2xl font-bold">{formatBRL(lib.saldo)}</p>
            <p className="num text-sm text-muted">{lib.meta ? `de ${formatBRL(lib.meta)} · ${pct(lib.percentual!)}` : "Meta ainda não definida"}</p>
          </div>
          {lib.meta && <Barra valor={lib.percentual!} rotulo="Liberdade financeira atingida" cheia={lib.percentual === 1} />}
          <dl className="num flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Saldo de hoje em {p.liberdade_prazo_anos} anos</dt>
              <dd className="font-medium">{formatBRL(lib.projetado)}</dd>
            </div>
            {lib.aporte !== null && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Aporte mensal necessário</dt>
                <dd className={cn("font-semibold", lib.atingeSemAporte && "text-positive")}>{lib.atingeSemAporte ? "Nenhum" : formatBRL(lib.aporte)}</dd>
              </div>
            )}
          </dl>
          <p className="text-xs text-muted">
            Premissas: retorno real de {taxa(p.liberdade_retorno_real_am)}, prazo de {p.liberdade_prazo_anos} anos, valores em reais de hoje.
            {categoriasLib.length > 0 && ` Conta: ${categoriasLib.join(", ")} (${daLiberdade.length} ativos).`}
            {!lib.meta && (familia.consultor ? " Defina a meta em “Premissas”." : " O consultor define a meta.")}
          </p>
        </Bloco>

        <Bloco titulo="Reserva de emergência">
          <div>
            <p className="num font-[family-name:var(--font-display)] text-2xl font-bold">{formatBRL(res.saldo)}</p>
            <p className="num text-sm text-muted">
              de {formatBRL(res.meta)}
              {res.percentual !== null && ` · ${pct(res.percentual)}`}
            </p>
          </div>
          {res.percentual !== null && <Barra valor={res.percentual} rotulo="Reserva de emergência atingida" cheia={res.percentual === 1} />}
          <dl className="num flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Cobre</dt>
              <dd className="font-medium">{res.cobreMeses === null ? "—" : `${res.cobreMeses.toLocaleString("pt-BR")} meses de despesa básica`}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Falta</dt>
              <dd className={cn("font-semibold", res.falta === 0 && "text-positive")}>{res.falta === 0 ? "Nada, meta atingida" : formatBRL(res.falta)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted">
            Meta: {p.reserva_meses} × a despesa básica prevista média ({formatBRL(d.reserva.despesaBasicaMensal)} por mês).
          </p>
        </Bloco>

        <Bloco titulo="Consórcios e imóvel">
          {consorcios.length === 0 ? (
            <p className="text-sm text-muted">Nenhum consórcio cadastrado. Cadastre em Patrimônio → Adicionar ativo.</p>
          ) : (
            <>
              <div>
                <p className="num font-[family-name:var(--font-display)] text-2xl font-bold">{formatBRL(consorcios.reduce((s, a) => s + a.valor, 0))}</p>
                <p className="num text-sm text-muted">
                  em cartas · parcelas de {formatBRL(consorcios.reduce((s, a) => s + (a.consorcio_parcela_mensal ?? 0), 0))} por mês
                </p>
              </div>
              <ul className="flex flex-col gap-3">
                {consorcios.map((a) => {
                  const c = consorcio(a);
                  return (
                    <li key={a.id} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium">{a.nome}</span>
                        <BotaoConsorcio ativo={a} />
                      </div>
                      <Barra valor={c.progresso} rotulo={`Parcelas pagas de ${a.nome}`} />
                      <p className="num text-xs text-muted">
                        {a.consorcio_parcelas_pagas ?? 0} de {a.consorcio_prazo_meses ?? "?"} parcelas · pago {formatBRL(c.pago)} · falta {formatBRL(c.aPagar)}
                        {a.consorcio_contemplado ? " · contemplado" : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Bloco>
      </div>

      <section aria-labelledby="projetos" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="projetos" className="text-lg font-semibold">
            Projetos
          </h2>
          <NovoProjeto ativos={d.ativos.filter((a) => a.categoria !== "Consórcio" && a.categoria !== "Bem").map((a) => ({ id: a.id, nome: a.nome }))} />
        </div>
        {d.projetos.length === 0 ? (
          <Cartao className="p-6 text-center text-sm text-muted">Nenhum projeto cadastrado.</Cartao>
        ) : (
          <Projetos
            projetos={d.projetos.map((pr) => ({ ...pr, situacao: situacaoProjeto(pr, atual) }))}
            ativos={d.ativos.filter((a) => a.categoria !== "Consórcio" && a.categoria !== "Bem").map((a) => ({ id: a.id, nome: a.nome }))}
            consultor={familia.consultor}
          />
        )}
      </section>
    </>
  );
}

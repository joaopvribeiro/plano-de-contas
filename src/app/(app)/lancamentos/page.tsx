import { Cartao, cn } from "@/components/ui";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { carregarCadastros, LIMITE_LISTA, listarLancamentos, parceladasDoMes } from "@/lib/lancamentos/consultas";
import { esquemaFiltros } from "@/lib/lancamentos/schema";
import { totaisDoFiltro } from "@/lib/lancamentos/regras-de-negocio";
import { formatBRL, hojeISO, mesAtual, mesPadraoNoHorizonte, mesesDoHorizonte } from "@/lib/format";
import { Filtros } from "./filtros";
import { ListaLancamentos } from "./lista";
import { ComprasParceladas } from "./parceladas";

export const metadata = { title: "Lançamentos · Resolutto Family" };

export default async function PaginaLancamentos({ searchParams }: PageProps<"/lancamentos">) {
  const { familia } = await obterFamiliaAtiva();
  const filtros = esquemaFiltros.parse(await searchParams);
  const cadastros = await carregarCadastros(familia.id);

  const meses = mesesDoHorizonte(cadastros.familia.inicio_planejamento, cadastros.familia.meses_horizonte);
  const atual = mesAtual();
  const mesPadrao = mesPadraoNoHorizonte(meses, atual);
  const listaDeMeses = meses.includes(atual) ? meses : [...meses, atual].sort();

  const { mes, lancamentos, cortado } = await listarLancamentos(familia.id, filtros, mesPadrao);
  // Previsto e realizado nunca se somam: o cartão mostra cada um separado.
  const totaisReal = totaisDoFiltro(lancamentos.filter((l) => l.tipo === "Realizado"));
  const totaisPrev = totaisDoFiltro(lancamentos.filter((l) => l.tipo === "Previsto"));
  const temReal = lancamentos.some((l) => l.tipo === "Realizado");
  const temPrev = lancamentos.some((l) => l.tipo === "Previsto");
  const principal = temReal ? totaisReal : totaisPrev;
  const secundario = temReal && temPrev ? totaisPrev : null;
  const transferencias = totaisReal.transferencias + totaisPrev.transferencias;
  const parceladas = mes !== "todos" ? await parceladasDoMes(familia.id, mes) : [];
  const nomeConta = new Map(cadastros.contas.map((c) => [c.id, c.nome]));

  const cartoes = [
    { rotulo: "Receitas", chave: "receitas", tom: "text-positive" },
    { rotulo: "Despesas", chave: "despesas", tom: "text-text" },
    { rotulo: "Saldo", chave: "saldo", tom: principal.saldo < 0 ? "text-negative" : "text-positive" },
    { rotulo: "Investimentos (líquido)", chave: "investimentos", tom: "text-text" },
  ] as const;
  const rotuloPrincipal = temReal ? "realizado" : "previsto";

  return (
    <div className="flex flex-col gap-5">
      <Filtros meses={listaDeMeses} mesAtivo={mes} contas={cadastros.contas} categorias={cadastros.categorias} />

      <section aria-label="Totais do filtro" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map((c) => (
          <Cartao key={c.rotulo} className="p-4">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              {c.rotulo} <span className="normal-case">· {rotuloPrincipal}</span>
            </p>
            <p className={cn("num mt-1 font-[family-name:var(--font-display)] text-xl font-bold", c.tom)}>
              {formatBRL(principal[c.chave])}
            </p>
            {secundario && <p className="num mt-0.5 text-xs text-muted">Previsto {formatBRL(secundario[c.chave])}</p>}
          </Cartao>
        ))}
      </section>
      {transferencias > 0 && (
        <p className="-mt-2 text-xs text-muted">
          Transferências e pagamentos de fatura somam {formatBRL(transferencias)} e ficam fora dos totais.
        </p>
      )}
      {cortado && (
        <p className="text-sm text-warning">
          Mostrando os {LIMITE_LISTA} lançamentos mais recentes. Use os filtros para ver o restante.
        </p>
      )}

      <section aria-label="Lista de lançamentos">
        <ListaLancamentos
          lancamentos={lancamentos}
          mostrarMes={mes === "todos"}
          mesPadrao={mes === "todos" ? mesPadrao : mes}
          hoje={hojeISO()}
          meses={listaDeMeses}
          contas={cadastros.contas}
          categorias={cadastros.categorias}
          regras={cadastros.regras}
          ativos={cadastros.ativos}
        />
      </section>

      {parceladas.length > 0 && (
        <ComprasParceladas
          mes={mes}
          itens={parceladas.map((p) => ({ ...p, conta: p.conta_id ? (nomeConta.get(p.conta_id) ?? null) : null }))}
        />
      )}
    </div>
  );
}

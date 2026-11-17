import Link from "next/link";
import { ArrowRight, UserPlus, Users, Wand2 } from "lucide-react";
import { Cartao, Selo } from "@/components/ui";
import { TituloPagina } from "@/components/em-construcao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterContexto } from "@/lib/sessao";
import { formatBRL, formatMesCurto, mesAtual, somarMeses } from "@/lib/format";
import { indicadoresParaPainel } from "@/lib/consultor/painel";
import { entrarNaFamilia } from "@/app/actions/sessao";
import { FormNovaFamilia } from "./forms";

export const metadata = { title: "Minhas famílias · Resolutto Family" };

export default async function PaginaConsultor() {
  const ctx = await obterContexto();
  const supabase = await criarClienteServidor();

  const { data: familias } = await supabase
    .from("familias")
    .select(
      "id, nome, inicio_planejamento, meses_horizonte, membros(count), lancamentos(data)",
    )
    .order("nome")
    .order("data", {
      referencedTable: "lancamentos",
      ascending: false,
      nullsFirst: false,
    })
    .limit(1, { referencedTable: "lancamentos" });

  const atual = mesAtual();
  // Uma família com erro (ex.: sem horizonte) não derruba a lista.
  const indicadores = new Map(
    await Promise.all(
      (familias ?? []).map(
        async (f) =>
          [f.id, await indicadoresParaPainel(f.id).catch(() => null)] as const,
      ),
    ),
  );
  const comAlerta = [...indicadores.values()].filter((i) =>
    i?.alertas.some((a) => a.tom !== "info"),
  ).length;

  return (
    <>
      <TituloPagina
        titulo="Minhas famílias"
        subtitulo={`${ctx.consultor?.nome ?? ""}${ctx.consultor?.admin ? " · admin (vê todas as famílias)" : ""}${familias?.length ? ` · ${comAlerta} ${comAlerta === 1 ? "família pede" : "famílias pedem"} atenção` : ""}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section aria-label="Famílias" className="flex flex-col gap-3">
          {!familias?.length && (
            <Cartao className="border-dashed text-center text-sm text-muted">
              Nenhuma família ainda. Crie a primeira ao lado.
            </Cartao>
          )}
          {familias?.map((f) => {
            const fim = somarMeses(
              f.inicio_planejamento,
              f.meses_horizonte - 1,
            );
            const acabando = fim <= somarMeses(atual, 2);
            const nMembros =
              (f.membros as unknown as { count: number }[])[0]?.count ?? 0;
            const ultimo = (f.lancamentos as { data: string | null }[])[0]
              ?.data;
            const ind = indicadores.get(f.id) ?? null;
            return (
              <Cartao
                key={f.id}
                role="region"
                className="flex flex-col gap-4"
                aria-label={`Família ${f.nome}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/consultor/familias/${f.id}`}
                      className="font-semibold hover:text-brand"
                    >
                      {f.nome}
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5" aria-hidden /> {nMembros}{" "}
                        {nMembros === 1 ? "membro" : "membros"}
                      </span>
                      <span>
                        Horizonte {formatMesCurto(f.inicio_planejamento)} a{" "}
                        {formatMesCurto(fim)}
                      </span>
                      {ultimo && (
                        <span>
                          Último lançamento{" "}
                          {ultimo.split("-").reverse().join("/")}
                        </span>
                      )}
                      {acabando && (
                        <Selo tom="atencao">Horizonte acabando</Selo>
                      )}
                      {nMembros === 0 && <Selo tom="info">Sem membros</Selo>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/consultor/familias/${f.id}`}
                      aria-label={`Configurar e convidar membros: ${f.nome}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-2"
                    >
                      <UserPlus className="size-4" aria-hidden /> Configurar e
                      convidar
                    </Link>
                    <form action={entrarNaFamilia}>
                      <input type="hidden" name="familia_id" value={f.id} />
                      <button
                        type="submit"
                        aria-label={`Abrir painel: ${f.nome}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-contrast hover:bg-brand-mid"
                      >
                        Abrir painel{" "}
                        <ArrowRight className="size-4" aria-hidden />
                      </button>
                    </form>
                  </div>
                </div>
                {ind && <IndicadoresFamilia ind={ind} />}
              </Cartao>
            );
          })}
        </section>

        <aside>
          <Cartao>
            <h2 className="mb-4 text-lg font-semibold">Nova família</h2>
            <FormNovaFamilia mesPadrao={atual} />
          </Cartao>
          <Link
            href="/consultor/regras-padrao"
            className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium hover:bg-surface-2"
          >
            <Wand2 className="size-4 text-brand" aria-hidden /> Regras padrão
            para novas famílias
          </Link>
        </aside>
      </div>
    </>
  );
}

function IndicadoresFamilia({
  ind,
}: {
  ind: NonNullable<Awaited<ReturnType<typeof indicadoresParaPainel>>>;
}) {
  const desp = ind.previstoDespesas
    ? Math.round(((ind.realizadoDespesas ?? 0) / ind.previstoDespesas) * 100)
    : null;
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">
            Despesas {ind.mes ? formatMesCurto(ind.mes) : ""}
          </dt>
          <dd className="font-semibold tabular-nums">
            {ind.realizadoDespesas === null
              ? "—"
              : formatBRL(ind.realizadoDespesas)}
            {ind.previstoDespesas !== null && (
              <span className="block text-xs font-normal text-muted">
                de {formatBRL(ind.previstoDespesas)} previsto
                {desp !== null && ind.realizadoDespesas !== null
                  ? ` (${desp}%)`
                  : ""}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Saldo do mês</dt>
          <dd
            className={`font-semibold tabular-nums ${ind.saldoMes !== null && ind.saldoMes < 0 ? "text-negative" : ""}`}
          >
            {ind.saldoMes === null ? "—" : formatBRL(ind.saldoMes)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Patrimônio líquido</dt>
          <dd className="font-semibold tabular-nums">
            {formatBRL(ind.patrimonioLiquido)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Reserva</dt>
          <dd className="font-semibold tabular-nums">
            {ind.reservaPct === null
              ? "Sem meta"
              : `${ind.reservaPct}% da meta`}
            <span className="block text-xs font-normal text-muted">
              IA: {ind.ia.usados} de {ind.ia.limite} leituras
            </span>
          </dd>
        </div>
      </dl>
      {ind.alertas.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Alertas">
          {ind.alertas.map((a, i) => (
            <li key={i}>
              <Selo tom={a.tom}>{a.texto}</Selo>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

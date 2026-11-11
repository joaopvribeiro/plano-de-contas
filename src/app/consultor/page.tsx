import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { Cartao, Selo } from "@/components/ui";
import { TituloPagina } from "@/components/em-construcao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterContexto } from "@/lib/sessao";
import { formatMesCurto, mesAtual, somarMeses } from "@/lib/format";
import { entrarNaFamilia } from "@/app/actions/sessao";
import { FormNovaFamilia } from "./forms";

export const metadata = { title: "Minhas famílias · Resolutto Family" };

export default async function PaginaConsultor() {
  const ctx = await obterContexto();
  const supabase = await criarClienteServidor();

  const { data: familias } = await supabase
    .from("familias")
    .select("id, nome, inicio_planejamento, meses_horizonte, membros(count), lancamentos(data)")
    .order("nome")
    .order("data", { referencedTable: "lancamentos", ascending: false, nullsFirst: false })
    .limit(1, { referencedTable: "lancamentos" });

  const atual = mesAtual();

  return (
    <>
      <TituloPagina
        titulo="Minhas famílias"
        subtitulo={`${ctx.consultor?.nome ?? ""}${ctx.consultor?.admin ? " · admin (vê todas as famílias)" : ""}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section aria-label="Famílias" className="flex flex-col gap-3">
          {!familias?.length && (
            <Cartao className="border-dashed text-center text-sm text-muted">
              Nenhuma família ainda. Crie a primeira ao lado.
            </Cartao>
          )}
          {familias?.map((f) => {
            const fim = somarMeses(f.inicio_planejamento, f.meses_horizonte - 1);
            const acabando = fim <= somarMeses(atual, 2);
            const nMembros = (f.membros as unknown as { count: number }[])[0]?.count ?? 0;
            const ultimo = (f.lancamentos as { data: string | null }[])[0]?.data;
            return (
              <Cartao key={f.id} className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <Link href={`/consultor/familias/${f.id}`} className="font-semibold hover:text-brand">
                    {f.nome}
                  </Link>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden /> {nMembros} {nMembros === 1 ? "membro" : "membros"}
                    </span>
                    <span>
                      Horizonte {formatMesCurto(f.inicio_planejamento)} a {formatMesCurto(fim)}
                    </span>
                    {ultimo && <span>Último lançamento {ultimo.split("-").reverse().join("/")}</span>}
                    {acabando && <Selo tom="atencao">Horizonte acabando</Selo>}
                    {nMembros === 0 && <Selo tom="info">Sem membros</Selo>}
                  </p>
                </div>
                <form action={entrarNaFamilia}>
                  <input type="hidden" name="familia_id" value={f.id} />
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-contrast hover:bg-brand-mid"
                  >
                    Abrir <ArrowRight className="size-4" aria-hidden />
                  </button>
                </form>
              </Cartao>
            );
          })}
          <p className="text-xs text-muted">
            Previsto vs realizado, patrimônio, reserva, renovações e alertas entram nesta lista na Etapa 8.
          </p>
        </section>

        <aside>
          <Cartao>
            <h2 className="mb-4 text-lg font-semibold">Nova família</h2>
            <FormNovaFamilia mesPadrao={atual} />
          </Cartao>
        </aside>
      </div>
    </>
  );
}

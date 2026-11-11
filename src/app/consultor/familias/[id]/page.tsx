import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { z } from "zod";
import { Cartao, Selo } from "@/components/ui";
import { TituloPagina } from "@/components/em-construcao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatData, jaPassou } from "@/lib/format";
import { entrarNaFamilia } from "@/app/actions/sessao";
import { cancelarConvite } from "@/app/actions/consultor";
import { FormConvite, FormHorizonte } from "../../forms";
import { CopiarLink } from "./copiar-link";

export default async function PaginaFamilia({ params }: PageProps<"/consultor/familias/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await criarClienteServidor();
  const [{ data: familia }, { data: membros }, { data: convites }] = await Promise.all([
    supabase.from("familias").select("id, nome, inicio_planejamento, meses_horizonte, saldo_inicial_caixa").eq("id", id).maybeSingle(),
    supabase.from("membros").select("user_id, nome, criado_em").eq("familia_id", id).order("nome"),
    supabase
      .from("convites")
      .select("id, email, nome, token, expira_em, aceito_em")
      .eq("familia_id", id)
      .is("aceito_em", null)
      .order("criado_em", { ascending: false }),
  ]);
  if (!familia) notFound();

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return (
    <>
      <Link href="/consultor" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Minhas famílias
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <TituloPagina titulo={familia.nome} subtitulo="Configuração da família" />
        <form action={entrarNaFamilia}>
          <input type="hidden" name="familia_id" value={familia.id} />
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-contrast hover:bg-brand-mid"
          >
            Abrir painel da família <ArrowRight className="size-4" aria-hidden />
          </button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao>
          <h2 className="mb-3 text-lg font-semibold">Membros</h2>
          {membros?.length ? (
            <ul className="divide-y divide-border">
              {membros.map((m) => (
                <li key={m.user_id} className="flex justify-between py-2 text-sm">
                  <span>{m.nome}</span>
                  <span className="text-muted">desde {formatData(m.criado_em)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Ninguém entrou ainda.</p>
          )}

          {!!convites?.length && (
            <>
              <h3 className="mt-5 mb-2 text-sm font-semibold">Convites pendentes</h3>
              <ul className="divide-y divide-border">
                {convites.map((c) => {
                  const expirado = jaPassou(c.expira_em);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        {c.email} {expirado ? <Selo tom="negativo">expirado</Selo> : <Selo tom="atencao">até {formatData(c.expira_em)}</Selo>}
                      </span>
                      <span className="flex items-center gap-1">
                        {!expirado && <CopiarLink url={`${site}/convite/${c.token}`} />}
                        <form action={cancelarConvite}>
                          <input type="hidden" name="convite_id" value={c.id} />
                          <input type="hidden" name="familia_id" value={familia.id} />
                          <button type="submit" className="rounded-md px-2 py-1 text-xs text-negative hover:bg-negative-soft">
                            Cancelar
                          </button>
                        </form>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <h3 className="mt-5 mb-3 text-sm font-semibold">Convidar membro</h3>
          <FormConvite familiaId={familia.id} />
        </Cartao>

        <Cartao>
          <h2 className="mb-1 text-lg font-semibold">Horizonte do planejamento</h2>
          <p className="mb-4 text-sm text-muted">Define os meses da DFC e o ponto de partida do caixa acumulado.</p>
          <FormHorizonte
            familiaId={familia.id}
            inicio={familia.inicio_planejamento}
            meses={familia.meses_horizonte}
            saldo={Number(familia.saldo_inicial_caixa)}
          />
          <p className="mt-6 text-xs text-muted">
            Contas, metas por classe, limites de IA e premissas de objetivos ganham tela nas próximas etapas.
          </p>
        </Cartao>
      </div>
    </>
  );
}

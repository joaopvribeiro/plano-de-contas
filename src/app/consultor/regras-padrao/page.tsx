import Link from "next/link";
import { ArrowLeft, Repeat, Trash2, Wand2 } from "lucide-react";
import { Cartao, Selo } from "@/components/ui";
import { TituloPagina } from "@/components/em-construcao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterContexto } from "@/lib/sessao";
import { ROTULO_NATUREZA, type Natureza } from "@/lib/dominio";
import { excluirRegraModelo } from "@/app/actions/consultor";
import { FormRegraModelo } from "./form";

export const metadata = { title: "Regras padrão · Resolutto Family" };

export default async function PaginaRegrasPadrao() {
  const ctx = await obterContexto();
  const admin = Boolean(ctx.consultor?.admin);
  const supabase = await criarClienteServidor();
  const { data: regras } = await supabase
    .from("regras_modelo")
    .select("id, padrao, natureza, categoria_nome, classe, assinatura")
    .order("padrao");

  return (
    <>
      <Link href="/consultor" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Minhas famílias
      </Link>
      <TituloPagina
        titulo="Regras padrão"
        subtitulo="Copiadas para cada família nova. A categoria é ligada pelo nome; se a família não tiver a categoria, a regra é ignorada."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Cartao className="p-0">
          <ul className="divide-y divide-border">
            {(regras ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <p className="flex min-w-0 items-start gap-2">
                  <Wand2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  <span>
                    Contém <strong className="font-mono">{r.padrao}</strong>
                    <span className="text-muted"> → </span>
                    {r.natureza === "fluxo" ? (
                      <>
                        {r.categoria_nome}
                        {r.classe && <span className="text-muted"> · {r.classe}</span>}
                      </>
                    ) : (
                      ROTULO_NATUREZA[r.natureza as Natureza]
                    )}{" "}
                    {r.assinatura && (
                      <Selo tom="info">
                        <Repeat className="mr-0.5 size-3" aria-hidden /> assinatura
                      </Selo>
                    )}
                  </span>
                </p>
                {admin && (
                  <form action={excluirRegraModelo}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="rounded-md p-2 text-muted hover:bg-negative-soft hover:text-negative" aria-label={`Excluir regra padrão ${r.padrao}`}>
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Cartao>
        <aside>
          <Cartao>
            <h2 className="mb-4 text-lg font-semibold">Nova regra padrão</h2>
            {admin ? (
              <FormRegraModelo />
            ) : (
              <p className="text-sm text-muted">Só administradores alteram a biblioteca.</p>
            )}
          </Cartao>
        </aside>
      </div>
    </>
  );
}

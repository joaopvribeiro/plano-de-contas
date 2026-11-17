import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Aviso, Cartao } from "@/components/ui";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { DadosApolice } from "@/lib/apolices/modelo";
import { RevisaoApolice } from "./revisao";

export const metadata = { title: "Revisar apólice · Resolutto Family" };
export const maxDuration = 300;

export default async function Pagina({ params }: PageProps<"/protecoes/importar/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { familia } = await obterFamiliaAtiva();
  const supabase = await criarClienteServidor();
  const { data: imp } = await supabase
    .from("importacoes")
    .select("status, resposta_ia, nomes_arquivos")
    .eq("familia_id", familia.id)
    .eq("tipo", "apolice")
    .eq("id", id)
    .maybeSingle();
  if (!imp) notFound();
  if (imp.status === "confirmada" || imp.status === "descartada") redirect("/protecoes");
  const r = imp.resposta_ia as { erro?: string; apolice?: DadosApolice & { avisos: string[] } } | null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/protecoes" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Proteções
      </Link>
      <Cartao className="flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-semibold">{imp.status === "revisao" ? "Revisar apólice" : "Leitura não concluída"}</h1>
          <p className="text-sm text-muted">{imp.nomes_arquivos.join(", ")}</p>
        </div>
        {imp.status === "revisao" && r?.apolice ? (
          <>
            <p className="text-sm text-muted">Confira os campos com a apólice antes de salvar. O arquivo original fica guardado junto.</p>
            {r.apolice.avisos.length > 0 && (
              <Aviso tom="atencao">
                <ul className="list-disc pl-4">
                  {r.apolice.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </Aviso>
            )}
            <RevisaoApolice id={id} apolice={r.apolice} />
          </>
        ) : (
          <RevisaoApolice id={id} erro={r?.erro ?? "A leitura foi interrompida antes de terminar."} />
        )}
      </Cartao>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Aviso, Cartao } from "@/components/ui";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarRevisaoRelatorio } from "@/lib/relatorio/consultas";
import { hojeISO } from "@/lib/format";
import { RevisaoRelatorio } from "./revisao";
import { LeituraPendenteRelatorio } from "./pendente";

export const metadata = { title: "Revisar relatório · Resolutto Family" };
export const maxDuration = 300;

export default async function Pagina({ params, searchParams }: PageProps<"/patrimonio/importar/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const { familia } = await obterFamiliaAtiva();
  const supabase = await criarClienteServidor();
  const { data: imp } = await supabase.from("importacoes").select("status, resposta_ia").eq("familia_id", familia.id).eq("tipo", "relatorio").eq("id", id).maybeSingle();
  if (!imp) notFound();

  const voltar = (
    <Link href="/patrimonio/importar" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
      <ArrowLeft className="size-4" aria-hidden /> Importar relatório
    </Link>
  );

  if (imp.status === "lendo") {
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <LeituraPendenteRelatorio id={id} erro={(imp.resposta_ia as { erro?: string } | null)?.erro ?? null} />
      </div>
    );
  }
  if (imp.status === "confirmada") {
    const n = (k: string) => Number(sp[k] ?? 0) || 0;
    const partes = [
      n("atualizados") && `${n("atualizados")} ativo${n("atualizados") === 1 ? "" : "s"} atualizado${n("atualizados") === 1 ? "" : "s"}`,
      n("criados") && `${n("criados")} ativo${n("criados") === 1 ? "" : "s"} novo${n("criados") === 1 ? "" : "s"}`,
      n("zerados") && `${n("zerados")} zerado${n("zerados") === 1 ? "" : "s"}`,
    ].filter(Boolean);
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <Cartao className="flex flex-col gap-3">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="size-5 text-positive" aria-hidden /> Relatório confirmado
          </h1>
          <p className="text-sm">{partes.length ? `${partes.join(", ")}.` : "Posições gravadas."} O PDF original foi apagado.</p>
          <div>
            <Link href="/patrimonio" className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-contrast hover:bg-brand-mid">
              Ver patrimônio
            </Link>
          </div>
        </Cartao>
      </div>
    );
  }
  if (imp.status !== "revisao") {
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <Aviso tom="info">Este relatório foi descartado.</Aviso>
      </div>
    );
  }

  const rev = await carregarRevisaoRelatorio(familia.id, id);
  if (!rev) notFound();
  return (
    <div className="flex flex-col gap-4">
      {voltar}
      <RevisaoRelatorio
        id={id}
        nomes={rev.importacao.nomes_arquivos}
        relatorio={{ ...rev.relatorio, posicoes: [] }}
        conferencia={rev.conferencia}
        linhasIniciais={rev.linhas}
        sumidosIniciais={rev.sumidos}
        existentes={rev.existentes.map(({ id, nome, categoria, instituicao, valor }) => ({ id, nome, categoria, instituicao, valor }))}
        reserva={rev.reserva}
        hoje={hojeISO()}
      />
    </div>
  );
}

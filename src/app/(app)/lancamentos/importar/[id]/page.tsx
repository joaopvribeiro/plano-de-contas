import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Aviso, Cartao } from "@/components/ui";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarRevisao } from "@/lib/importacao/consultas";
import { RevisaoImportacao } from "./revisao";
import { LeituraPendente } from "./pendente";

export const metadata = { title: "Revisar importação · Resolutto Family" };
export const maxDuration = 300;

export default async function PaginaRevisao({ params, searchParams }: PageProps<"/lancamentos/importar/[id]">) {
  const { id } = await params;
  const regrasNovas = Number((await searchParams).regras ?? 0) || 0;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { familia } = await obterFamiliaAtiva();

  const voltar = (
    <Link href="/lancamentos/importar" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
      <ArrowLeft className="size-4" aria-hidden /> Importar extrato
    </Link>
  );

  const supabase = await criarClienteServidor();
  const { data: imp } = await supabase.from("importacoes").select("status, resposta_ia").eq("familia_id", familia.id).eq("id", id).maybeSingle();
  if (!imp) notFound();

  if (imp.status === "lendo") {
    const erro = (imp.resposta_ia as { erro?: string } | null)?.erro ?? null;
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <LeituraPendente id={id} erro={erro} />
      </div>
    );
  }
  if (imp.status === "confirmada") {
    const { data: gravados } = await supabase.from("lancamentos").select("tipo, mes_competencia").eq("familia_id", familia.id).eq("importacao_id", id);
    const reais = (gravados ?? []).filter((g) => g.tipo === "Realizado");
    const futuras = (gravados ?? []).length - reais.length;
    const mes = reais.map((g) => g.mes_competencia).sort()[0];
    const s = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <Cartao className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="size-5 text-positive" aria-hidden /> Importação confirmada
          </h2>
          <p className="text-sm">
            {s(reais.length, "lançamento gravado", "lançamentos gravados")}
            {futuras > 0 && `, ${s(futuras, "parcela futura prevista", "parcelas futuras previstas")}`}
            {regrasNovas > 0 && ` e ${s(regrasNovas, "regra nova", "regras novas")}`}. O arquivo original foi apagado.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/lancamentos?mes=${mes ?? "todos"}`} className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-contrast hover:bg-brand-mid">
              Ver lançamentos
            </Link>
            <Link href="/lancamentos/importar" className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-2">
              Importar outro
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
        <Aviso tom="info">Esta importação foi descartada.</Aviso>
      </div>
    );
  }

  const rev = await carregarRevisao(familia.id, id, familia.consultor);
  if (!rev) notFound();

  return (
    <div className="flex flex-col gap-4">
      {voltar}
      <RevisaoImportacao
        id={id}
        conta={{ nome: rev.conta.nome, cartao: rev.mes_fatura !== null }}
        documento={{
          tipo: rev.documento.tipo,
          banco: rev.documento.banco,
          fechamento: rev.documento.fechamento,
          vencimento: rev.documento.vencimento,
          avisos: rev.documento.avisos,
          total_fatura: rev.documento.total_fatura,
          saldo_inicial: rev.documento.saldo_inicial,
          saldo_final: rev.documento.saldo_final,
        }}
        origem={rev.importacao.origem}
        nomes={rev.importacao.nomes_arquivos}
        categorias={rev.categorias.filter((c) => !c.arquivada).map(({ id, nome, classe_padrao }) => ({ id, nome, classe_padrao }))}
        linhasIniciais={rev.linhas}
        mesFatura={rev.mes_fatura}
      />
    </div>
  );
}

import Link from "next/link";
import { Aviso } from "@/components/ui";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatMesLongo, mesesDoHorizonte, somarMeses } from "@/lib/format";
import { sugerirRepeticao } from "@/lib/lancamentos/projecao";
import { Projetar } from "./projetar";

export const metadata = { title: "Projetar orçamento · Resolutto Family" };

export default async function PaginaProjetar({ searchParams }: PageProps<"/lancamentos/projetar">) {
  const { familia } = await obterFamiliaAtiva();
  if (!familia.consultor) return <Aviso tom="info">Só o consultor projeta o orçamento previsto.</Aviso>;
  const supabase = await criarClienteServidor();

  const { data: fam } = await supabase.from("familias").select("inicio_planejamento, meses_horizonte").eq("id", familia.id).single();
  const meses = mesesDoHorizonte(fam!.inicio_planejamento, fam!.meses_horizonte);
  const fim = somarMeses(fam!.inicio_planejamento, fam!.meses_horizonte - 1);

  // Quantos previstos (fora parcelas) cada mês já tem.
  const { data: contagem } = await supabase
    .from("lancamentos")
    .select("mes_competencia")
    .eq("familia_id", familia.id)
    .eq("tipo", "Previsto")
    .is("parcela", null)
    .gte("mes_competencia", meses[0])
    .lte("mes_competencia", fim)
    .limit(10000);
  const porMes = new Map<string, number>();
  for (const c of contagem ?? []) porMes.set(c.mes_competencia, (porMes.get(c.mes_competencia) ?? 0) + 1);

  const pedido = String((await searchParams).de ?? "");
  const origem = meses.includes(pedido) ? pedido : (meses.find((m) => porMes.get(m)) ?? meses[0]);

  const [{ data: linhas }, { data: cadastros }] = await Promise.all([
    supabase
      .from("lancamentos")
      .select("id, descricao, valor, natureza, classe, conta_id, categoria_id")
      .eq("familia_id", familia.id)
      .eq("tipo", "Previsto")
      .eq("mes_competencia", origem)
      .is("parcela", null)
      .order("classe")
      .order("descricao"),
    Promise.all([
      supabase.from("contas").select("id, nome").eq("familia_id", familia.id),
      supabase.from("categorias").select("id, nome").eq("familia_id", familia.id),
    ]).then(([c, k]) => ({ data: { contas: c.data ?? [], categorias: k.data ?? [] } })),
  ]);
  const nomeConta = new Map(cadastros!.contas.map((c) => [c.id, c.nome]));
  const nomeCat = new Map(cadastros!.categorias.map((c) => [c.id, c.nome]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Projetar orçamento</h2>
        <p className="text-sm text-muted">
          Repete o previsto de um mês nos meses seguintes do horizonte (até {formatMesLongo(fim)}). Escolha, linha a linha, se repete todo
          mês, só em alguns meses ou fica só no mês de origem, e ajuste o valor dos próximos meses. O que já estiver previsto nos meses de
          destino (mesma descrição e conta) não é duplicado.
        </p>
      </div>
      <nav aria-label="Mês de origem" className="flex flex-wrap gap-1.5">
        {meses.map((m) => (
          <Link
            key={m}
            href={`/lancamentos/projetar?de=${m}`}
            aria-current={m === origem ? "page" : undefined}
            className={
              m === origem
                ? "rounded-full bg-brand px-3 py-1 text-sm font-semibold text-brand-contrast"
                : "rounded-full border border-border px-3 py-1 text-sm hover:bg-surface-2"
            }
          >
            {formatMesLongo(m).replace(/ de /, "/")} <span className="opacity-70">({porMes.get(m) ?? 0})</span>
          </Link>
        ))}
      </nav>
      {!linhas?.length ? (
        <Aviso tom="info">
          {formatMesLongo(origem)} não tem previsto para projetar. Escolha outro mês ou{" "}
          <Link href="/lancamentos/importar-previsto" className="font-semibold underline">
            importe o previsto
          </Link>
          .
        </Aviso>
      ) : (
        <Projetar
          key={origem}
          origem={origem}
          seguintes={meses.filter((m) => m > origem)}
          linhas={linhas.map((l) => ({
            id: l.id,
            descricao: l.descricao,
            valor: Number(l.valor),
            natureza: l.natureza,
            classe: l.classe,
            conta: l.conta_id ? (nomeConta.get(l.conta_id) ?? null) : null,
            categoria: l.categoria_id ? (nomeCat.get(l.categoria_id) ?? null) : null,
            sugestao: sugerirRepeticao(l.descricao),
          }))}
        />
      )}
    </div>
  );
}

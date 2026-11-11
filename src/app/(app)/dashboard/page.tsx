import { Cartao } from "@/components/ui";
import { EmConstrucao, TituloPagina } from "@/components/em-construcao";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard & DFC · Resolutto Family" };

export default async function PaginaDashboard() {
  const { familia } = await obterFamiliaAtiva();
  const supabase = await criarClienteServidor();

  // Contagens pela sessão do usuário: confirmam, de ponta a ponta, que a RLS
  // devolve só os dados desta família.
  const contar = async (tabela: string) => {
    const { count } = await supabase
      .from(tabela)
      .select("*", { count: "exact", head: true })
      .eq("familia_id", familia.id);
    return count ?? 0;
  };
  const [lancamentos, ativos, apolices, projetos] = await Promise.all([
    contar("lancamentos"),
    contar("ativos"),
    contar("apolices"),
    contar("projetos"),
  ]);

  const itens = [
    { rotulo: "Lançamentos", valor: lancamentos },
    { rotulo: "Ativos", valor: ativos },
    { rotulo: "Apólices", valor: apolices },
    { rotulo: "Projetos", valor: projetos },
  ];

  return (
    <>
      <TituloPagina titulo="Dashboard & DFC" subtitulo={familia.nome} />
      <section aria-label="Dados da família" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {itens.map((i) => (
          <Cartao key={i.rotulo} className="p-4">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">{i.rotulo}</p>
            <p className="num mt-1 font-[family-name:var(--font-display)] text-2xl font-bold">{i.valor}</p>
          </Cartao>
        ))}
      </section>
      <EmConstrucao
        etapa={3}
        itens={[
          "Cartões do mês (receitas, despesas, saldo e reserva)",
          "Gráfico de entradas, saídas e caixa acumulado",
          "Distribuição das despesas sobre a receita, com metas por classe",
          "Matriz DFC com Previsto, Realizado e Divergência",
          "Insights da IA do mês (Etapa 8)",
        ]}
      />
    </>
  );
}

import { EmConstrucao, TituloPagina } from "@/components/em-construcao";
import { obterFamiliaAtiva } from "@/lib/sessao";

export const metadata = { title: "Lançamentos · Resolutto Family" };

export default async function Pagina() {
  const { familia } = await obterFamiliaAtiva();
  return (
    <>
      <TituloPagina titulo="Lançamentos" subtitulo={familia.nome} />
      <EmConstrucao etapa={2} itens={["Lista com filtros, busca e total do filtro", "Novo lançamento rápido, com sugestão de mês pela fatura", "Edição em massa, contas, categorias e regras", "Importação com IA (Etapa 4)"]} />
    </>
  );
}

import { EmConstrucao, TituloPagina } from "@/components/em-construcao";
import { obterFamiliaAtiva } from "@/lib/sessao";

export const metadata = { title: "Patrimônio · Resolutto Family" };

export default async function Pagina() {
  const { familia } = await obterFamiliaAtiva();
  return (
    <>
      <TituloPagina titulo="Patrimônio" subtitulo={familia.nome} />
      <EmConstrucao etapa={5} itens={["Carteira investida, dívidas e patrimônio líquido", "Distribuição por categoria e por instituição", "Balanço patrimonial com ativos e passivos", "Evolução do patrimônio"]} />
    </>
  );
}

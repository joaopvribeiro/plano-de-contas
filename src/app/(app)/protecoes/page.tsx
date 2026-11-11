import { EmConstrucao, TituloPagina } from "@/components/em-construcao";
import { obterFamiliaAtiva } from "@/lib/sessao";

export const metadata = { title: "Proteções · Resolutto Family" };

export default async function Pagina() {
  const { familia } = await obterFamiliaAtiva();
  return (
    <>
      <TituloPagina titulo="Proteções" subtitulo={familia.nome} />
      <EmConstrucao etapa={7} itens={["Prêmios mensais e renovações em 60 dias", "Cards por tipo de seguro", "Detalhe da apólice com carências, exclusões e como acionar", "Leitura de apólices com IA"]} />
    </>
  );
}

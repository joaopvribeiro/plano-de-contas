import { EmConstrucao, TituloPagina } from "@/components/em-construcao";
import { obterFamiliaAtiva } from "@/lib/sessao";

export const metadata = { title: "Objetivos · Resolutto Family" };

export default async function Pagina() {
  const { familia } = await obterFamiliaAtiva();
  return (
    <>
      <TituloPagina titulo="Objetivos" subtitulo={familia.nome} />
      <EmConstrucao etapa={6} itens={["Liberdade financeira com aporte necessário", "Reserva de emergência", "Consórcios e imóvel", "Projetos com quanto guardar por mês"]} />
    </>
  );
}

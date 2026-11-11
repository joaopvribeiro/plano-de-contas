import { TituloPagina } from "@/components/em-construcao";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { SubnavLancamentos } from "./subnav";

export default async function LayoutLancamentos({ children }: { children: React.ReactNode }) {
  const { familia } = await obterFamiliaAtiva();
  return (
    <>
      <TituloPagina titulo="Lançamentos" subtitulo={familia.nome} />
      <SubnavLancamentos />
      {children}
    </>
  );
}

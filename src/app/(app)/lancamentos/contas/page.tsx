import { obterFamiliaAtiva } from "@/lib/sessao";
import { carregarCadastros } from "@/lib/lancamentos/consultas";
import { GestaoContas } from "./gestao";

export const metadata = { title: "Contas e cartões · Resolutto Family" };

export default async function PaginaContas() {
  const { familia } = await obterFamiliaAtiva();
  const { contas } = await carregarCadastros(familia.id);
  return <GestaoContas contas={contas} />;
}

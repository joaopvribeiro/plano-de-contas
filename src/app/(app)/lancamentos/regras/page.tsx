import { obterFamiliaAtiva } from "@/lib/sessao";
import { carregarCadastros } from "@/lib/lancamentos/consultas";
import { GestaoRegras } from "./gestao";

export const metadata = { title: "Regras · Resolutto Family" };

export default async function PaginaRegras() {
  const { familia } = await obterFamiliaAtiva();
  const { regras, categorias, contas } = await carregarCadastros(familia.id);
  return <GestaoRegras regras={regras} categorias={categorias} contas={contas} />;
}

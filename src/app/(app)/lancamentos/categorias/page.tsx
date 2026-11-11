import { obterFamiliaAtiva } from "@/lib/sessao";
import { carregarCadastros } from "@/lib/lancamentos/consultas";
import { GestaoCategorias } from "./gestao";

export const metadata = { title: "Categorias · Resolutto Family" };

export default async function PaginaCategorias() {
  const { familia } = await obterFamiliaAtiva();
  const { categorias } = await carregarCadastros(familia.id);
  return <GestaoCategorias categorias={categorias} />;
}

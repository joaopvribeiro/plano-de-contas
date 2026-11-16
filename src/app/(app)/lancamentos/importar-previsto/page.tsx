import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Aviso } from "@/components/ui";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { carregarCadastros } from "@/lib/lancamentos/consultas";
import { mesesDoHorizonte, formatMesCurto } from "@/lib/format";
import { ImportarPrevisto } from "./importar";

export const metadata = { title: "Importar orçamento previsto · Resolutto Family" };

export default async function PaginaImportarPrevisto() {
  const { familia } = await obterFamiliaAtiva();
  if (!familia.consultor) {
    return <Aviso tom="info">O orçamento previsto é montado pelo seu consultor.</Aviso>;
  }
  const c = await carregarCadastros(familia.id);
  const meses = mesesDoHorizonte(c.familia.inicio_planejamento, c.familia.meses_horizonte);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/lancamentos" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Lançamentos
      </Link>
      <div>
        <h2 className="text-lg font-semibold">Importar orçamento previsto</h2>
        <p className="text-sm text-muted">
          Cole as linhas copiadas do Excel ou do Google Sheets, ou envie um CSV. O horizonte desta família vai de{" "}
          {formatMesCurto(meses[0])} a {formatMesCurto(meses[meses.length - 1])}; linhas fora dele são importadas, mas não
          aparecem na DFC.
        </p>
      </div>
      <ImportarPrevisto
        contas={c.contas.filter((x) => x.ativa).map(({ id, nome }) => ({ id, nome }))}
        categorias={c.categorias.filter((x) => !x.arquivada).map(({ id, nome, classe_padrao }) => ({ id, nome, classe_padrao }))}
        horizonte={{ de: meses[0], ate: meses[meses.length - 1] }}
      />
    </div>
  );
}

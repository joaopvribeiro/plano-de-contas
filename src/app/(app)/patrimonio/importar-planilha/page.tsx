import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TituloPagina } from "@/components/em-construcao";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/format";
import type { CategoriaAtivo } from "@/lib/patrimonio";
import { ImportarAtivos } from "./importar";

export const metadata = { title: "Importar ativos por planilha · Resolutto Family" };

export default async function PaginaImportarAtivos() {
  const { familia } = await obterFamiliaAtiva();
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("ativos").select("id, nome, instituicao, categoria").eq("familia_id", familia.id).order("nome");
  return (
    <>
      <Link href="/patrimonio" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Patrimônio
      </Link>
      <TituloPagina
        titulo="Importar ativos por planilha"
        subtitulo="Cole as linhas do Excel ou do Google Sheets, ou envie um CSV. Ativos com o mesmo nome e instituição são atualizados; os outros são criados."
      />
      <ImportarAtivos existentes={(data ?? []).map((a) => ({ ...a, categoria: a.categoria as CategoriaAtivo }))} hoje={hojeISO()} />
    </>
  );
}

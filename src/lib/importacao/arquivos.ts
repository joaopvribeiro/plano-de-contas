import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";

export const BUCKET = "familias";

/** Os arquivos originais saem do Storage assim que a importação é concluída ou descartada. */
export async function apagarArquivos(id: string, caminhos: string[]) {
  if (!caminhos.length) return;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.storage.from(BUCKET).remove(caminhos);
  if (!error) await supabase.from("importacoes").update({ arquivos_expurgados_em: new Date().toISOString() }).eq("id", id);
}

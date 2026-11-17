import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarDashboard } from "@/lib/dashboard/consultas";
import { metaDaReserva } from "@/lib/dfc";
import { totalReserva } from "@/lib/patrimonio";
import { mesmaInstituicao, montarRevisaoRelatorio, conferirRelatorio, type AtivoExistente, type LinhaRelatorio, type Sumido, type ConferenciaRelatorio } from "./revisao";
import type { RelatorioLido } from "./esquema";

export type ImportacaoRelatorio = {
  id: string;
  status: "lendo" | "revisao" | "confirmada" | "descartada";
  criado_em: string;
  nomes_arquivos: string[];
  erro: string | null;
  instituicao: string | null;
  data_referencia: string | null;
  posicoes: number | null;
};

export async function listarRelatorios(familiaId: string): Promise<ImportacaoRelatorio[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("importacoes")
    .select("id, status, criado_em, nomes_arquivos, resposta_ia")
    .eq("familia_id", familiaId)
    .eq("tipo", "relatorio")
    .order("criado_em", { ascending: false })
    .limit(20);
  return (data ?? []).map((i) => {
    const r = i.resposta_ia as { erro?: string; relatorio?: RelatorioLido } | null;
    return {
      id: i.id,
      status: i.status as ImportacaoRelatorio["status"],
      criado_em: i.criado_em,
      nomes_arquivos: i.nomes_arquivos ?? [],
      erro: r?.erro ?? null,
      instituicao: r?.relatorio?.instituicao ?? null,
      data_referencia: r?.relatorio?.data_referencia ?? null,
      posicoes: r?.relatorio?.posicoes.length ?? null,
    };
  });
}

export type RevisaoRelatorio = {
  importacao: { id: string; status: string; arquivos: string[]; nomes_arquivos: string[] };
  relatorio: RelatorioLido;
  instituicao: string | null;
  linhas: LinhaRelatorio[];
  sumidos: Sumido[];
  conferencia: ConferenciaRelatorio | null;
  existentes: AtivoExistente[];
  reserva: { meta: number; foraDoRelatorio: number };
};

/** Monta a revisão no servidor. A confirmação usa a mesma montagem: valores nunca vêm do navegador. */
export async function carregarRevisaoRelatorio(familiaId: string, id: string): Promise<RevisaoRelatorio | null> {
  const supabase = await criarClienteServidor();
  const { data: imp } = await supabase
    .from("importacoes")
    .select("id, status, arquivos, nomes_arquivos, resposta_ia")
    .eq("familia_id", familiaId)
    .eq("tipo", "relatorio")
    .eq("id", id)
    .maybeSingle();
  const rel = (imp?.resposta_ia as { relatorio?: RelatorioLido } | null)?.relatorio;
  if (!imp || !rel) return null;

  const [{ data: ativos }, dash] = await Promise.all([
    supabase
      .from("ativos")
      .select("id, nome, categoria, instituicao, valor, origem, chave_relatorio, reserva_valor")
      .eq("familia_id", familiaId)
      .neq("categoria", "Consórcio")
      .order("nome"),
    carregarDashboard(familiaId),
  ]);
  const existentes = ((ativos ?? []) as AtivoExistente[]).map((a) => ({ ...a, valor: Number(a.valor), reserva_valor: a.reserva_valor == null ? null : Number(a.reserva_valor) }));
  const reserva = {
    meta: metaDaReserva(dash.dfc, dash.reservaMeses),
    foraDoRelatorio: totalReserva(existentes.filter((a) => !mesmaInstituicao(a.instituicao, rel.instituicao))),
  };
  const { linhas, sumidos } = montarRevisaoRelatorio(rel, rel.instituicao, existentes, reserva);
  return {
    importacao: { id: imp.id, status: imp.status, arquivos: imp.arquivos ?? [], nomes_arquivos: imp.nomes_arquivos ?? [] },
    relatorio: rel,
    instituicao: rel.instituicao,
    linhas,
    sumidos,
    conferencia: conferirRelatorio(rel),
    existentes,
    reserva,
  };
}

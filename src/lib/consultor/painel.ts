import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarDashboard } from "@/lib/dashboard/consultas";
import { carregarPatrimonio } from "@/lib/patrimonio-consultas";
import { metaDaReserva } from "@/lib/dfc";
import { resumir } from "@/lib/patrimonio";
import { hojeISO, mesAtual, somarMeses } from "@/lib/format";
import { colunaDoPainel, indicadoresDaFamilia, type Indicadores } from "./indicadores";

function somarDias(data: string, dias: number) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Indicadores de uma família para o painel do consultor (com a RLS de quem chama). */
export async function indicadoresParaPainel(familiaId: string): Promise<Indicadores & { ia: { usados: number; limite: number } }> {
  const supabase = await criarClienteServidor();
  const hoje = hojeISO();
  const atual = mesAtual();
  const [dash, pat, { data: ultimo }, { data: apolices }, { data: uso }] = await Promise.all([
    carregarDashboard(familiaId),
    carregarPatrimonio(familiaId, 1),
    supabase.from("lancamentos").select("data").eq("familia_id", familiaId).eq("tipo", "Realizado").order("data", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("apolices")
      .select("seguradora, tipo, vigencia_fim")
      .eq("familia_id", familiaId)
      .gte("vigencia_fim", hoje)
      .lte("vigencia_fim", somarDias(hoje, 60))
      .order("vigencia_fim"),
    supabase.rpc("uso_ia_no_mes", { p_familia: familiaId, p_recurso: "extrato" }),
  ]);
  const linha = (Array.isArray(uso) ? uso[0] : uso) as { usados: number; limite: number | null } | undefined;
  const ia = { usados: linha?.usados ?? 0, limite: linha?.limite ?? 0 };
  const ind = indicadoresDaFamilia({
    hoje,
    coluna: colunaDoPainel(dash.dfc.meses, atual, somarMeses(atual, -1)),
    ultimoLancamento: ultimo?.data ?? null,
    patrimonioLiquido: resumir(pat.ativos, pat.passivos).patrimonioComDireitos,
    reserva: { saldo: dash.saldoReserva, meta: metaDaReserva(dash.dfc, dash.reservaMeses) },
    ativos: pat.ativos.map((a) => ({ nome: a.nome, data_saldo: a.data_saldo, valor: a.valor, categoria: a.categoria })),
    renovacoes: (apolices ?? []).map((a) => ({ seguradora: a.seguradora ?? "Apólice", vigencia_fim: a.vigencia_fim! })),
    ia,
  });
  return { ...ind, ia };
}

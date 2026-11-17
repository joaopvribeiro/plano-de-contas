import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarDashboard } from "@/lib/dashboard/consultas";
import { metaDaReserva } from "@/lib/dfc";
import type { Ativo } from "@/lib/patrimonio";
import type { Projeto } from "@/lib/objetivos";

export async function carregarObjetivos(familiaId: string) {
  const supabase = await criarClienteServidor();
  const [{ data: config }, { data: ativos }, { data: projetos }, dash] = await Promise.all([
    supabase.from("objetivos_config").select("liberdade_meta, liberdade_retorno_real_am, liberdade_prazo_anos, reserva_meses").eq("familia_id", familiaId).maybeSingle(),
    supabase
      .from("ativos")
      .select("id, nome, categoria, instituicao, valor, conta_liberdade, consorcio_prazo_meses, consorcio_parcelas_pagas, consorcio_parcela_mensal, consorcio_contemplado")
      .eq("familia_id", familiaId)
      .order("valor", { ascending: false }),
    supabase.from("projetos").select("id, nome, valor_alvo, ja_guardado, prazo_mes, ativo_id").eq("familia_id", familiaId).order("prazo_mes"),
    carregarDashboard(familiaId),
  ]);

  const lista = (ativos ?? []).map((a) => ({
    ...a,
    valor: Number(a.valor),
    consorcio_parcela_mensal: a.consorcio_parcela_mensal === null ? null : Number(a.consorcio_parcela_mensal),
  })) as (Pick<Ativo, "id" | "nome" | "categoria" | "instituicao" | "valor" | "consorcio_prazo_meses" | "consorcio_parcelas_pagas" | "consorcio_parcela_mensal" | "consorcio_contemplado"> & {
    conta_liberdade: boolean | null;
  })[];
  const n = dash.dfc.meses.length;
  const premissas = {
    liberdade_meta: config?.liberdade_meta === null || config?.liberdade_meta === undefined ? null : Number(config.liberdade_meta),
    liberdade_retorno_real_am: Number(config?.liberdade_retorno_real_am ?? 0.4),
    liberdade_prazo_anos: config?.liberdade_prazo_anos ?? 20,
    reserva_meses: config?.reserva_meses ?? 6,
  };
  return {
    premissas,
    ativos: lista,
    projetos: ((projetos ?? []) as Projeto[]).map((p) => ({ ...p, valor_alvo: Number(p.valor_alvo), ja_guardado: Number(p.ja_guardado) })),
    reserva: {
      saldo: lista.filter((a) => a.categoria === "Reserva").reduce((s, a) => s + a.valor, 0),
      meta: metaDaReserva(dash.dfc, premissas.reserva_meses),
      despesaBasicaMensal: n ? dash.dfc.total.previsto["Despesa básica"] / n : 0,
    },
  };
}

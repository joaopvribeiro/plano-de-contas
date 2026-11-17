"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { CATEGORIAS_ATIVO } from "@/lib/patrimonio";
import { hojeISO } from "@/lib/format";
import { situacaoIA } from "@/lib/importacao/consultas";
import { lerRelatorioComIA } from "@/lib/importacao/ia";
import { apagarArquivos, BUCKET } from "@/lib/importacao/arquivos";
import { carregarRevisaoRelatorio } from "@/lib/relatorio/consultas";

const MAX_BYTES = 20 * 1024 * 1024;

export async function criarImportacaoRelatorio(arquivo: { nome: string; tamanho: number }): Promise<{ erro?: string; id?: string; caminho?: string }> {
  const { familia, ctx } = await obterFamiliaAtiva();
  if (!/\.pdf$/i.test(arquivo.nome)) return { erro: "Envie o relatório em PDF." };
  if (arquivo.tamanho > MAX_BYTES) return { erro: "O PDF passa de 20 MB." };

  const s = await situacaoIA(familia.id);
  if (!s.consentimento) return { erro: "Antes, autorize o uso de IA nesta família (em Lançamentos → Importar extrato)." };
  if (!s.disponivel) return { erro: "A leitura com IA ainda não foi configurada." };
  if (s.restantes <= 0) return { erro: `O limite de ${s.limite} leituras com IA neste mês acabou.` };

  const supabase = await criarClienteServidor();
  const { data: imp, error } = await supabase
    .from("importacoes")
    .insert({ familia_id: familia.id, tipo: "relatorio", status: "lendo", criado_por: ctx.usuario.id, nomes_arquivos: [arquivo.nome.slice(0, 200)] })
    .select("id")
    .single();
  if (error || !imp) return { erro: "Não foi possível iniciar a importação." };
  const caminho = `${familia.id}/relatorios/${imp.id}/1.pdf`;
  await supabase.from("importacoes").update({ arquivos: [caminho] }).eq("id", imp.id);
  return { id: imp.id, caminho };
}

export async function processarRelatorio(id: string): Promise<{ erro?: string }> {
  const { familia } = await obterFamiliaAtiva();
  if (!z.uuid().safeParse(id).success) return { erro: "Importação inválida." };
  const supabase = await criarClienteServidor();
  const { data: imp } = await supabase
    .from("importacoes")
    .select("id, status, arquivos")
    .eq("familia_id", familia.id)
    .eq("tipo", "relatorio")
    .eq("id", id)
    .maybeSingle();
  if (!imp) return { erro: "Importação não encontrada." };
  if (imp.status !== "lendo") return {};

  const s = await situacaoIA(familia.id);
  if (!s.consentimento) return { erro: "Antes, autorize o uso de IA nesta família." };
  if (s.restantes <= 0) return falhar(id, "O limite de leituras com IA neste mês acabou.");

  const { data: arquivo, error } = await supabase.storage.from(BUCKET).download(imp.arquivos[0] ?? "");
  if (error || !arquivo) return falhar(id, "Não encontrei o arquivo enviado. Descarte e envie de novo.");

  const r = await lerRelatorioComIA(new Uint8Array(await arquivo.arrayBuffer()));
  if (r.uso)
    await supabase.rpc("registrar_uso_ia", {
      p_familia: familia.id,
      p_recurso: "relatorio",
      p_modelo: r.uso.modelo,
      p_tokens_entrada: r.uso.entrada,
      p_tokens_saida: r.uso.saida,
    });
  if (!r.rel) return falhar(id, r.erro ?? "Não foi possível ler o relatório.");
  if (!r.rel.posicoes.length) return falhar(id, r.rel.avisos[0] ?? "Não encontrei posições no relatório.");

  const { error: e2 } = await supabase
    .from("importacoes")
    .update({ status: "revisao", resposta_ia: { relatorio: r.rel }, origem_detectada: r.rel.instituicao?.slice(0, 80) ?? null })
    .eq("id", id);
  if (e2) return { erro: "Não foi possível guardar a leitura." };
  revalidatePath("/patrimonio/importar");
  return {};
}

async function falhar(id: string, erro: string) {
  const supabase = await criarClienteServidor();
  await supabase.from("importacoes").update({ resposta_ia: { erro } }).eq("id", id);
  return { erro };
}

const esquemaConfirmacao = z.object({
  id: z.uuid(),
  data_referencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  linhas: z
    .array(
      z.object({
        idx: z.number().int().min(0),
        incluir: z.boolean(),
        ativo_id: z.uuid().nullable(),
        categoria: z.enum(CATEGORIAS_ATIVO),
        nome: z.string().trim().min(1).max(120),
      }),
    )
    .max(500),
  zerar: z.array(z.uuid()).max(500),
});

export async function confirmarRelatorio(entrada: z.input<typeof esquemaConfirmacao>): Promise<{ erro?: string; atualizados?: number; criados?: number; zerados?: number }> {
  const { familia } = await obterFamiliaAtiva();
  const p = esquemaConfirmacao.safeParse(entrada);
  if (!p.success) return { erro: "Dados da revisão inválidos. Recarregue a página." };
  if (p.data.data_referencia > hojeISO()) return { erro: "A data de referência não pode estar no futuro." };

  const rev = await carregarRevisaoRelatorio(familia.id, p.data.id);
  if (!rev) return { erro: "Importação não encontrada." };
  if (rev.importacao.status !== "revisao") return { erro: "Esta importação já foi confirmada ou descartada." };

  const idsValidos = new Set(rev.existentes.map((a) => a.id));
  const porIdx = new Map(rev.linhas.map((l) => [l.idx, l]));
  const usados = new Set<string>();
  const atualizar: Record<string, unknown>[] = [];
  const criar: Record<string, unknown>[] = [];

  for (const e of p.data.linhas) {
    const base = porIdx.get(e.idx);
    if (!base) return { erro: "A revisão mudou. Recarregue a página." };
    if (!e.incluir) continue;
    if (e.categoria === "Consórcio") return { erro: `"${e.nome}": consórcio não vem de relatório de investimentos.` };
    const comum = {
      categoria: e.categoria,
      produto: base.produto,
      valor: base.valor,
      valor_liquido: base.valor_liquido,
      liquidez: base.liquidez,
      risco: base.risco,
      chave_relatorio: base.chave,
    };
    if (e.ativo_id) {
      if (!idsValidos.has(e.ativo_id)) return { erro: "Ativo inválido. Recarregue a página." };
      if (usados.has(e.ativo_id)) return { erro: "Duas posições estão atualizando o mesmo ativo. Escolha um ativo para cada uma." };
      usados.add(e.ativo_id);
      atualizar.push({ id: e.ativo_id, ...comum });
    } else {
      criar.push({ nome: e.nome, instituicao: rev.instituicao, ...comum });
    }
  }
  const zerar = p.data.zerar.filter((id) => idsValidos.has(id) && !usados.has(id));
  if (!atualizar.length && !criar.length) return { erro: "Marque ao menos uma posição, ou descarte a importação." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("confirmar_relatorio", {
    p_importacao: p.data.id,
    p_data: p.data.data_referencia,
    p_atualizar: atualizar,
    p_criar: criar,
    p_zerar: zerar,
  });
  if (error) {
    console.error("[relatorio] confirmar", error.message);
    return { erro: "Não foi possível gravar as posições. Nada foi gravado; tente de novo." };
  }
  await apagarArquivos(p.data.id, rev.importacao.arquivos);
  revalidatePath("/patrimonio", "layout");
  revalidatePath("/dashboard");
  return { atualizados: atualizar.length, criados: criar.length, zerados: zerar.length };
}

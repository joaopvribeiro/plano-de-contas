"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { lerValorBRL } from "@/lib/lancamentos/regras-de-negocio";
import { mesAtual, somarMeses } from "@/lib/format";
import { CATEGORIA_DO_TIPO, DESTAQUES, PERIODICIDADES, ROTULO_TIPO, TIPOS_APOLICE, premioMensal } from "@/lib/apolices/modelo";
import { situacaoIA } from "@/lib/importacao/consultas";
import { lerApoliceComIA } from "@/lib/importacao/ia";
import { formatoDoArquivo } from "@/lib/importacao/tipos";
import { BUCKET } from "@/lib/importacao/arquivos";

export type Resultado = { erro?: string; erros?: Record<string, string>; ok?: string; id?: string };

function revalidar() {
  revalidatePath("/protecoes", "layout");
}

// ---------------------------------------------------------------------------
// Salvar (manual, edição ou revisão da leitura)
// ---------------------------------------------------------------------------

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const data = z
  .string()
  .transform((v) => v || null)
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").nullable())
  .optional();

const esquema = z
  .object({
    id: z.uuid().optional(),
    importacao_id: z.uuid().optional(),
    tipo: z.enum(TIPOS_APOLICE),
    seguradora: texto(80),
    produto: texto(120),
    segurado: texto(120),
    premio: z.string().transform((v, ctx) => {
      if (!v.trim()) return null;
      const n = lerValorBRL(v);
      if (n === null || n < 0) ctx.addIssue({ code: "custom", message: "Valor inválido (ex.: 1.234,56)." });
      return n;
    }),
    periodicidade: z.enum(PERIODICIDADES),
    vigencia_inicio: data,
    vigencia_fim: data,
    destaques: z.record(z.string(), z.string().max(200)),
    carencias: z.array(z.string().max(300)).max(20),
    exclusoes: z.array(z.string().max(300)).max(20),
    como_acionar: texto(1000),
    resumo: texto(1000),
  })
  .refine((a) => !a.vigencia_inicio || !a.vigencia_fim || a.vigencia_fim >= a.vigencia_inicio, {
    path: ["vigencia_fim"],
    message: "O fim da vigência vem antes do início.",
  });

export async function salvarApolice(entrada: z.input<typeof esquema>): Promise<Resultado> {
  const { familia } = await obterFamiliaAtiva();
  const p = esquema.safeParse(entrada);
  if (!p.success) {
    const erros: Record<string, string> = {};
    for (const i of p.error.issues) erros[String(i.path[0] ?? "geral")] ??= i.message;
    return { erros, erro: "Confira os campos destacados." };
  }
  const { id, importacao_id, ...a } = p.data;
  const permitidas = new Set(DESTAQUES[a.tipo]);
  const dados = {
    ...a,
    vigencia_inicio: a.vigencia_inicio ?? null,
    vigencia_fim: a.vigencia_fim ?? null,
    destaques: Object.fromEntries(Object.entries(a.destaques).filter(([k, v]) => permitidas.has(k) && v.trim()).map(([k, v]) => [k, v.trim()])),
    carencias: a.carencias.map((x) => x.trim()).filter(Boolean),
    exclusoes: a.exclusoes.map((x) => x.trim()).filter(Boolean),
  };
  const supabase = await criarClienteServidor();

  if (id) {
    const { error } = await supabase.from("apolices").update(dados).eq("familia_id", familia.id).eq("id", id);
    if (error) return { erro: "Não foi possível salvar a apólice." };
    revalidar();
    return { id };
  }

  let arquivo: string | null = null;
  if (importacao_id) {
    const { data: imp } = await supabase
      .from("importacoes")
      .select("arquivos, status")
      .eq("familia_id", familia.id)
      .eq("tipo", "apolice")
      .eq("id", importacao_id)
      .maybeSingle();
    if (!imp || imp.status !== "revisao") return { erro: "Esta leitura já foi salva ou descartada." };
    arquivo = imp.arquivos[0] ?? null;
  }
  const { data: nova, error } = await supabase
    .from("apolices")
    .insert({ ...dados, familia_id: familia.id, origem: importacao_id ? "ia" : "manual", arquivo, importacao_id: importacao_id ?? null })
    .select("id")
    .single();
  if (error || !nova) return { erro: "Não foi possível salvar a apólice." };
  if (importacao_id) await supabase.from("importacoes").update({ status: "confirmada" }).eq("id", importacao_id);
  revalidar();
  return { id: nova.id };
}

export async function excluirApolice(id: string): Promise<Resultado> {
  const { familia } = await obterFamiliaAtiva();
  if (!z.uuid().safeParse(id).success) return { erro: "Apólice inválida." };
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("apolices").delete().eq("familia_id", familia.id).eq("id", id).select("importacao_id").maybeSingle();
  if (!data) return { erro: "Não foi possível excluir." };
  // O arquivo original sai junto (todas as páginas enviadas).
  if (data.importacao_id) {
    const { data: imp } = await supabase.from("importacoes").select("arquivos").eq("id", data.importacao_id).maybeSingle();
    if (imp?.arquivos.length) await supabase.storage.from(BUCKET).remove(imp.arquivos);
  }
  revalidar();
  return {};
}

/** Link temporário (5 minutos) para o arquivo original. */
export async function linkDoArquivo(id: string): Promise<{ url?: string; erro?: string }> {
  const { familia } = await obterFamiliaAtiva();
  if (!z.uuid().safeParse(id).success) return { erro: "Apólice inválida." };
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("apolices").select("arquivo").eq("familia_id", familia.id).eq("id", id).maybeSingle();
  if (!data?.arquivo) return { erro: "Esta apólice não tem arquivo." };
  const { data: link, error } = await supabase.storage.from(BUCKET).createSignedUrl(data.arquivo, 300);
  if (error || !link) return { erro: "Não foi possível abrir o arquivo." };
  return { url: link.signedUrl };
}

// ---------------------------------------------------------------------------
// Leitura com IA
// ---------------------------------------------------------------------------

export async function criarImportacaoApolice(arquivos: { nome: string; tamanho: number; tipo: string }[]): Promise<{ erro?: string; id?: string; caminhos?: string[] }> {
  const { familia, ctx } = await obterFamiliaAtiva();
  if (!arquivos.length || arquivos.length > 3) return { erro: "Envie de 1 a 3 arquivos." };
  const formatos = arquivos.map((a) => formatoDoArquivo(a.nome, a.tipo));
  if (formatos.some((f) => f !== "pdf" && f !== "imagem")) return { erro: "Use PDF ou fotos (JPG, PNG ou WEBP)." };
  if (formatos.filter((f) => f === "pdf").length > 1 || (formatos.includes("pdf") && arquivos.length > 1)) return { erro: "Envie um PDF ou até 3 fotos das páginas." };
  for (const [i, a] of arquivos.entries()) if (a.tamanho > (formatos[i] === "imagem" ? 5 : 20) * 1024 * 1024) return { erro: `"${a.nome}" é grande demais.` };

  const s = await situacaoIA(familia.id, "apolice");
  if (!s.consentimento) return { erro: "Antes, autorize o uso de IA nesta família." };
  if (!s.disponivel) return { erro: "A leitura com IA ainda não foi configurada. Cadastre a apólice à mão por enquanto." };
  if (s.restantes <= 0) return { erro: `O limite de ${s.limite} leituras de apólice neste mês acabou. Cadastre à mão ou fale com seu consultor.` };

  const supabase = await criarClienteServidor();
  const { data: imp, error } = await supabase
    .from("importacoes")
    .insert({ familia_id: familia.id, tipo: "apolice", status: "lendo", criado_por: ctx.usuario.id, nomes_arquivos: arquivos.map((a) => a.nome.slice(0, 200)) })
    .select("id")
    .single();
  if (error || !imp) return { erro: "Não foi possível iniciar a leitura." };
  const caminhos = arquivos.map((a, i) => `${familia.id}/apolices/${imp.id}/${i + 1}.${(a.nome.split(".").pop() ?? "pdf").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5)}`);
  await supabase.from("importacoes").update({ arquivos: caminhos }).eq("id", imp.id);
  return { id: imp.id, caminhos };
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", pdf: "application/pdf" };

export async function processarApolice(id: string): Promise<{ erro?: string }> {
  const { familia } = await obterFamiliaAtiva();
  if (!z.uuid().safeParse(id).success) return { erro: "Leitura inválida." };
  const supabase = await criarClienteServidor();
  const { data: imp } = await supabase.from("importacoes").select("status, arquivos").eq("familia_id", familia.id).eq("tipo", "apolice").eq("id", id).maybeSingle();
  if (!imp) return { erro: "Leitura não encontrada." };
  if (imp.status !== "lendo") return {};
  const s = await situacaoIA(familia.id, "apolice");
  if (!s.consentimento) return { erro: "Antes, autorize o uso de IA nesta família." };
  if (s.restantes <= 0) return falhar(id, "O limite de leituras de apólice neste mês acabou.");

  const arquivos = [];
  for (const caminho of imp.arquivos) {
    const { data, error } = await supabase.storage.from(BUCKET).download(caminho);
    if (error || !data) return falhar(id, "Não encontrei o arquivo enviado. Descarte e envie de novo.");
    const ext = caminho.split(".").pop() ?? "";
    arquivos.push({ formato: ext === "pdf" ? ("pdf" as const) : ("imagem" as const), tipoMime: MIME[ext] ?? "image/jpeg", bytes: new Uint8Array(await data.arrayBuffer()) });
  }
  const r = await lerApoliceComIA(arquivos);
  if (r.uso)
    await supabase.rpc("registrar_uso_ia", { p_familia: familia.id, p_recurso: "apolice", p_modelo: r.uso.modelo, p_tokens_entrada: r.uso.entrada, p_tokens_saida: r.uso.saida });
  if (!r.apolice) return falhar(id, r.erro ?? "Não foi possível ler a apólice.");
  const { error } = await supabase.from("importacoes").update({ status: "revisao", resposta_ia: { apolice: r.apolice } }).eq("id", id);
  if (error) return { erro: "Não foi possível guardar a leitura." };
  revalidar();
  return {};
}

async function falhar(id: string, erro: string) {
  const supabase = await criarClienteServidor();
  await supabase.from("importacoes").update({ resposta_ia: { erro } }).eq("id", id);
  return { erro };
}

// ---------------------------------------------------------------------------
// Prêmio no orçamento (consultor)
// ---------------------------------------------------------------------------

export async function incluirPremioNoOrcamento(id: string): Promise<Resultado> {
  const { familia } = await obterFamiliaAtiva();
  if (!familia.consultor) return { erro: "Só o consultor altera o orçamento previsto." };
  if (!z.uuid().safeParse(id).success) return { erro: "Apólice inválida." };
  const supabase = await criarClienteServidor();
  const [{ data: a }, { data: fam }, { data: categorias }] = await Promise.all([
    supabase.from("apolices").select("tipo, seguradora, premio, periodicidade, vigencia_inicio, vigencia_fim").eq("familia_id", familia.id).eq("id", id).maybeSingle(),
    supabase.from("familias").select("inicio_planejamento, meses_horizonte").eq("id", familia.id).single(),
    supabase.from("categorias").select("id, nome, classe_padrao").eq("familia_id", familia.id).eq("arquivada", false),
  ]);
  if (!a || !fam) return { erro: "Apólice não encontrada." };
  const mensal = premioMensal(a.premio === null ? null : Number(a.premio), a.periodicidade);
  if (!mensal) return { erro: "Prêmio único ou sem valor: não entra no orçamento mensal." };
  const categoria = categorias?.find((c) => c.nome === CATEGORIA_DO_TIPO[a.tipo as keyof typeof CATEGORIA_DO_TIPO]) ?? categorias?.find((c) => c.classe_padrao === "Despesa básica");
  if (!categoria) return { erro: "Crie antes uma categoria de despesa básica." };

  const inicioHorizonte = fam.inicio_planejamento;
  const fimHorizonte = somarMeses(fam.inicio_planejamento, fam.meses_horizonte - 1);
  const de = [mesAtual(), inicioHorizonte, a.vigencia_inicio?.slice(0, 7) ?? ""].sort().at(-1)!;
  const ate = [fimHorizonte, a.vigencia_fim?.slice(0, 7) ?? fimHorizonte].sort()[0];
  const meses: string[] = [];
  for (let m = de; m <= ate; m = somarMeses(m, 1)) meses.push(m);
  if (!meses.length) return { erro: "A vigência fica fora do horizonte do planejamento." };

  const descricao = `Seguro: ${a.seguradora ?? ROTULO_TIPO[a.tipo as keyof typeof ROTULO_TIPO]}`.slice(0, 200);
  const { data: existentes } = await supabase
    .from("lancamentos")
    .select("mes_competencia")
    .eq("familia_id", familia.id)
    .eq("tipo", "Previsto")
    .eq("descricao", descricao)
    .in("mes_competencia", meses);
  const ja = new Set((existentes ?? []).map((e) => e.mes_competencia));
  const novos = meses
    .filter((m) => !ja.has(m))
    .map((m) => ({
      familia_id: familia.id,
      tipo: "Previsto",
      natureza: "fluxo",
      mes_competencia: m,
      descricao,
      valor: mensal,
      categoria_id: categoria.id,
      classe: "Despesa básica",
      assinatura: true,
      origem: "manual",
    }));
  if (!novos.length) return { ok: "O prêmio já estava no orçamento em todos os meses." };
  const { error } = await supabase.from("lancamentos").insert(novos);
  if (error) return { erro: "Não foi possível incluir no orçamento." };
  revalidatePath("/lancamentos");
  revalidatePath("/dashboard");
  return { ok: `Prêmio de ${mensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} incluído em ${novos.length} mês(es) do orçamento (${categoria.nome}).` };
}

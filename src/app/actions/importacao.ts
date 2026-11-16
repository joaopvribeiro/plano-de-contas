"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterFamiliaAtiva } from "@/lib/sessao";
import { CLASSES, NATUREZAS } from "@/lib/dominio";
import { normalizarDescricao, regraParaDescricao, sugerirPadrao } from "@/lib/lancamentos/regras-de-negocio";
import { lerOFX } from "@/lib/importacao/ofx";
import { lerCSVBanco } from "@/lib/importacao/csv-banco";
import { categorizarComIA, lerDocumentoComIA, type UsoIA } from "@/lib/importacao/ia";
import { decodificarTexto, formatoDoArquivo, type DocumentoLido } from "@/lib/importacao/tipos";
import { editarLinha, parcelasFuturas, pendenciaDaLinha } from "@/lib/importacao/revisao";
import { carregarRevisao, VERSAO_CONSENTIMENTO_IA, situacaoIA } from "@/lib/importacao/consultas";

const BUCKET = "familias";
const MAX_ARQUIVOS = 4;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_BYTES_IMAGEM = 5 * 1024 * 1024;

function revalidar() {
  revalidatePath("/lancamentos", "layout");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Consentimento
// ---------------------------------------------------------------------------

export async function consentirIA(): Promise<{ erro?: string }> {
  const { familia, ctx } = await obterFamiliaAtiva();
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("consentimentos")
    .upsert(
      { user_id: ctx.usuario.id, familia_id: familia.id, tipo: "ia", versao: VERSAO_CONSENTIMENTO_IA },
      { onConflict: "user_id,familia_id,tipo,versao", ignoreDuplicates: true },
    );
  if (error) return { erro: "Não foi possível registrar a autorização." };
  revalidatePath("/lancamentos/importar");
  return {};
}

// ---------------------------------------------------------------------------
// 1. Criar a importação (antes de enviar os arquivos)
// ---------------------------------------------------------------------------

const esquemaNovo = z.object({
  conta_id: z.uuid("Escolha a conta ou o cartão."),
  arquivos: z
    .array(z.object({ nome: z.string().min(1).max(200), tamanho: z.number().int().positive(), tipo: z.string().max(100) }))
    .min(1, "Escolha ao menos um arquivo.")
    .max(MAX_ARQUIVOS, `Envie no máximo ${MAX_ARQUIVOS} arquivos por vez.`),
});

export type NovaImportacao = { erro?: string; id?: string; caminhos?: string[] };

export async function criarImportacao(entrada: z.input<typeof esquemaNovo>): Promise<NovaImportacao> {
  const { familia, ctx } = await obterFamiliaAtiva();
  const p = esquemaNovo.safeParse(entrada);
  if (!p.success) return { erro: p.error.issues[0].message };
  const { conta_id, arquivos } = p.data;

  const formatos = arquivos.map((a) => formatoDoArquivo(a.nome, a.tipo));
  if (formatos.some((f) => !f)) return { erro: "Formato não aceito. Use PDF, foto (JPG, PNG ou WEBP), OFX ou CSV." };
  const comIA = formatos.every((f) => f === "pdf" || f === "imagem");
  const semIA = formatos.every((f) => f === "ofx" || f === "csv");
  if (!comIA && !semIA) return { erro: "Envie PDFs e fotos juntos, ou um OFX/CSV sozinho." };
  if (semIA && arquivos.length > 1) return { erro: "Envie um arquivo OFX ou CSV por vez." };
  for (const [i, a] of arquivos.entries()) {
    const limite = formatos[i] === "imagem" ? MAX_BYTES_IMAGEM : MAX_BYTES;
    if (a.tamanho > limite) return { erro: `"${a.nome}" passa de ${limite / 1024 / 1024} MB.` };
  }

  const supabase = await criarClienteServidor();
  const { data: conta } = await supabase.from("contas").select("id, ativa").eq("familia_id", familia.id).eq("id", conta_id).maybeSingle();
  if (!conta?.ativa) return { erro: "Conta não encontrada." };

  if (comIA) {
    const s = await situacaoIA(familia.id);
    if (!s.consentimento) return { erro: "Antes, autorize o uso de IA nesta família." };
    if (!s.disponivel) return { erro: "A leitura com IA ainda não foi configurada. Use OFX ou CSV por enquanto." };
    if (s.restantes <= 0) return { erro: `O limite de ${s.limite} leituras com IA neste mês acabou. Use OFX ou CSV, ou fale com seu consultor.` };
  }

  const { data: imp, error } = await supabase
    .from("importacoes")
    .insert({ familia_id: familia.id, conta_id, status: "lendo", criado_por: ctx.usuario.id, nomes_arquivos: arquivos.map((a) => a.nome) })
    .select("id")
    .single();
  if (error || !imp) return { erro: "Não foi possível iniciar a importação." };

  // Caminho sem o nome original: <familia>/extratos/<importacao>/<n>.<ext>
  const caminhos = arquivos.map((a, i) => {
    const ext = (a.nome.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    return `${familia.id}/extratos/${imp.id}/${i + 1}.${ext}`;
  });
  await supabase.from("importacoes").update({ arquivos: caminhos }).eq("id", imp.id);
  return { id: imp.id, caminhos };
}

// ---------------------------------------------------------------------------
// 2. Ler os arquivos (depois do envio)
// ---------------------------------------------------------------------------

const TIPO_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", pdf: "application/pdf" };

export async function processarImportacao(id: string): Promise<{ erro?: string }> {
  const { familia } = await obterFamiliaAtiva();
  if (!z.uuid().safeParse(id).success) return { erro: "Importação inválida." };
  const supabase = await criarClienteServidor();

  const { data: imp } = await supabase
    .from("importacoes")
    .select("id, status, arquivos, conta_id, contas(nome, tipo)")
    .eq("familia_id", familia.id)
    .eq("id", id)
    .maybeSingle();
  if (!imp) return { erro: "Importação não encontrada." };
  if (imp.status !== "lendo") return {};
  const conta = imp.contas as unknown as { nome: string; tipo: string } | null;
  if (!conta || !imp.arquivos.length) return { erro: "Importação incompleta. Descarte e envie de novo." };
  const ehCartao = conta.tipo === "cartao_credito";

  const arquivos: { caminho: string; formato: ReturnType<typeof formatoDoArquivo>; bytes: Uint8Array }[] = [];
  for (const caminho of imp.arquivos) {
    const { data, error } = await supabase.storage.from(BUCKET).download(caminho);
    if (error || !data) return { erro: "Não encontrei o arquivo enviado. Descarte e envie de novo." };
    arquivos.push({ caminho, formato: formatoDoArquivo(caminho), bytes: new Uint8Array(await data.arrayBuffer()) });
  }

  const [{ data: categorias }, { data: regras }] = await Promise.all([
    supabase.from("categorias").select("nome").eq("familia_id", familia.id).eq("arquivada", false).order("ordem"),
    supabase.from("regras").select("padrao, natureza, categoria_id, classe, assinatura").eq("familia_id", familia.id),
  ]);
  const nomesCategorias = (categorias ?? []).map((c) => c.nome);

  let doc: DocumentoLido;
  let origem: "ofx" | "csv" | "ia";
  let uso: UsoIA | undefined;
  const situacao = await situacaoIA(familia.id);

  if (arquivos[0].formato === "ofx" || arquivos[0].formato === "csv") {
    const texto = decodificarTexto(arquivos[0].bytes);
    origem = arquivos[0].formato;
    const lido = origem === "ofx" ? lerOFX(texto) : lerCSVBanco(texto, ehCartao);
    if ("erro" in lido) return falhar(id, lido.erro);
    doc = lido;
    // IA só sugere categoria para o que nenhuma regra cobre, e só com autorização e limite.
    if (situacao.consentimento && situacao.disponivel && situacao.restantes > 0) {
      const semRegra = doc.itens.map((x, i) => ({ x, i })).filter(({ x }) => !regraParaDescricao(x.descricao, regras ?? []));
      if (semRegra.length) {
        const r = await categorizarComIA({ ...doc, itens: semRegra.map(({ x }) => x) }, nomesCategorias);
        uso = r.uso;
        const itens = [...doc.itens];
        semRegra.forEach(({ i }, j) => (itens[i] = r.doc.itens[j]));
        doc = { ...doc, itens, avisos: r.erro ? [...doc.avisos, `Sugestões da IA indisponíveis: ${r.erro}`] : doc.avisos };
      }
    }
  } else {
    if (!situacao.consentimento) return { erro: "Antes, autorize o uso de IA nesta família." };
    if (situacao.restantes <= 0) return falhar(id, "O limite de leituras com IA neste mês acabou.");
    origem = "ia";
    const r = await lerDocumentoComIA(
      arquivos.map((a) => {
        const ext = a.caminho.split(".").pop() ?? "";
        return { formato: a.formato === "pdf" ? "pdf" : "imagem", tipoMime: TIPO_MIME[ext] ?? "image/jpeg", bytes: a.bytes };
      }),
      nomesCategorias,
      { conta: conta.nome, ehCartao },
    );
    // A leitura conta no limite mesmo quando falha depois de chegar à IA.
    if (r.uso) await registrarUso(familia.id, r.uso);
    if (!r.doc) return falhar(id, r.erro ?? "Não foi possível ler o documento.");
    doc = r.doc;
  }
  if (origem !== "ia" && uso) await registrarUso(familia.id, uso);

  if (!doc.itens.length) return falhar(id, doc.avisos[0] ?? "Não encontrei transações no documento.");
  if (doc.tipo === "fatura_cartao" && !ehCartao) doc.avisos.push(`O documento parece uma fatura de cartão, mas foi enviado para "${conta.nome}". Confira a conta antes de confirmar.`);
  if (doc.tipo === "extrato_conta" && ehCartao) doc.avisos.push(`O documento parece um extrato de conta, mas foi enviado para o cartão "${conta.nome}". Confira antes de confirmar.`);

  const { error } = await supabase
    .from("importacoes")
    .update({
      status: "revisao",
      resposta_ia: { origem, documento: doc },
      origem_detectada: doc.banco?.slice(0, 80) ?? null,
      fechamento: doc.fechamento,
      vencimento: doc.vencimento,
    })
    .eq("id", id);
  if (error) return { erro: "Não foi possível guardar a leitura." };
  revalidatePath("/lancamentos/importar");
  return {};
}

async function registrarUso(familiaId: string, uso: UsoIA) {
  const supabase = await criarClienteServidor();
  await supabase.rpc("registrar_uso_ia", {
    p_familia: familiaId,
    p_recurso: "extrato",
    p_modelo: uso.modelo,
    p_tokens_entrada: uso.entrada,
    p_tokens_saida: uso.saida,
  });
}

async function falhar(id: string, erro: string) {
  const supabase = await criarClienteServidor();
  await supabase.from("importacoes").update({ resposta_ia: { erro } }).eq("id", id);
  return { erro };
}

// ---------------------------------------------------------------------------
// 3. Confirmar ou descartar
// ---------------------------------------------------------------------------

const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const esquemaConfirmacao = z.object({
  id: z.uuid(),
  linhas: z
    .array(
      z.object({
        idx: z.number().int().min(0),
        incluir: z.boolean(),
        natureza: z.enum(NATUREZAS),
        categoria_id: z.uuid().nullable(),
        classe: z.enum(CLASSES).nullable(),
        mes_competencia: mes,
        criar_futuras: z.boolean(),
        criar_regra: z.boolean().default(false),
      }),
    )
    .max(2000),
});

export async function confirmarImportacao(entrada: z.input<typeof esquemaConfirmacao>): Promise<{ erro?: string; gravados?: number; futuras?: number; regras?: number }> {
  const { familia } = await obterFamiliaAtiva();
  const p = esquemaConfirmacao.safeParse(entrada);
  if (!p.success) return { erro: "Dados da revisão inválidos. Recarregue a página." };

  const rev = await carregarRevisao(familia.id, p.data.id, familia.consultor);
  if (!rev) return { erro: "Importação não encontrada." };
  if (rev.importacao.status !== "revisao") return { erro: "Esta importação já foi confirmada ou descartada." };

  const categorias = rev.categorias.filter((c) => !c.arquivada);
  const idsCategorias = new Set(categorias.map((c) => c.id));
  const porIdx = new Map(rev.linhas.map((l) => [l.idx, l]));
  const lancamentos: Record<string, unknown>[] = [];
  const vinculos: { previsto_id: string; realizado_id: string; grupo_parcela: string }[] = [];
  const regras = new Map<string, { padrao: string; natureza: string; categoria_id: string | null; classe: string | null }>();
  let futuras = 0;

  for (const e of p.data.linhas) {
    const base = porIdx.get(e.idx);
    if (!base) return { erro: "A revisão mudou. Recarregue a página." };
    if (e.categoria_id && !idsCategorias.has(e.categoria_id)) return { erro: "Categoria inválida. Recarregue a página." };
    const l = editarLinha(
      base,
      { incluir: e.incluir, natureza: e.natureza, categoria_id: e.categoria_id, classe: e.classe, mes_competencia: e.mes_competencia, criar_futuras: e.criar_futuras },
      categorias,
    );
    if (!l.incluir) continue;
    const pend = pendenciaDaLinha(l);
    if (pend) return { erro: `"${l.descricao}": ${pend.toLowerCase()}.` };

    const id = crypto.randomUUID();
    const grupo = l.parcela ? (l.vinculo?.grupo_parcela ?? crypto.randomUUID()) : null;
    const comum = {
      natureza: l.natureza,
      categoria_id: l.categoria_id,
      classe: l.classe,
      assinatura: l.assinatura,
      estorno: l.estorno,
    };
    lancamentos.push({
      ...comum,
      id,
      tipo: "Realizado",
      mes_competencia: l.mes_competencia,
      data: l.data,
      descricao: l.descricao.slice(0, 200),
      valor: l.valor,
      parcela: l.parcela,
      grupo_parcela: grupo,
      origem: "ia",
    });
    if (l.vinculo) vinculos.push({ previsto_id: l.vinculo.previsto_id, realizado_id: id, grupo_parcela: l.vinculo.grupo_parcela });
    else if (l.parcela && l.criar_futuras) {
      for (const f of parcelasFuturas(l)) {
        lancamentos.push({ ...comum, id: crypto.randomUUID(), tipo: "Previsto", mes_competencia: f.mes_competencia, data: l.data, descricao: f.descricao, valor: f.valor, parcela: f.parcela, grupo_parcela: grupo, origem: "ia-parcela" });
        futuras++;
      }
    }
    if (e.criar_regra && l.sugestao === "manual") {
      const padrao = sugerirPadrao(l.descricao);
      if (padrao.length >= 2 && !regras.has(padrao)) regras.set(padrao, { padrao: normalizarDescricao(padrao), natureza: l.natureza, categoria_id: l.categoria_id, classe: l.classe });
    }
  }
  if (!lancamentos.length) return { erro: "Marque ao menos um lançamento, ou descarte a importação." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("confirmar_importacao", {
    p_importacao: p.data.id,
    p_lancamentos: lancamentos,
    p_vinculos: vinculos,
    p_regras: [...regras.values()],
  });
  if (error) {
    console.error("[importacao] confirmar", error.message);
    return { erro: "Não foi possível gravar os lançamentos. Nada foi gravado; tente de novo." };
  }
  await apagarArquivos(p.data.id, rev.importacao.arquivos);
  revalidar();
  return { gravados: lancamentos.length - futuras, futuras, regras: regras.size };
}

export async function descartarImportacao(id: string): Promise<{ erro?: string }> {
  const { familia } = await obterFamiliaAtiva();
  if (!z.uuid().safeParse(id).success) return { erro: "Importação inválida." };
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("importacoes")
    .update({ status: "descartada" })
    .eq("familia_id", familia.id)
    .eq("id", id)
    .in("status", ["lendo", "revisao"])
    .select("arquivos")
    .maybeSingle();
  if (!data) return { erro: "Importação não encontrada." };
  await apagarArquivos(id, data.arquivos);
  revalidatePath("/lancamentos/importar");
  return {};
}

/** Os arquivos originais saem do Storage assim que a importação é concluída ou descartada. */
async function apagarArquivos(id: string, caminhos: string[]) {
  if (!caminhos.length) return;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.storage.from(BUCKET).remove(caminhos);
  if (!error) await supabase.from("importacoes").update({ arquivos_expurgados_em: new Date().toISOString() }).eq("id", id);
}

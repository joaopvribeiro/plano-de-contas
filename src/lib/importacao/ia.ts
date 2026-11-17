import "server-only";
/**
 * Chamadas à API da Anthropic para ler extratos e faturas.
 *
 * - Documento (PDF ou fotos): vai inteiro para a IA, que devolve as transações.
 * - OFX e CSV: já são lidos sem IA; a IA só sugere categoria e natureza, e
 *   recebe apenas descrição, sentido e valor de cada linha (nada de conta,
 *   saldo ou nome do titular).
 *
 * IA_SIMULADA=1 troca a chamada por uma resposta fixa (testes automáticos e
 * ambiente sem chave). Na Vercel é ignorado.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  aplicarCategorizacao,
  esquemaCategorizacao,
  esquemaDocumento,
  instrucoesCategorizacao,
  instrucoesDocumento,
  interpretarDocumento,
} from "./ia-esquema";
import type { DocumentoLido } from "./tipos";
import { ESQUEMA_RELATORIO, INSTRUCOES_RELATORIO, interpretarRelatorio, type RelatorioLido } from "@/lib/relatorio/esquema";
import { RELATORIO_EXEMPLO } from "@/lib/relatorio/exemplo";
import { ESQUEMA_INSIGHTS, INSIGHTS_EXEMPLO, INSTRUCOES_INSIGHTS, interpretarInsights, type Observacao } from "@/lib/insights";
import { APOLICE_EXEMPLO, ESQUEMA_APOLICE, INSTRUCOES_APOLICE, interpretarApolice, type DadosApolice } from "@/lib/apolices/modelo";

export const MODELO_EXTRACAO = process.env.ANTHROPIC_MODEL_EXTRACAO || "claude-haiku-5-5";
export const MODELO_INSIGHTS = process.env.ANTHROPIC_MODEL_INSIGHTS || "claude-haiku-5-5";
const MAX_TOKENS = 32000;

export type UsoIA = { modelo: string; entrada: number; saida: number };
export type ArquivoParaIA = { formato: "pdf" | "imagem"; tipoMime: string; bytes: Uint8Array };

/** Modo simulado; ignorado na Vercel, para nunca gravar dados fictícios de uma família real. */
export function iaSimulada() {
  return process.env.IA_SIMULADA === "1" && !process.env.VERCEL;
}

export function iaDisponivel() {
  return iaSimulada() || Boolean(process.env.ANTHROPIC_API_KEY);
}

function cliente() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 280_000 });
}

function base64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

async function chamar(sistema: string, conteudo: Anthropic.ContentBlockParam[], esquema: Record<string, unknown>, modelo = MODELO_EXTRACAO, maxTokens = MAX_TOKENS) {
  const stream = cliente().messages.stream({
    model: modelo,
    max_tokens: maxTokens,
    system: sistema,
    messages: [{ role: "user", content: conteudo }],
    output_config: { format: { type: "json_schema", schema: esquema } },
  });
  const msg = await stream.finalMessage();
  const uso: UsoIA = { modelo, entrada: msg.usage.input_tokens, saida: msg.usage.output_tokens };
  if (msg.stop_reason === "max_tokens") return { uso, erro: "O documento é grande demais para uma leitura só. Envie menos páginas por vez." };
  if (msg.stop_reason === "refusal") return { uso, erro: "A leitura foi recusada para este arquivo." };
  const texto = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return { uso, json: JSON.parse(texto) as unknown };
  } catch {
    return { uso, erro: "A resposta da leitura veio incompleta. Tente de novo." };
  }
}

function mensagemDeErro(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    if (e.status === 401) return "A chave da IA não é válida. Avise o administrador.";
    if (e.status === 429) return "A IA está ocupada agora. Tente de novo em alguns minutos.";
    if (e.status === 413) return "O arquivo é grande demais para a IA.";
    if (e.status === 400) return "A IA não conseguiu abrir este arquivo. Confira se o PDF não tem senha.";
  }
  return "Não foi possível falar com a IA agora. Tente de novo em alguns minutos.";
}

/** Lê um documento (PDF ou fotos de um mesmo documento). */
export async function lerDocumentoComIA(
  arquivos: ArquivoParaIA[],
  categorias: string[],
  contexto: { conta: string; ehCartao: boolean },
): Promise<{ doc?: DocumentoLido; erro?: string; uso?: UsoIA }> {
  if (iaSimulada()) return { doc: documentoSimulado(contexto.ehCartao, categorias), uso: { modelo: "simulado", entrada: 0, saida: 0 } };
  if (!process.env.ANTHROPIC_API_KEY) return { erro: "A leitura com IA ainda não foi configurada (falta a chave da Anthropic)." };

  const conteudo: Anthropic.ContentBlockParam[] = arquivos.map((a) =>
    a.formato === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64(a.bytes) } }
      : {
          type: "image",
          source: { type: "base64", media_type: a.tipoMime as "image/png" | "image/jpeg" | "image/webp", data: base64(a.bytes) },
        },
  );
  conteudo.push({
    type: "text",
    text: arquivos.length > 1 ? "Os arquivos acima são partes do mesmo documento, em ordem. Liste as transações." : "Liste as transações do documento acima.",
  });

  try {
    const r = await chamar(instrucoesDocumento(categorias, contexto), conteudo, esquemaDocumento(categorias));
    if ("erro" in r && r.erro) return { erro: r.erro, uso: r.uso };
    const doc = interpretarDocumento(r.json, categorias);
    if ("erro" in doc) return { erro: doc.erro, uso: r.uso };
    return { doc, uso: r.uso };
  } catch (e) {
    console.error("[importacao] erro na IA", e instanceof Error ? e.message : e);
    return { erro: mensagemDeErro(e) };
  }
}

/** Sugere categoria e natureza para itens lidos de OFX/CSV. Em caso de erro, devolve os itens sem sugestão. */
export async function categorizarComIA(doc: DocumentoLido, categorias: string[]): Promise<{ doc: DocumentoLido; uso?: UsoIA; erro?: string }> {
  if (!doc.itens.length) return { doc };
  if (iaSimulada()) return { doc, uso: { modelo: "simulado", entrada: 0, saida: 0 } };
  if (!process.env.ANTHROPIC_API_KEY) return { doc };
  const lista = doc.itens.map((x, i) => ({ i, descricao: x.descricao, sentido: x.sentido, valor: x.valor }));
  try {
    const r = await chamar(instrucoesCategorizacao(categorias), [{ type: "text", text: JSON.stringify(lista) }], esquemaCategorizacao(categorias));
    if ("erro" in r && r.erro) return { doc, uso: r.uso, erro: r.erro };
    return { doc: aplicarCategorizacao(doc, r.json, categorias), uso: r.uso };
  } catch (e) {
    console.error("[importacao] erro na IA (categorização)", e instanceof Error ? e.message : e);
    return { doc, erro: mensagemDeErro(e) };
  }
}

/** Lê um relatório de investimentos (PDF). */
export async function lerRelatorioComIA(pdf: Uint8Array): Promise<{ rel?: RelatorioLido; erro?: string; uso?: UsoIA }> {
  if (iaSimulada()) return { rel: structuredClone(RELATORIO_EXEMPLO), uso: { modelo: "simulado", entrada: 0, saida: 0 } };
  if (!process.env.ANTHROPIC_API_KEY) return { erro: "A leitura com IA ainda não foi configurada (falta a chave da Anthropic)." };
  try {
    const r = await chamar(
      INSTRUCOES_RELATORIO,
      [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64(pdf) } },
        { type: "text", text: "Liste as posições do relatório acima." },
      ],
      ESQUEMA_RELATORIO,
    );
    if ("erro" in r && r.erro) return { erro: r.erro, uso: r.uso };
    const rel = interpretarRelatorio(r.json);
    if ("erro" in rel) return { erro: rel.erro, uso: r.uso };
    return { rel, uso: r.uso };
  } catch (e) {
    console.error("[relatorio] erro na IA", e instanceof Error ? e.message : e);
    return { erro: mensagemDeErro(e) };
  }
}

/** Lê uma apólice (PDF ou fotos das páginas). */
export async function lerApoliceComIA(arquivos: ArquivoParaIA[]): Promise<{ apolice?: DadosApolice & { avisos: string[] }; erro?: string; uso?: UsoIA }> {
  if (iaSimulada()) return { apolice: structuredClone(APOLICE_EXEMPLO), uso: { modelo: "simulado", entrada: 0, saida: 0 } };
  if (!process.env.ANTHROPIC_API_KEY) return { erro: "A leitura com IA ainda não foi configurada (falta a chave da Anthropic)." };
  const conteudo: Anthropic.ContentBlockParam[] = arquivos.map((a) =>
    a.formato === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64(a.bytes) } }
      : { type: "image", source: { type: "base64", media_type: a.tipoMime as "image/png" | "image/jpeg" | "image/webp", data: base64(a.bytes) } },
  );
  conteudo.push({ type: "text", text: arquivos.length > 1 ? "Os arquivos acima são páginas do mesmo documento, em ordem. Preencha os campos." : "Preencha os campos a partir do documento acima." });
  try {
    const r = await chamar(INSTRUCOES_APOLICE, conteudo, ESQUEMA_APOLICE);
    if ("erro" in r && r.erro) return { erro: r.erro, uso: r.uso };
    const apolice = interpretarApolice(r.json);
    if ("erro" in apolice) return { erro: apolice.erro, uso: r.uso };
    return { apolice, uso: r.uso };
  } catch (e) {
    console.error("[apolice] erro na IA", e instanceof Error ? e.message : e);
    return { erro: mensagemDeErro(e) };
  }
}

/** Observações do mês a partir do resumo agregado (sem documentos). */
export async function gerarInsightsComIA(resumo: unknown): Promise<{ observacoes?: Observacao[]; erro?: string; uso?: UsoIA }> {
  if (iaSimulada()) return { observacoes: INSIGHTS_EXEMPLO, uso: { modelo: "simulado", entrada: 0, saida: 0 } };
  if (!process.env.ANTHROPIC_API_KEY) return { erro: "A IA ainda não foi configurada (falta a chave da Anthropic)." };
  try {
    const r = await chamar(INSTRUCOES_INSIGHTS, [{ type: "text", text: JSON.stringify(resumo) }], ESQUEMA_INSIGHTS, MODELO_INSIGHTS, 4000);
    if ("erro" in r && r.erro) return { erro: r.erro, uso: r.uso };
    const observacoes = interpretarInsights(r.json);
    if (!observacoes) return { erro: "A resposta veio num formato inesperado. Tente de novo.", uso: r.uso };
    return { observacoes, uso: r.uso };
  } catch (e) {
    console.error("[insights] erro na IA", e instanceof Error ? e.message : e);
    return { erro: mensagemDeErro(e) };
  }
}

/** Resposta fixa do modo simulado: uma fatura de outubro com os casos que a revisão precisa tratar. */
function documentoSimulado(ehCartao: boolean, categorias: string[]): DocumentoLido {
  const cat = (nome: string) => (categorias.includes(nome) ? nome : null);
  if (!ehCartao) {
    return {
      tipo: "extrato_conta",
      banco: "Banco Simulado",
      fechamento: null,
      vencimento: null,
      total_fatura: null,
      saldo_inicial: 1000,
      saldo_final: 7764.1,
      itens: [
        { data: "2026-10-05", descricao: "SALARIO EMPRESA X", valor: 12000, sentido: "entrada", parcela: null, natureza_sugerida: "fluxo", categoria_sugerida: cat("Receita") },
        { data: "2026-10-06", descricao: "PIX ALUGUEL", valor: 4200, sentido: "saida", parcela: null, natureza_sugerida: "fluxo", categoria_sugerida: cat("Moradia") },
        { data: "2026-10-08", descricao: "APLICACAO CDB", valor: 1000, sentido: "saida", parcela: null, natureza_sugerida: "aporte", categoria_sugerida: null },
        { data: "2026-10-09", descricao: "PADARIA DO ZE", valor: 35.9, sentido: "saida", parcela: null, natureza_sugerida: "fluxo", categoria_sugerida: null },
      ],
      avisos: [],
    };
  }
  return {
    tipo: "fatura_cartao",
    banco: "Cartão Simulado",
    fechamento: "2026-10-28",
    vencimento: "2026-11-05",
    total_fatura: 1163.4,
    saldo_inicial: null,
    saldo_final: null,
    itens: [
      { data: "2026-10-02", descricao: "PETZ PINHEIROS", valor: 120.5, sentido: "saida", parcela: null, natureza_sugerida: "fluxo", categoria_sugerida: cat("Pets") },
      { data: "2026-10-03", descricao: "RESTAURANTE SABOR", valor: 182.9, sentido: "saida", parcela: null, natureza_sugerida: "fluxo", categoria_sugerida: cat("Alimentação") },
      { data: "2026-10-04", descricao: "LOJA DE MOVEIS", valor: 300, sentido: "saida", parcela: "1/3", natureza_sugerida: "fluxo", categoria_sugerida: cat("Moradia") },
      { data: "2026-10-12", descricao: "NETFLIX.COM", valor: 55.9, sentido: "saida", parcela: null, natureza_sugerida: "fluxo", categoria_sugerida: cat("Gastos Livres") },
      { data: "2026-10-15", descricao: "FARMACIA CENTRAL", valor: 64.1, sentido: "saida", parcela: null, natureza_sugerida: "fluxo", categoria_sugerida: null },
      { data: "2026-10-18", descricao: "ESTORNO RESTAURANTE SABOR", valor: 40, sentido: "entrada", parcela: null, natureza_sugerida: "fluxo", categoria_sugerida: cat("Alimentação") },
      { data: "2026-10-20", descricao: "NOTEBOOK LOJA", valor: 480, sentido: "saida", parcela: "3/10", natureza_sugerida: "fluxo", categoria_sugerida: cat("Gastos Livres") },
      { data: "2026-10-10", descricao: "PAGAMENTO RECEBIDO", valor: 2000, sentido: "entrada", parcela: null, natureza_sugerida: "transferencia", categoria_sugerida: null },
    ],
    avisos: [],
  };
}

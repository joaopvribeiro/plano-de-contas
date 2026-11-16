/**
 * Formato comum do que foi lido de um extrato ou fatura, venha de OFX, CSV
 * ou da IA. Tudo que vem depois (regras, competência, parcelas, duplicadas)
 * trabalha só com este formato.
 */
import type { Natureza } from "@/lib/dominio";

export type Sentido = "entrada" | "saida";

export type ItemLido = {
  /** Data da transação (AAAA-MM-DD). */
  data: string;
  descricao: string;
  /** Sempre positivo; o sentido diz se entrou ou saiu. */
  valor: number;
  /** Entrada: crédito na conta ou estorno/pagamento no cartão. Saída: débito ou compra. */
  sentido: Sentido;
  /** "3/10" quando a compra é parcelada. */
  parcela: string | null;
  /** Sugestões da IA (nome da categoria da família e natureza). */
  categoria_sugerida?: string | null;
  natureza_sugerida?: Natureza | null;
};

export type TipoDocumento = "fatura_cartao" | "extrato_conta" | "outro";

export type DocumentoLido = {
  tipo: TipoDocumento;
  banco: string | null;
  /** Fatura: datas de fechamento e vencimento (AAAA-MM-DD). */
  fechamento: string | null;
  vencimento: string | null;
  /** Fatura: valor total a pagar. */
  total_fatura: number | null;
  /** Extrato: saldos do período, quando aparecem. */
  saldo_inicial: number | null;
  saldo_final: number | null;
  itens: ItemLido[];
  /** Observações da leitura (página ilegível, itens fora de ordem etc.). */
  avisos: string[];
};

export type FormatoArquivo = "pdf" | "imagem" | "ofx" | "csv";

export function formatoDoArquivo(nome: string, tipoMime?: string): FormatoArquivo | null {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" || tipoMime === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp"].includes(ext) || /^image\/(png|jpeg|webp)$/.test(tipoMime ?? "")) return "imagem";
  if (ext === "ofx" || ext === "qfx") return "ofx";
  if (ext === "csv" || ext === "txt" || tipoMime === "text/csv") return "csv";
  return null;
}

/** Texto de um arquivo: UTF-8 quando válido; senão Windows-1252 (comum em OFX de bancos brasileiros). */
export function decodificarTexto(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const re2 = (n: number) => Math.round(n * 100) / 100;
export { re2 as arredondar };

/**
 * Parcela no fim da descrição: "LOJA X PARC 03/10", "LOJA X 3/10",
 * "LOJA X - Parcela 3/10", "LOJA X PARCELA 3 DE 10".
 * Devolve a descrição sem a parcela e a parcela "3/10" (ou null).
 */
export function extrairParcela(descricao: string): { base: string; parcela: string | null } {
  const d = descricao.trim();
  const m =
    /^(.*?)[\s\-–(]*(?:PARCELA|PARC\.?|PARC)\s*(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})\)?\s*$/i.exec(d) ??
    /^(.*?\S)\s+(\d{1,2})\/(\d{1,2})\s*$/.exec(d);
  if (!m) return { base: d, parcela: null };
  const k = Number(m[2]);
  const n = Number(m[3]);
  if (k < 1 || n < 2 || k > n || n > 72) return { base: d, parcela: null };
  return { base: m[1].replace(/[\s\-–]+$/, "").trim() || d, parcela: `${k}/${n}` };
}

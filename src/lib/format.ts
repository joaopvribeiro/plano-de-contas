/**
 * Formatação padrão da plataforma: BRL, datas DD/MM/AAAA, meses AAAA-MM.
 * Fuso: America/Sao_Paulo.
 */

export const TIMEZONE = "America/Sao_Paulo";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** R$ 1.234,56 (o Intl usa espaço não separável; trocamos por espaço comum para previsibilidade). */
export function formatBRL(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return brl.format(valor).replace(/ /g, " ");
}

/** "2026-11-05" → "05/11/2026" */
export function formatData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  if (!a || !m || !d) return "—";
  return `${d}/${m}/${a}`;
}

/** "05/11/2026" → "2026-11-05"; retorna null se inválida. */
export function parseData(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!m) return null;
  const [, d, mes, a] = m;
  const dt = new Date(Date.UTC(+a, +mes - 1, +d));
  if (dt.getUTCFullYear() !== +a || dt.getUTCMonth() !== +mes - 1 || dt.getUTCDate() !== +d) return null;
  return `${a}-${mes}-${d}`;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "2026-11" → "nov/26" */
export function formatMesCurto(mes: string): string {
  const [a, m] = mes.split("-");
  return `${MESES[+m - 1]}/${a.slice(2)}`;
}

/** "2026-11" → "novembro de 2026" */
export function formatMesLongo(mes: string): string {
  const [a, m] = mes.split("-");
  return `${MESES_LONGO[+m - 1]} de ${a}`;
}

/** Soma n meses a "AAAA-MM". */
export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  const na = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${na}-${String(nm).padStart(2, "0")}`;
}

/** Lista de meses do horizonte: inicio, inicio+1, ..., inicio+(n-1). */
export function mesesDoHorizonte(inicio: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => somarMeses(inicio, i));
}

/** Mês atual "AAAA-MM" no fuso de São Paulo. */
export function mesAtual(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(agora);
  const a = partes.find((p) => p.type === "year")!.value;
  const m = partes.find((p) => p.type === "month")!.value;
  return `${a}-${m}`;
}

/** true se a data/hora ISO já passou. */
export function jaPassou(iso: string, agora: Date = new Date()): boolean {
  return new Date(iso).getTime() < agora.getTime();
}

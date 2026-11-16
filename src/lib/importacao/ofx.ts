/**
 * Leitura de OFX (1.x em SGML e 2.x em XML). Não precisa de IA.
 * Valor negativo = saída; positivo = entrada (vale para conta e cartão).
 */
import { arredondar, extrairParcela, type DocumentoLido, type ItemLido } from "./tipos";

function campo(bloco: string, nome: string): string | null {
  // SGML não fecha as tags: o valor vai até o próximo "<".
  const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, "i").exec(bloco);
  return m ? m[1].trim() : null;
}

function dataOFX(v: string | null): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v ?? "");
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function numeroOFX(v: string | null): number | null {
  if (!v) return null;
  const s = v.replace(/\s/g, "");
  // Alguns bancos usam vírgula decimal.
  const n = Number(s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function ehOFX(texto: string): boolean {
  return /OFXHEADER|<OFX>/i.test(texto.slice(0, 2000));
}

export function lerOFX(texto: string): DocumentoLido | { erro: string } {
  if (!ehOFX(texto)) return { erro: "O arquivo não parece ser um OFX." };
  const cartao = /<CCSTMTRS>/i.test(texto);
  const blocos = texto.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  const itens: ItemLido[] = [];
  const avisos: string[] = [];
  for (const b of blocos) {
    const data = dataOFX(campo(b, "DTPOSTED"));
    const valor = numeroOFX(campo(b, "TRNAMT"));
    const descricao = [campo(b, "MEMO"), campo(b, "NAME")].find((x) => x && x.trim()) ?? "";
    if (!data || valor === null || valor === 0 || !descricao) {
      if (valor !== 0) avisos.push(`Transação ignorada (dados incompletos): ${descricao || "sem descrição"}.`);
      continue;
    }
    const { parcela } = extrairParcela(descricao);
    itens.push({ data, descricao, valor: arredondar(Math.abs(valor)), sentido: valor < 0 ? "saida" : "entrada", parcela });
  }
  if (!itens.length) return { erro: "Não encontrei transações no OFX." };

  const saldo = numeroOFX(campo(texto.split(/<LEDGERBAL>/i)[1] ?? "", "BALAMT"));
  return {
    tipo: cartao ? "fatura_cartao" : "extrato_conta",
    banco: campo(texto, "ORG") ?? null,
    fechamento: null,
    vencimento: null,
    total_fatura: null,
    saldo_inicial: null,
    saldo_final: cartao ? null : saldo,
    itens,
    avisos,
  };
}

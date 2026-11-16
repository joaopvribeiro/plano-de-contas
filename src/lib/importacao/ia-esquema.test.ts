import { describe, expect, it } from "vitest";
import { aplicarCategorizacao, esquemaDocumento, interpretarDocumento } from "./ia-esquema";

/** Confere as limitações das saídas estruturadas em todo o esquema. */
function conferirEsquema(no: unknown, caminho = "$"): string[] {
  if (!no || typeof no !== "object") return [];
  const o = no as Record<string, unknown>;
  const erros: string[] = [];
  if (o.type === "object" && o.additionalProperties !== false) erros.push(`${caminho}: falta additionalProperties: false`);
  if (o.type === "object" && o.properties) {
    const req = new Set((o.required as string[]) ?? []);
    for (const k of Object.keys(o.properties as object)) if (!req.has(k)) erros.push(`${caminho}.${k}: não está em required`);
  }
  for (const proibido of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) if (proibido in o) erros.push(`${caminho}: ${proibido}`);
  for (const [k, v] of Object.entries(o)) {
    if (Array.isArray(v)) v.forEach((x, i) => erros.push(...conferirEsquema(x, `${caminho}.${k}[${i}]`)));
    else if (typeof v === "object") erros.push(...conferirEsquema(v, `${caminho}.${k}`));
  }
  return erros;
}

const resposta = {
  tipo_documento: "fatura_cartao", banco: "Nubank", fechamento: "2026-10-28", vencimento: "2026-11-05", total_fatura: -150.5,
  saldo_inicial: null, saldo_final: null,
  itens: [
    { data: "2026-10-02", descricao: " PETZ ", valor: 120.5, sentido: "saida", parcela: "01/03", categoria: "Pets", natureza: "fluxo" },
    { data: "2026-10-03", descricao: "X", valor: 30, sentido: "saida", parcela: null, categoria: "Inventada", natureza: "fluxo" },
    { data: "2026-10-04", descricao: "Y", valor: 0, sentido: "saida", parcela: null, categoria: null, natureza: "fluxo" },
    { data: "2026-10-05", descricao: "PAGAMENTO", valor: 500, sentido: "entrada", parcela: null, categoria: "Pets", natureza: "transferencia" },
  ],
  avisos: [],
};

describe("esquema da IA", () => {
  it("respeita as limitações das saídas estruturadas", () => {
    expect(conferirEsquema(esquemaDocumento(["Pets", "Moradia"]))).toEqual([]);
    expect(conferirEsquema(esquemaDocumento([]))).toEqual([]);
  });

  it("interpreta a resposta: limpa parcela e descrição, descarta valor zero e categoria de fora", () => {
    const r = interpretarDocumento(resposta, ["Pets"]);
    if ("erro" in r) throw new Error(r.erro);
    expect(r.total_fatura).toBe(150.5);
    expect(r.itens.map((i) => [i.descricao, i.parcela, i.categoria_sugerida, i.natureza_sugerida])).toEqual([
      ["PETZ", "1/3", "Pets", "fluxo"],
      ["X", null, null, "fluxo"],
      ["PAGAMENTO", null, null, "transferencia"],
    ]);
  });

  it("recusa resposta fora do formato", () => {
    expect(interpretarDocumento({ itens: "x" }, [])).toEqual({ erro: "A resposta da leitura veio num formato inesperado." });
  });

  it("aplica a categorização pelo índice", () => {
    const doc = interpretarDocumento(resposta, ["Pets"]);
    if ("erro" in doc) throw new Error(doc.erro);
    const r = aplicarCategorizacao(doc, { itens: [{ i: 1, categoria: "Pets", natureza: "fluxo" }] }, ["Pets"]);
    expect(r.itens[1].categoria_sugerida).toBe("Pets");
    expect(aplicarCategorizacao(doc, "lixo", ["Pets"])).toBe(doc);
  });
});

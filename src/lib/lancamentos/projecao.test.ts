import { describe, expect, it } from "vitest";
import { chaveExistente, destinos, montarProjecao, sugerirRepeticao, type LinhaOrigem } from "./projecao";

describe("sugestão de repetição", () => {
  it("13º, férias, PLR e IPVA ficam só no mês; o resto repete", () => {
    expect(["13º", "13º salário Marcelo", "Décimo terceiro", "Férias Thais", "PLR", "IPVA 2027", "Salário Marcelo", "Aluguel", "Colégio dos filhos"].map(sugerirRepeticao)).toEqual([
      "unico", "unico", "unico", "unico", "unico", "unico", "todos", "todos", "todos",
    ]);
  });
});

describe("destinos", () => {
  const fim = "2027-10";
  it("todos os meses do horizonte depois da origem", () => {
    expect(destinos({ repeticao: "todos", valor: 1 }, "2026-11", fim)).toHaveLength(11);
    expect(destinos({ repeticao: "unico", valor: 1 }, "2026-11", fim)).toEqual([]);
  });
  it("meses escolhidos (13º em dezembro) e próximos N meses, dentro do horizonte", () => {
    expect(destinos({ repeticao: "meses", meses: ["2026-12", "2028-01"], valor: 1 }, "2026-11", fim)).toEqual(["2026-12"]);
    expect(destinos({ repeticao: "por_n", n: 3, valor: 1 }, "2026-11", fim)).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(destinos({ repeticao: "por_n", n: 30, valor: 1 }, "2027-08", fim)).toEqual(["2027-09", "2027-10"]);
  });
});

describe("montarProjecao", () => {
  const linha = (id: string, descricao: string, valor = 100): LinhaOrigem => ({
    id, descricao, valor, conta_id: "c", categoria_id: "k", classe: "Receita", natureza: "fluxo", assinatura: false, obs: null,
  });
  it("aplica valor futuro e não duplica o que já existe", () => {
    const regras = new Map([
      ["a", { repeticao: "todos" as const, valor: 30000 }],
      ["b", { repeticao: "meses" as const, meses: ["2026-12"], valor: 21000 }],
      ["c", { repeticao: "unico" as const, valor: 1 }],
    ]);
    const existentes = new Set([chaveExistente("2026-12", "salario  marcelo", "c")]);
    const r = montarProjecao([linha("a", "Salário Marcelo"), linha("b", "13º"), linha("c", "Bônus")], regras, "2026-11", "2027-01", existentes);
    expect(r.repetidos).toBe(1);
    expect(r.novos.map((n) => [n.mes_competencia, n.descricao, n.valor])).toEqual([
      ["2027-01", "Salário Marcelo", 30000],
      ["2026-12", "13º", 21000],
    ]);
  });
});

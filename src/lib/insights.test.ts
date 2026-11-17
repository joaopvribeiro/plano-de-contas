import { describe, expect, it } from "vitest";
import { descricaoSegura, interpretarInsights, lerInsightGuardado, montarResumoIA } from "./insights";

describe("privacidade do resumo", () => {
  it("Pix, TED e transferências não levam a descrição (costumam ter nome de pessoa)", () => {
    expect(descricaoSegura("PIX ENVIADO MARIA SILVA")).toBeNull();
    expect(descricaoSegura("TED 341 JOAO")).toBeNull();
    expect(descricaoSegura("Transferência para Ana")).toBeNull();
    expect(descricaoSegura("PAGAMENTO RECEBIDO")).toBeNull();
  });
  it("estabelecimento vai sem números longos", () => {
    expect(descricaoSegura("IFOOD *RESTAURANTE 123456789")).toBe("IFOOD *RESTAURANTE");
    expect(descricaoSegura("Netflix.com")).toBe("Netflix.com");
  });
  it("maiores gastos de Pix aparecem só pela categoria", () => {
    const v = { receitas: 10000, despesas: 8000, saldo: 2000, "Despesa básica": 5000 };
    const r = montarResumoIA({
      mes: "2026-10", previsto: v, realizado: v, metas: { "Despesa básica": 50 }, categorias: [],
      maiores: [{ descricao: "PIX ENVIADO DELFINA", categoria: "Doações", valor: 3900 }, { descricao: "ALUGUEL CAMPONEZ", categoria: "Moradia", valor: 4666.45 }],
      assinaturas: [], parcelasAVencer: 0, reserva: { saldo: 1, meta: 2 },
    });
    expect(r.maiores_gastos.map((m) => m.descricao)).toEqual(["Doações", "ALUGUEL CAMPONEZ"]);
    expect(JSON.stringify(r)).not.toContain("DELFINA");
  });
});

describe("resposta", () => {
  it("valida, limita a 5 e descarta vazias", () => {
    const obs = Array.from({ length: 7 }, (_, i) => ({ tipo: "dica", titulo: `T${i}`, texto: i === 0 ? " " : "x" }));
    expect(interpretarInsights({ observacoes: obs })?.length).toBe(5);
    expect(interpretarInsights({ observacoes: [{ tipo: "outro", titulo: "a", texto: "b" }] })).toBeNull();
  });
  it("lê o guardado em JSON ou texto livre", () => {
    expect(lerInsightGuardado('{"observacoes":[{"tipo":"positivo","titulo":"A","texto":"B"}]}').observacoes[0].tipo).toBe("positivo");
    expect(lerInsightGuardado("texto antigo").observacoes[0].texto).toBe("texto antigo");
  });
});

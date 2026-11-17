import { describe, expect, it } from "vitest";
import { ESQUEMA_APOLICE, interpretarApolice, premioMensal, resumoProtecoes, type Apolice } from "./modelo";

const ap = (p: Partial<Apolice>): Apolice => ({
  id: Math.random().toString(36), tipo: "vida", seguradora: "X", produto: null, segurado: null, premio: 100, periodicidade: "mensal",
  premio_mensal: 100, vigencia_inicio: null, vigencia_fim: null, destaques: {}, carencias: [], exclusoes: [], como_acionar: null, resumo: null,
  origem: "manual", arquivo: null, ...p,
});

describe("cartões", () => {
  it("prêmios das vigentes, lidas pela IA e renovações em 60 dias", () => {
    const r = resumoProtecoes(
      [
        ap({ premio_mensal: 380 }),
        ap({ tipo: "auto", seguradora: "Porto", premio_mensal: 350, vigencia_fim: "2026-12-15", origem: "ia" }),
        ap({ tipo: "residencial", seguradora: "Vencida", premio_mensal: 80, vigencia_fim: "2026-10-01" }),
        ap({ tipo: "outro", seguradora: "Único", premio_mensal: null, vigencia_fim: "2027-06-01" }),
      ],
      "2026-11-16",
    );
    expect(r).toEqual({
      premiosMensais: 730,
      ativasNoOrcamento: 2,
      lidasPelaIA: 1,
      total: 4,
      renovacoes: [{ id: expect.any(String), seguradora: "Porto", tipo: "auto", vigencia_fim: "2026-12-15" }],
    });
  });

  it("prêmio mensal pela periodicidade; único fica fora", () => {
    expect([premioMensal(4200, "anual"), premioMensal(300, "trimestral"), premioMensal(500, "unico"), premioMensal(null, "mensal")]).toEqual([350, 100, null, null]);
  });
});

describe("leitura", () => {
  const base = {
    tipo: "auto", seguradora: " Porto Seguro ", produto: "Auto", segurado: "Ana", premio: -4200, periodicidade: "anual",
    vigencia_inicio: "2025-12-15", vigencia_fim: "2026-12-15",
    destaques: [{ chave: "Franquia", valor: "R$ 4.850" }, { chave: "Morte", valor: "R$ 1 mi" }, { chave: "Carro Reserva", valor: " " }],
    carencias: [], exclusoes: [" a ", "", "b"], como_acionar: "0800", resumo: null, avisos: [],
  };
  it("só guarda os destaques do tipo, limpa textos e valores", () => {
    const r = interpretarApolice(base);
    if ("erro" in r) throw new Error(r.erro);
    expect(r).toMatchObject({ seguradora: "Porto Seguro", premio: 4200, destaques: { Franquia: "R$ 4.850" }, exclusoes: ["a", "b"] });
  });
  it("vigência invertida perde o fim; formato errado é recusado", () => {
    const r = interpretarApolice({ ...base, vigencia_fim: "2024-01-01" });
    expect("erro" in r ? null : r.vigencia_fim).toBeNull();
    expect(interpretarApolice({ tipo: "barco" })).toHaveProperty("erro");
  });
  it("esquema com todos os campos obrigatórios", () => {
    expect(Object.keys(ESQUEMA_APOLICE.properties).sort()).toEqual([...ESQUEMA_APOLICE.required].sort());
  });
});

import { describe, expect, it } from "vitest";
import { resumirGastos, type LancamentoGasto } from "./gastos";

const contas = [
  { id: "btg", nome: "BTG Ultrablue", tipo: "cartao_credito" },
  { id: "san", nome: "Santander Unique", tipo: "cartao_credito" },
  { id: "cc", nome: "Santander - conta corrente", tipo: "conta_corrente" },
];
const categorias = [
  { id: "ali", nome: "Alimentação" },
  { id: "mor", nome: "Moradia" },
  { id: "rec", nome: "Receita" },
];
let n = 0;
const l = (p: Partial<LancamentoGasto>): LancamentoGasto => ({
  id: String(n++), tipo: "Realizado", natureza: "fluxo", classe: "Despesa básica", categoria_id: "ali", conta_id: "btg", valor: 100, estorno: false,
  data: "2026-11-05", descricao: "X", parcela: null, mes_competencia: "2026-11", ...p,
});

const lancamentos = [
  l({ valor: 1000 }),
  l({ valor: 200, estorno: true }),
  l({ conta_id: "san", valor: 300, classe: "Padrão de vida", parcela: "3/10", descricao: "Notebook" }),
  l({ conta_id: "cc", categoria_id: "mor", valor: 4000 }),
  l({ conta_id: "cc", natureza: "transferencia", classe: null, categoria_id: null, valor: 900 }), // pagamento de fatura
  l({ conta_id: "cc", natureza: "aporte", classe: null, categoria_id: null, valor: 1000 }),
  l({ conta_id: "cc", classe: "Receita", categoria_id: "rec", valor: 20000 }),
  l({ tipo: "Previsto", valor: 1500 }),
  l({ tipo: "Previsto", conta_id: "cc", categoria_id: "mor", valor: 4000 }),
  l({ mes_competencia: "2026-10", valor: 999 }),
];
const futuras = [
  l({ tipo: "Previsto", conta_id: "san", parcela: "4/10", valor: 300, mes_competencia: "2026-12" }),
  l({ tipo: "Previsto", conta_id: "san", parcela: "5/10", valor: 300, mes_competencia: "2027-01" }),
  l({ tipo: "Previsto", conta_id: "btg", parcela: "2/2", valor: 50, mes_competencia: "2026-12" }),
];
const base = { mes: "2026-11", lancamentos, parcelasFuturas: futuras, contas, categorias, metas: { "Despesa básica": 30, "Padrão de vida": 10 } };

describe("resumo de gastos", () => {
  it("todas as contas: total, faturas, categorias com previsto, classes contra a meta", () => {
    const r = resumirGastos({ ...base, filtro: "todas" });
    expect(r.total).toBe(5100); // 1000 − 200 + 300 + 4000; sem transferência, aporte e receita
    expect(r.porConta.map((c) => [c.nome, c.total])).toEqual([
      ["Santander - conta corrente", 4000],
      ["BTG Ultrablue", 800],
      ["Santander Unique", 300],
    ]);
    expect(r.porCategoria.map((c) => [c.nome, c.valor, c.previsto, c.diferenca])).toEqual([
      ["Moradia", 4000, 4000, 0],
      ["Alimentação", 1100, 1500, -400],
    ]);
    expect(r.maiorCategoria?.nome).toBe("Moradia");
    expect(r.porClasse.find((c) => c.classe === "Despesa básica")).toMatchObject({ valor: 4800, metaValor: 6000, percentualReceita: 24, status: "ok" });
    expect(r.parcelas).toEqual([{ id: expect.any(String), descricao: "Notebook", parcela: "3/10", valor: 300, restantes: 7, aPagar: 2100, conta: "Santander Unique" }]);
    expect(r.totalEstornos).toBe(200);
    expect(r.comprometimento).toEqual([
      { mes: "2026-12", valor: 350 },
      { mes: "2027-01", valor: 300 },
    ]);
  });

  it("só cartões, só contas e uma conta específica", () => {
    expect(resumirGastos({ ...base, filtro: "cartoes" }).total).toBe(1100);
    expect(resumirGastos({ ...base, filtro: "contas" }).total).toBe(4000);
    const btg = resumirGastos({ ...base, filtro: "btg" });
    expect([btg.total, btg.dividaFutura, btg.porCategoria[0].previsto]).toEqual([800, 50, 1500]);
    // Com filtro, a meta é do mês inteiro: sem status.
    expect(btg.porClasse[0].status).toBe("sem-meta");
  });
});

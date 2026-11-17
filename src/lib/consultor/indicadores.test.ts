import { describe, expect, it } from "vitest";
import { colunaDoPainel, indicadoresDaFamilia, type EntradaIndicadores } from "./indicadores";
import type { ColunaMes, Valores } from "@/lib/dfc";

const v = (despesas: number, receitas = 10000): Valores => ({
  receitas,
  "Despesa básica": despesas,
  "Padrão de vida": 0,
  Doações: 0,
  Sonhos: 0,
  despesas,
  saldo: receitas - despesas,
  investimentos: 0,
  saldoAposInvestimentos: receitas - despesas,
});
const col = (mes: string, prev: number, real: number | null): ColunaMes => ({
  mes,
  temRealizado: real !== null,
  previsto: v(prev),
  realizado: real === null ? null : v(real),
  divergencia: null,
  caixa: { previsto: 0, realizado: null, divergencia: null },
});
const base: EntradaIndicadores = {
  hoje: "2026-11-17",
  coluna: col("2026-11", 5000, 4000),
  ultimoLancamento: "2026-11-15",
  patrimonioLiquido: 100000,
  reserva: { saldo: 30000, meta: 30000 },
  ativos: [{ nome: "CDB", data_saldo: "2026-11-01", valor: 1000, categoria: "Investimentos" }],
  renovacoes: [],
  ia: { usados: 2, limite: 20 },
};

describe("indicadoresDaFamilia", () => {
  it("família em dia não gera alertas", () => {
    const i = indicadoresDaFamilia(base);
    expect(i.alertas).toEqual([]);
    expect(i.reservaPct).toBe(100);
    expect(i.saldoMes).toBe(6000);
  });

  it("alerta despesas acima do previsto, falta de lançamentos, reserva baixa e ativo antigo", () => {
    const i = indicadoresDaFamilia({
      ...base,
      coluna: col("2026-11", 5000, 5600),
      ultimoLancamento: "2026-10-20",
      reserva: { saldo: 10000, meta: 30000 },
      ativos: [
        { nome: "CDB", data_saldo: "2026-08-01", valor: 1000, categoria: "Investimentos" },
        { nome: "Casa", data_saldo: "2020-01-01", valor: 900000, categoria: "Bem" },
      ],
    });
    const textos = i.alertas.map((a) => a.texto);
    expect(textos[0]).toMatch(/Despesas acima do previsto em R\$\s600,00/);
    expect(textos).toContain("Sem lançamentos há 28 dias");
    expect(textos).toContain("Reserva em 33% da meta");
    expect(textos).toContain("1 ativo desatualizado (mais de 45 dias)");
    expect(i.desatualizados).toBe(1);
  });

  it("renovações e limite de IA", () => {
    const i = indicadoresDaFamilia({ ...base, renovacoes: [{ seguradora: "Porto", vigencia_fim: "2026-11-27" }], ia: { usados: 20, limite: 20 } });
    expect(i.alertas).toEqual([
      { tom: "negativo", texto: "Porto vence em 10 dias" },
      { tom: "info", texto: "Limite de leituras com IA do mês atingido" },
    ]);
  });

  it("sem meta de reserva não calcula percentual", () => {
    expect(indicadoresDaFamilia({ ...base, reserva: { saldo: 0, meta: 0 } }).reservaPct).toBeNull();
  });
});

describe("colunaDoPainel", () => {
  const meses = [col("2026-10", 1, 1), col("2026-11", 1, null)];
  it("usa o mês anterior quando o atual ainda não tem realizado", () => {
    expect(colunaDoPainel(meses, "2026-11", "2026-10")?.mes).toBe("2026-10");
    expect(colunaDoPainel([col("2026-11", 1, null)], "2026-11", "2026-10")?.mes).toBe("2026-11");
    expect(colunaDoPainel([], "2026-11", "2026-10")).toBeNull();
  });
});

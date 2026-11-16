import { describe, expect, it } from "vitest";
import { calcularDFC, distribuicao, mesesCobertos, metaDaReserva, statusDaMeta, valorDaLinha, type LancamentoDFC } from "./dfc";
import { sugerirCompetencia } from "./lancamentos/regras-de-negocio";

const MESES = ["2026-09", "2026-10", "2026-11", "2026-12"];

function l(p: Partial<LancamentoDFC> & Pick<LancamentoDFC, "valor" | "mes_competencia">): LancamentoDFC {
  return { tipo: "Realizado", natureza: "fluxo", classe: "Padrão de vida", estorno: false, ...p };
}

const col = (r: ReturnType<typeof calcularDFC>, mes: string) => r.meses.find((m) => m.mes === mes)!;

describe("testes obrigatórios do prompt", () => {
  it("fatura fecha 28/10 e vence 05/11: R$ 1.000 em Padrão de vida conta em outubro; novembro, zero", () => {
    const cartao = { tipo: "cartao_credito" as const, dia_fechamento: 28 };
    const mes = sugerirCompetencia("2026-10-20", cartao);
    const r = calcularDFC({ meses: MESES, lancamentos: [l({ valor: 1000, mes_competencia: mes })] });
    expect(col(r, "2026-10").realizado!["Padrão de vida"]).toBe(1000);
    expect(col(r, "2026-11").realizado).toBeNull();
    expect(col(r, "2026-11").previsto["Padrão de vida"]).toBe(0);
  });

  it("pagamento da mesma fatura no extrato (transferência) não muda nenhum mês", () => {
    const base = [l({ valor: 1000, mes_competencia: "2026-10" })];
    const sem = calcularDFC({ meses: MESES, lancamentos: base });
    const com = calcularDFC({
      meses: MESES,
      lancamentos: [...base, l({ valor: 1000, mes_competencia: "2026-11", natureza: "transferencia", classe: null })],
    });
    expect(com.meses.map((m) => m.realizado)).toEqual(sem.meses.map((m) => m.realizado));
    expect(com.total).toEqual(sem.total);
  });

  it("compra de R$ 1.200 em 3 parcelas de R$ 400: R$ 400 em cada um de três meses seguidos", () => {
    const r = calcularDFC({
      meses: MESES,
      lancamentos: ["2026-09", "2026-10", "2026-11"].map((m) => l({ valor: 400, mes_competencia: m })),
    });
    expect(r.meses.map((m) => m.realizado?.["Padrão de vida"] ?? null)).toEqual([400, 400, 400, null]);
  });

  it("estorno de R$ 150 em Alimentação: Despesa básica cai R$ 150; receitas não mudam", () => {
    const base = [
      l({ valor: 5000, mes_competencia: "2026-10", classe: "Receita" }),
      l({ valor: 900, mes_competencia: "2026-10", classe: "Despesa básica" }),
    ];
    const antes = col(calcularDFC({ meses: MESES, lancamentos: base }), "2026-10").realizado!;
    const depois = col(
      calcularDFC({ meses: MESES, lancamentos: [...base, l({ valor: 150, mes_competencia: "2026-10", classe: "Despesa básica", estorno: true })] }),
      "2026-10",
    ).realizado!;
    expect(depois["Despesa básica"]).toBe(antes["Despesa básica"] - 150);
    expect(depois.receitas).toBe(antes.receitas);
    expect(depois.saldo).toBe(antes.saldo + 150);
  });

  it("aporte de R$ 2.000: Saldo do mês não muda; Saldo após investimentos e Caixa caem R$ 2.000", () => {
    const base = [l({ valor: 5000, mes_competencia: "2026-10", classe: "Receita" })];
    const a = col(calcularDFC({ meses: MESES, lancamentos: base, saldoInicial: 10000 }), "2026-10");
    const b = col(
      calcularDFC({
        meses: MESES,
        saldoInicial: 10000,
        lancamentos: [...base, l({ valor: 2000, mes_competencia: "2026-10", natureza: "aporte", classe: null })],
      }),
      "2026-10",
    );
    expect(b.realizado!.saldo).toBe(a.realizado!.saldo);
    expect(b.realizado!.investimentos).toBe(-2000);
    expect(b.realizado!.saldoAposInvestimentos).toBe(a.realizado!.saldoAposInvestimentos - 2000);
    expect(b.caixa.realizado).toBe(a.caixa.realizado! - 2000);
  });

  it("mês sem realizado: realizado vazio e caixa realizado igual ao do mês anterior", () => {
    const r = calcularDFC({
      meses: MESES,
      saldoInicial: 1000,
      lancamentos: [
        l({ valor: 500, mes_competencia: "2026-09", classe: "Receita" }),
        // outubro sem realizado
        l({ valor: 200, mes_competencia: "2026-11", classe: "Receita" }),
      ],
    });
    expect(col(r, "2026-09").caixa.realizado).toBe(1500);
    expect(col(r, "2026-10").realizado).toBeNull();
    expect(col(r, "2026-10").divergencia).toBeNull();
    expect(col(r, "2026-10").caixa.realizado).toBe(1500);
    expect(col(r, "2026-11").caixa.realizado).toBe(1700);
    // Depois do último mês com realizado, o caixa realizado fica vazio.
    expect(col(r, "2026-12").caixa.realizado).toBeNull();
    expect(r.ultimoMesComRealizado).toBe("2026-11");
  });

  it("parcela prevista de R$ 400 e real de R$ 410: divergência R$ 10; real de R$ 400,30: zero", () => {
    const prev = l({ tipo: "Previsto", valor: 400, mes_competencia: "2026-10" });
    const a = col(calcularDFC({ meses: MESES, lancamentos: [prev, l({ valor: 410, mes_competencia: "2026-10" })] }), "2026-10");
    expect(a.divergencia!["Padrão de vida"]).toBe(10);
    const b = col(calcularDFC({ meses: MESES, lancamentos: [prev, l({ valor: 400.3, mes_competencia: "2026-10" })] }), "2026-10");
    expect(b.divergencia!["Padrão de vida"]).toBe(0);
  });

  it("receita zero: percentuais vazios, sem divisão por zero", () => {
    const r = calcularDFC({ meses: MESES, lancamentos: [l({ valor: 300, mes_competencia: "2026-10" })] });
    const d = distribuicao(col(r, "2026-10").realizado!, { "Padrão de vida": 30 });
    expect(d.every((i) => i.percentual === null)).toBe(true);
    expect(d.find((i) => i.classe === "Padrão de vida")!.status).toBe("sem-meta");
  });
});

describe("regras adicionais", () => {
  it("previsto e realizado não se misturam e têm caixas separados", () => {
    const r = calcularDFC({
      meses: MESES,
      saldoInicial: 100,
      lancamentos: [
        l({ tipo: "Previsto", valor: 1000, mes_competencia: "2026-09", classe: "Receita" }),
        l({ tipo: "Previsto", valor: 600, mes_competencia: "2026-09", classe: "Despesa básica" }),
        l({ valor: 1000, mes_competencia: "2026-09", classe: "Receita" }),
        l({ valor: 700, mes_competencia: "2026-09", classe: "Despesa básica" }),
      ],
    });
    const s = col(r, "2026-09");
    expect(s.previsto.saldo).toBe(400);
    expect(s.realizado!.saldo).toBe(300);
    expect(s.caixa).toEqual({ previsto: 500, realizado: 400, divergencia: -100 });
    expect(s.divergencia!["Despesa básica"]).toBe(100);
  });

  it("caixa previsto acumula mês a mês a partir do saldo inicial", () => {
    const r = calcularDFC({
      meses: MESES,
      saldoInicial: 1000,
      lancamentos: MESES.map((m) => l({ tipo: "Previsto", valor: 250, mes_competencia: m, classe: "Receita" })),
    });
    expect(r.meses.map((m) => m.caixa.previsto)).toEqual([1250, 1500, 1750, 2000]);
    expect(r.total.caixa.previsto).toBe(2000);
  });

  it("resgate soma em Investimentos (líquido)", () => {
    const r = calcularDFC({
      meses: MESES,
      lancamentos: [
        l({ valor: 2000, mes_competencia: "2026-10", natureza: "aporte", classe: null }),
        l({ valor: 500, mes_competencia: "2026-10", natureza: "resgate", classe: null }),
      ],
    });
    expect(col(r, "2026-10").realizado!.investimentos).toBe(-1500);
  });

  it("lançamentos fora do horizonte ficam de fora", () => {
    const r = calcularDFC({ meses: MESES, lancamentos: [l({ valor: 999, mes_competencia: "2027-05" })] });
    expect(r.total.realizado).toBeNull();
    expect(r.total.previsto.despesas).toBe(0);
  });

  it("total realizado compara só com o previsto dos meses que têm realizado", () => {
    const r = calcularDFC({
      meses: MESES,
      lancamentos: [
        ...MESES.map((m) => l({ tipo: "Previsto", valor: 100, mes_competencia: m })),
        l({ valor: 120, mes_competencia: "2026-09" }),
      ],
    });
    expect(r.total.previsto["Padrão de vida"]).toBe(400);
    expect(r.total.realizado!["Padrão de vida"]).toBe(120);
    expect(r.total.divergencia!["Padrão de vida"]).toBe(20);
  });

  it("arredonda centavos (sem erro de ponto flutuante)", () => {
    const r = calcularDFC({
      meses: MESES,
      lancamentos: [l({ valor: 0.1, mes_competencia: "2026-10" }), l({ valor: 0.2, mes_competencia: "2026-10" })],
    });
    expect(col(r, "2026-10").realizado!["Padrão de vida"]).toBe(0.3);
  });

  it("valorDaLinha lê a linha de caixa e as demais", () => {
    const r = calcularDFC({ meses: MESES, saldoInicial: 50, lancamentos: [l({ tipo: "Previsto", valor: 10, mes_competencia: "2026-09", classe: "Receita" })] });
    expect(valorDaLinha(col(r, "2026-09"), "caixa", "previsto")).toBe(60);
    expect(valorDaLinha(col(r, "2026-09"), "receitas", "realizado")).toBeNull();
  });
});

describe("distribuição e metas", () => {
  it("percentual sobre a receita e status contra a meta", () => {
    expect(statusDaMeta(48, 50)).toBe("ok");
    expect(statusDaMeta(54.9, 50)).toBe("atencao");
    expect(statusDaMeta(55.1, 50)).toBe("acima");
    const r = calcularDFC({
      meses: MESES,
      lancamentos: [
        l({ valor: 10000, mes_competencia: "2026-10", classe: "Receita" }),
        l({ valor: 5300, mes_competencia: "2026-10", classe: "Despesa básica" }),
        l({ valor: 2500, mes_competencia: "2026-10", classe: "Padrão de vida" }),
      ],
    });
    const d = distribuicao(col(r, "2026-10").realizado!, { "Despesa básica": 50, "Padrão de vida": 30 });
    expect(d[0]).toMatchObject({ classe: "Despesa básica", percentual: 53, status: "atencao" });
    expect(d[1]).toMatchObject({ classe: "Padrão de vida", percentual: 25, status: "ok" });
    expect(d[2].status).toBe("sem-meta");
  });
});

describe("reserva de emergência", () => {
  it("meta = N × média da despesa básica prevista no horizonte", () => {
    const r = calcularDFC({
      meses: MESES,
      lancamentos: [
        l({ tipo: "Previsto", valor: 4000, mes_competencia: "2026-09", classe: "Despesa básica" }),
        l({ tipo: "Previsto", valor: 4000, mes_competencia: "2026-10", classe: "Despesa básica" }),
        l({ tipo: "Previsto", valor: 4000, mes_competencia: "2026-11", classe: "Despesa básica" }),
        l({ tipo: "Previsto", valor: 8000, mes_competencia: "2026-12", classe: "Despesa básica" }),
      ],
    });
    expect(metaDaReserva(r, 6)).toBe(30000);
    expect(mesesCobertos(15000, r)).toBe(3);
  });

  it("sem despesa básica prevista, cobertura vazia", () => {
    const r = calcularDFC({ meses: MESES, lancamentos: [] });
    expect(metaDaReserva(r, 6)).toBe(0);
    expect(mesesCobertos(1000, r)).toBeNull();
  });
});

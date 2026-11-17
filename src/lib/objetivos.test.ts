import { describe, expect, it } from "vitest";
import { aporteNecessario, liberdade, mesesEntre, reserva, situacaoProjeto, valorFuturo } from "./objetivos";

describe("juros compostos", () => {
  it("valor futuro e aporte necessário fecham a conta", () => {
    const taxa = 0.004;
    const aporte = aporteNecessario(3_000_000, 200_000, taxa, 240);
    // Conferência: saldo cresce + aportes no fim do mês chegam à meta.
    let s = 200_000;
    for (let i = 0; i < 240; i++) s = s * (1 + taxa) + aporte;
    expect(s).toBeCloseTo(3_000_000, -1);
    expect(valorFuturo(100, 0.01, 12)).toBeCloseTo(112.68, 2);
  });

  it("sem retorno, divide o que falta; meta já coberta pede zero", () => {
    expect(aporteNecessario(1200, 0, 0, 12)).toBe(100);
    expect(aporteNecessario(1000, 5000, 0.004, 12)).toBe(0);
  });
});

describe("liberdade financeira", () => {
  it("premissas da Demo", () => {
    const l = liberdade(231_800, 3_000_000, 0.4, 20);
    expect(l.meses).toBe(240);
    expect(l.projetado).toBeCloseTo(231_800 * Math.pow(1.004, 240), 0);
    expect(l.aporte).toBeGreaterThan(0);
    expect(l.atingeSemAporte).toBe(false);
    expect(l.percentual).toBeCloseTo(231_800 / 3_000_000);
  });
  it("sem meta definida, não calcula aporte", () => {
    expect(liberdade(100, null, 0.4, 20)).toMatchObject({ meta: null, aporte: null, percentual: null });
  });
});

describe("reserva", () => {
  it("cobre meses com uma casa, sem arredondar para cima", () => {
    expect(reserva(60_500, 74_910, 12_485)).toEqual({ saldo: 60_500, meta: 74_910, percentual: 60_500 / 74_910, cobreMeses: 4.8, falta: 14_410 });
  });
});

describe("projetos", () => {
  it("quanto guardar por mês até o prazo", () => {
    expect(mesesEntre("2026-11", "2027-07")).toBe(8);
    expect(situacaoProjeto({ valor_alvo: 30_000, ja_guardado: 8_500, prazo_mes: "2027-07" }, "2026-11")).toEqual({
      percentual: 8_500 / 30_000, falta: 21_500, mesesRestantes: 8, porMes: 2_687.5, status: "andamento",
    });
  });
  it("prazo vencido e meta concluída", () => {
    expect(situacaoProjeto({ valor_alvo: 100, ja_guardado: 40, prazo_mes: "2026-10" }, "2026-11")).toMatchObject({ status: "vencido", porMes: 60 });
    expect(situacaoProjeto({ valor_alvo: 100, ja_guardado: 150, prazo_mes: "2027-10" }, "2026-11")).toMatchObject({ status: "concluido", porMes: 0, percentual: 1 });
  });
});

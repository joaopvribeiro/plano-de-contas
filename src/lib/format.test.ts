import { describe, expect, it } from "vitest";
import { formatBRL, formatData, formatMesCurto, mesAtual, mesesDoHorizonte, parseData, somarMeses } from "./format";

describe("format", () => {
  it("formata reais no padrão R$ 1.234,56", () => {
    expect(formatBRL(1234.56)).toBe("R$ 1.234,56");
    expect(formatBRL(-50)).toBe("-R$ 50,00");
    expect(formatBRL(null)).toBe("—");
  });

  it("converte datas entre AAAA-MM-DD e DD/MM/AAAA", () => {
    expect(formatData("2026-11-05")).toBe("05/11/2026");
    expect(parseData("05/11/2026")).toBe("2026-11-05");
    expect(parseData("31/02/2026")).toBeNull();
  });

  it("soma meses atravessando o ano", () => {
    expect(somarMeses("2026-11", 2)).toBe("2027-01");
    expect(somarMeses("2027-01", -1)).toBe("2026-12");
    expect(mesesDoHorizonte("2026-08", 12).at(-1)).toBe("2027-07");
    expect(formatMesCurto("2027-01")).toBe("jan/27");
  });

  it("mês atual segue o fuso de São Paulo", () => {
    // 01/12/2026 01:30 UTC ainda é 30/11/2026 em São Paulo.
    expect(mesAtual(new Date("2026-12-01T01:30:00Z"))).toBe("2026-11");
  });
});

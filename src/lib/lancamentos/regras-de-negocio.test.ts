import { describe, expect, it } from "vitest";
import {
  efeitoNoSaldo,
  lerValorBRL,
  normalizarCampos,
  normalizarDescricao,
  regraParaDescricao,
  sugerirCompetencia,
  sugerirPadrao,
  totaisDoFiltro,
} from "./regras-de-negocio";
import { esquemaLancamento } from "./schema";

describe("lerValorBRL", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1234,56", 1234.56],
    ["1234.56", 1234.56],
    ["R$ 1.234,56", 1234.56],
    ["1.234", 1234],
    ["1.234.567,8", 1234567.8],
    ["480", 480],
    ["0,5", 0.5],
    ["-150,00", -150],
  ])("lê %s como %s", (texto, esperado) => {
    expect(lerValorBRL(texto)).toBe(esperado);
  });

  it.each(["", "abc", "1,2,3", "12.34.5", "1.23,4", "1,234"])("rejeita %s", (texto) => {
    expect(lerValorBRL(texto)).toBeNull();
  });
});

describe("sugerirCompetencia (regra da fatura)", () => {
  const nubank = { tipo: "cartao_credito" as const, dia_fechamento: 28 };

  it("compra até o fechamento entra na fatura do próprio mês", () => {
    expect(sugerirCompetencia("2026-10-28", nubank)).toBe("2026-10");
    expect(sugerirCompetencia("2026-10-01", nubank)).toBe("2026-10");
  });

  it("compra depois do fechamento entra na fatura do mês seguinte", () => {
    expect(sugerirCompetencia("2026-10-29", nubank)).toBe("2026-11");
  });

  it("dezembro depois do fechamento vai para janeiro do ano seguinte", () => {
    expect(sugerirCompetencia("2026-12-30", nubank)).toBe("2027-01");
  });

  it("fechamento dia 31 em fevereiro vale o último dia do mês", () => {
    const fecha31 = { tipo: "cartao_credito" as const, dia_fechamento: 31 };
    expect(sugerirCompetencia("2027-02-28", fecha31)).toBe("2027-02");
    expect(sugerirCompetencia("2026-03-31", fecha31)).toBe("2026-03");
  });

  it("conta corrente e dinheiro usam o mês da data", () => {
    expect(sugerirCompetencia("2026-10-29", { tipo: "conta_corrente", dia_fechamento: null })).toBe("2026-10");
    expect(sugerirCompetencia("2026-10-29", null)).toBe("2026-10");
  });
});

describe("regras aprendidas", () => {
  const regras = [
    { padrao: "UBER", id: "1" },
    { padrao: "uber eats", id: "2" },
    { padrao: "PETZ", id: "3" },
    { padrao: "Pagamento fatura", id: "4" },
  ];

  it("normaliza acentos, caixa e pontuação", () => {
    expect(normalizarDescricao("Pão de Açúcar - Loja 12")).toBe("PAO DE ACUCAR LOJA 12");
  });

  it("aplica a regra cujo padrão está contido na descrição", () => {
    expect(regraParaDescricao("PETZ*123 SAO PAULO", regras)?.id).toBe("3");
    expect(regraParaDescricao("pagamento de fatura", regras)).toBeNull();
    expect(regraParaDescricao("PAGAMENTO FATURA NUBANK", regras)?.id).toBe("4");
  });

  it("a regra mais específica (padrão mais longo) vence", () => {
    expect(regraParaDescricao("UBER EATS *PEDIDO", regras)?.id).toBe("2");
    expect(regraParaDescricao("UBER *TRIP", regras)?.id).toBe("1");
  });

  it("sem regra, devolve null", () => {
    expect(regraParaDescricao("Mercado Livre", regras)).toBeNull();
  });

  it("sugere padrão com a primeira palavra significativa", () => {
    expect(sugerirPadrao("PETZ*123 SP")).toBe("PETZ");
    expect(sugerirPadrao("15/10 Netflix.com")).toBe("NETFLIX");
  });
});

describe("efeito no saldo", () => {
  it("receita soma, despesa subtrai, estorno inverte", () => {
    expect(efeitoNoSaldo({ natureza: "fluxo", classe: "Receita", valor: 100, estorno: false })).toBe(100);
    expect(efeitoNoSaldo({ natureza: "fluxo", classe: "Padrão de vida", valor: 100, estorno: false })).toBe(-100);
    expect(efeitoNoSaldo({ natureza: "fluxo", classe: "Padrão de vida", valor: 100, estorno: true })).toBe(100);
  });

  it("transferência, aporte e resgate não mexem no saldo do mês", () => {
    for (const natureza of ["transferencia", "aporte", "resgate"] as const) {
      expect(efeitoNoSaldo({ natureza, classe: null, valor: 100, estorno: false })).toBe(0);
    }
  });

  it("totais do filtro separam investimentos e transferências", () => {
    const t = totaisDoFiltro([
      { natureza: "fluxo", classe: "Receita", valor: 1000, estorno: false },
      { natureza: "fluxo", classe: "Despesa básica", valor: 300, estorno: false },
      { natureza: "fluxo", classe: "Despesa básica", valor: 50, estorno: true },
      { natureza: "aporte", classe: null, valor: 200, estorno: false },
      { natureza: "resgate", classe: null, valor: 80, estorno: false },
      { natureza: "transferencia", classe: null, valor: 999, estorno: false },
    ]);
    expect(t).toEqual({ receitas: 1000, despesas: 250, saldo: 750, investimentos: -120, transferencias: 999 });
  });

  it("evita erro de ponto flutuante nos totais", () => {
    const t = totaisDoFiltro([
      { natureza: "fluxo", classe: "Sonhos", valor: 0.1, estorno: false },
      { natureza: "fluxo", classe: "Sonhos", valor: 0.2, estorno: false },
    ]);
    expect(t.despesas).toBe(0.3);
  });
});

describe("normalizarCampos", () => {
  it("transferência perde classe, categoria e subtipo", () => {
    expect(
      normalizarCampos({ natureza: "transferencia", classe: "Receita", categoria_id: "x", subtipo_receita: "Salário", ativo_id: null }),
    ).toEqual({ natureza: "transferencia", classe: null, categoria_id: null, subtipo_receita: null, ativo_id: null });
  });

  it("subtipo só fica em Receita; ativo só em aporte/resgate", () => {
    const r = normalizarCampos({ natureza: "fluxo", classe: "Sonhos", categoria_id: "x", subtipo_receita: "Salário", ativo_id: "a" });
    expect(r.subtipo_receita).toBeNull();
    expect(r.ativo_id).toBeNull();
  });
});

describe("esquemaLancamento", () => {
  const base = {
    tipo: "Realizado",
    natureza: "fluxo",
    mes_competencia: "2026-10",
    data: "2026-10-15",
    descricao: "  Mercado  ",
    valor: "1.234,56",
    categoria_id: "0d0d0d0d-0000-4000-8000-0000000000c1",
    classe: "Despesa básica",
  };

  it("aceita um lançamento válido e normaliza valor e texto", () => {
    const r = esquemaLancamento.parse(base);
    expect(r.valor).toBe(1234.56);
    expect(r.descricao).toBe("Mercado");
    expect(r.conta_id).toBeNull();
  });

  it("exige data no realizado, mas não no previsto", () => {
    expect(esquemaLancamento.safeParse({ ...base, data: "" }).success).toBe(false);
    expect(esquemaLancamento.safeParse({ ...base, tipo: "Previsto", data: "" }).success).toBe(true);
  });

  it("exige classe e categoria em receitas e despesas", () => {
    const r = esquemaLancamento.safeParse({ ...base, classe: "", categoria_id: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toEqual(["Escolha a classe.", "Escolha a categoria."]);
  });

  it("transferência dispensa classe e categoria", () => {
    const r = esquemaLancamento.parse({ ...base, natureza: "transferencia", classe: "", categoria_id: "" });
    expect(r.classe).toBeNull();
  });

  it("recusa valor zero ou inválido", () => {
    expect(esquemaLancamento.safeParse({ ...base, valor: "0" }).success).toBe(false);
    expect(esquemaLancamento.safeParse({ ...base, valor: "abc" }).success).toBe(false);
  });
});

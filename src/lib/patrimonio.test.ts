import { describe, expect, it } from "vitest";
import { agrupar, consorcio, diasDesde, distribuir, evolucao, porInstituicao, resumir, type Ativo, type Passivo } from "./patrimonio";

const ativo = (p: Partial<Ativo>): Ativo => ({
  id: Math.random().toString(36), nome: "x", categoria: "Investimentos", instituicao: "XP", produto: null, valor: 100,
  valor_liquido: null, liquidez: null, risco: null, data_saldo: "2026-11-01", origem: "manual",
  consorcio_prazo_meses: null, consorcio_parcelas_pagas: null, consorcio_parcela_mensal: null, consorcio_contemplado: null, ...p,
});
const passivo = (saldo: number): Passivo => ({
  id: "p", nome: "Carro", tipo: "financiamento_veiculo", instituicao: null, saldo_devedor: saldo, parcela_mensal: null, taxa_am: null, parcelas_restantes: null, data_saldo: "2026-11-01",
});

const ATIVOS = [
  ativo({ categoria: "Reserva", instituicao: "Nubank", valor: 38000 }),
  ativo({ categoria: "Reserva", instituicao: "XP", valor: 22500 }),
  ativo({ categoria: "Investimentos", instituicao: "xp ", valor: 59900 }),
  ativo({ categoria: "Previdência", instituicao: "BTG Pactual", valor: 86400 }),
  ativo({ categoria: "Fundo Fechado", instituicao: "XP", valor: 25000 }),
  ativo({ categoria: "FGTS", instituicao: "Caixa", valor: 31800 }),
  ativo({ categoria: "Bem", instituicao: null, valor: 805000 }),
  ativo({ categoria: "Investimentos", instituicao: "BTG", valor: 0 }),
  ativo({ categoria: "Consórcio", valor: 300000, consorcio_prazo_meses: 180, consorcio_parcelas_pagas: 24, consorcio_parcela_mensal: 2050, consorcio_contemplado: false }),
];

describe("resumo", () => {
  it("carteira, patrimônio líquido e com direitos", () => {
    expect(resumir(ATIVOS, [passivo(32000)])).toEqual({
      carteira: 231800,
      ativosCarteira: 5, // o de saldo zero fica fora
      instituicoesCarteira: 3, // "XP" e "xp " contam como uma
      fgts: 31800,
      bens: 805000,
      dividas: 32000,
      patrimonioLiquido: 1036600,
      cartas: 300000,
      direitoLiquido: 49200, // 24 × 2.050 já pagos
      patrimonioComDireitos: 1085800,
    });
  });

  it("consórcio contemplado vale a carta menos o saldo a pagar, nunca negativo", () => {
    const c = { valor: 300000, consorcio_prazo_meses: 180, consorcio_parcelas_pagas: 120, consorcio_parcela_mensal: 2050, consorcio_contemplado: true };
    expect(consorcio(c)).toEqual({ pago: 246000, aPagar: 123000, direitoLiquido: 177000, progresso: 120 / 180 });
    expect(consorcio({ ...c, consorcio_parcelas_pagas: 10 }).direitoLiquido).toBe(0);
  });
});

describe("distribuição e balanço", () => {
  it("por categoria, só a carteira, com percentuais", () => {
    const d = distribuir(ATIVOS, (a) => a.categoria);
    expect(d.map((f) => [f.rotulo, f.valor])).toEqual([
      ["Previdência", 86400],
      ["Reserva", 60500],
      ["Investimentos", 59900],
      ["Fundo Fechado", 25000],
    ]);
    expect(d.reduce((s, f) => s + f.percentual, 0)).toBeCloseTo(1);
  });

  it("agrupa o excedente em Outras", () => {
    const muitos = Array.from({ length: 8 }, (_, i) => ativo({ instituicao: `Banco ${i}`, valor: 100 - i }));
    const d = distribuir(muitos, porInstituicao, 6);
    expect(d).toHaveLength(7);
    expect(d[6]).toMatchObject({ rotulo: "Outras", valor: 94 + 93 });
  });

  it("balanço na ordem dos grupos, maior primeiro, sem grupos vazios e sem saldo zero", () => {
    const g = agrupar(ATIVOS);
    expect(g.map((x) => [x.categoria, x.subtotal, x.itens.length])).toEqual([
      ["Reserva", 60500, 2],
      ["Investimentos", 59900, 1],
      ["Previdência", 86400, 1],
      ["Fundo Fechado", 25000, 1],
      ["FGTS", 31800, 1],
      ["Bem", 805000, 1],
      ["Consórcio", 300000, 1],
    ]);
    expect(g[0].itens.map((a) => a.valor)).toEqual([38000, 22500]);
  });

  it("dias desde o saldo", () => {
    expect(diasDesde("2026-09-30", "2026-11-16")).toBe(47);
  });
});

describe("evolução", () => {
  it("usa o último saldo de cada ativo até o fim do mês; bens e dívidas valem desde o início", () => {
    const ativos = [
      { id: "a", categoria: "Reserva" as const },
      { id: "b", categoria: "Bem" as const },
      { id: "c", categoria: "Consórcio" as const },
      { id: "n", categoria: "Investimentos" as const },
    ];
    const pts = evolucao(
      ["2026-08", "2026-09", "2026-10", "2026-11"],
      ativos,
      [
        { id: "a", data: "2026-09-30", valor: 100 },
        { id: "a", data: "2026-10-15", valor: 120 },
        { id: "b", data: "2026-11-16", valor: 1000 },
        { id: "c", data: "2026-09-01", valor: 50000 },
        { id: "n", data: "2026-11-04", valor: 30 },
      ],
      [{ id: "p", data: "2026-11-16", valor: 200 }],
    );
    // Agosto fica de fora (só o bem existiria); bem e dívida cadastrados em novembro valem desde setembro.
    expect(pts).toEqual([
      { mes: "2026-09", carteira: 100, patrimonioLiquido: 900 },
      { mes: "2026-10", carteira: 120, patrimonioLiquido: 920 },
      { mes: "2026-11", carteira: 150, patrimonioLiquido: 950 },
    ]);
  });
});

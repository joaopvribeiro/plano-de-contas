import { describe, expect, it } from "vitest";
import { ESQUEMA_RELATORIO, interpretarRelatorio } from "./esquema";
import { RELATORIO_EXEMPLO } from "./exemplo";
import { chaveDaPosicao, conferirRelatorio, mesmaInstituicao, montarRevisaoRelatorio, type AtivoExistente } from "./revisao";

const existente = (p: Partial<AtivoExistente>): AtivoExistente => ({
  id: Math.random().toString(36).slice(2), nome: "x", categoria: "Investimentos", instituicao: "BTG Pactual", valor: 100, origem: "manual", chave_relatorio: null, ...p,
});

describe("conferência", () => {
  it("soma das posições bate com o patrimônio bruto do relatório", () => {
    expect(conferirRelatorio(RELATORIO_EXEMPLO)).toEqual({ esperado: 896746.97, lido: 896746.97, diferenca: 0, confere: true });
  });
  it("aponta a diferença quando falta posição", () => {
    const c = conferirRelatorio({ ...RELATORIO_EXEMPLO, posicoes: RELATORIO_EXEMPLO.posicoes.slice(1) });
    expect(c).toMatchObject({ diferenca: 135381.54, confere: false });
  });
});

describe("revisão", () => {
  it("reserva: a menor posição D+0/D+1 que completa a meta", () => {
    // Faltam 38.380 (meta 98.880, já há 60.500 fora): a LFT (45.832) cobre sozinha.
    const { linhas } = montarRevisaoRelatorio(RELATORIO_EXEMPLO, "BTG Pactual", [], { meta: 98880, foraDoRelatorio: 60500 });
    expect(linhas.filter((l) => l.categoria === "Reserva").map((l) => l.nome)).toEqual(["LFT"]);
  });

  it("sem posição que cubra sozinha: a maior e depois a menor que completa; D+10 e multimercado ficam em Investimentos", () => {
    const { linhas, sumidos } = montarRevisaoRelatorio(RELATORIO_EXEMPLO, "BTG Pactual", [], { meta: 300000, foraDoRelatorio: 0 });
    const reserva = linhas.filter((l) => l.categoria === "Reserva").map((l) => l.nome);
    // 157.849 (maior) → faltam 142.151 → a menor que cobre é o AZ Quest (144.836).
    expect(reserva).toEqual(["BTG Tesouro Selic FIRF Ref DI", "AZ Quest Low Vol FIM"]);
    expect(linhas.find((l) => l.nome === "BNP Paribas Rubi FIC FIRF CrPr")?.categoria).toBe("Investimentos"); // D+10
    expect(linhas.find((l) => l.nome === "Álamos Compass FIM")).toMatchObject({ categoria: "Investimentos", risco: "médio", liquidez: null });
    expect(linhas.find((l) => l.nome === "LFT")?.liquidez).toBe("D+1");
    expect(sumidos).toEqual([]);
  });

  it("reserva já cheia fora do relatório: nada vira Reserva", () => {
    const { linhas } = montarRevisaoRelatorio(RELATORIO_EXEMPLO, "BTG Pactual", [], { meta: 50000, foraDoRelatorio: 60000 });
    expect(linhas.some((l) => l.categoria === "Reserva")).toBe(false);
  });

  it("dois títulos com o mesmo nome têm chaves diferentes", () => {
    const { linhas } = montarRevisaoRelatorio(RELATORIO_EXEMPLO, "BTG Pactual", [], { meta: 0, foraDoRelatorio: 0 });
    const ntnb = linhas.filter((l) => l.nome === "NTN-B").map((l) => l.chave);
    expect(new Set(ntnb).size).toBe(2);
  });

  it("mês seguinte: atualiza pela chave e mantém a categoria escolhida; o resgatado é sugerido para zerar", () => {
    const chave = chaveDaPosicao("BTG Pactual", RELATORIO_EXEMPLO.posicoes[2]);
    const az = existente({ nome: "AZ Quest", categoria: "Reserva", chave_relatorio: chave, origem: "relatorio" });
    const vendido = existente({ nome: "Fundo vendido", chave_relatorio: "BTG|FUNDO VENDIDO||", origem: "relatorio" });
    const manual = existente({ nome: "PGBL titular 1", categoria: "Previdência" });
    const outraCasa = existente({ nome: "Tesouro Selic 2029", instituicao: "XP" });
    const { linhas, sumidos } = montarRevisaoRelatorio(RELATORIO_EXEMPLO, "BTG Pactual", [az, vendido, manual, outraCasa], { meta: 0, foraDoRelatorio: 0 });
    expect(linhas[2]).toMatchObject({ ativo_id: az.id, categoria: "Reserva", motivo: "existente" });
    expect(sumidos.map((s) => [s.ativo.nome, s.zerar])).toEqual([
      ["Fundo vendido", true],
      ["PGBL titular 1", false],
    ]);
  });

  it("ativo manual da mesma instituição com o mesmo nome é atualizado", () => {
    const lft = existente({ nome: "LFT", instituicao: "BTG", categoria: "Reserva" });
    const { linhas, sumidos } = montarRevisaoRelatorio(RELATORIO_EXEMPLO, "BTG Pactual", [lft], { meta: 0, foraDoRelatorio: 0 });
    expect(linhas.find((l) => l.nome === "LFT")?.ativo_id).toBe(lft.id);
    expect(sumidos).toEqual([]);
  });

  it("instituição: BTG e BTG Pactual são a mesma; XP e BTG não", () => {
    expect([mesmaInstituicao("BTG", "BTG Pactual"), mesmaInstituicao("Banco BTG Pactual", "BTG"), mesmaInstituicao("XP", "BTG"), mesmaInstituicao(null, "XP")]).toEqual([
      true, true, false, false,
    ]);
  });
});

describe("resposta da IA", () => {
  it("interpreta, descarta saldo zero e limpa valores negativos", () => {
    const r = interpretarRelatorio({
      ...RELATORIO_EXEMPLO,
      posicoes: [
        ...RELATORIO_EXEMPLO.posicoes.slice(0, 2),
        { ...RELATORIO_EXEMPLO.posicoes[2], saldo_bruto: 0 },
        { ...RELATORIO_EXEMPLO.posicoes[3], saldo_bruto: -10, liquidez_dias: -1 },
      ],
    });
    if ("erro" in r) throw new Error(r.erro);
    expect(r.posicoes.map((p) => [p.saldo_bruto, p.liquidez_dias])).toEqual([
      [135381.54, 0],
      [157849.27, 0],
      [10, null],
    ]);
  });
  it("recusa formato inesperado", () => {
    expect(interpretarRelatorio({ posicoes: 1 })).toHaveProperty("erro");
  });
  it("esquema sem campos opcionais soltos", () => {
    const req = new Set(ESQUEMA_RELATORIO.required);
    expect(Object.keys(ESQUEMA_RELATORIO.properties).every((k) => req.has(k))).toBe(true);
  });
});

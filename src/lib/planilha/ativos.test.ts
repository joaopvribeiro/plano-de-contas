import { describe, expect, it } from "vitest";
import { lerPlanilhaAtivos, MODELO_CSV_ATIVOS } from "./ativos";

const hoje = "2026-11-17";

describe("lerPlanilhaAtivos", () => {
  it("lê o modelo inteiro", () => {
    const r = lerPlanilhaAtivos(MODELO_CSV_ATIVOS, [], hoje);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas.every((l) => l.ok)).toBe(true);
    const d = r.linhas.flatMap((l) => (l.ok ? [l.dados] : []));
    expect(d.map((x) => x.categoria)).toEqual(["Reserva", "Investimentos", "Previdência", "FGTS", "Bem"]);
    expect(d[0]).toMatchObject({ valor: 30000, data_saldo: "2026-11-15", liquidez: "D+0", risco: "baixo", instituicao: "Banco Inter", ativo_id: null });
    expect(d[2].previdencia_tipo).toBe("VGBL");
    expect(d[4]).toMatchObject({ produto: "Imóvel", instituicao: null, liquidez: null, risco: null });
  });

  it("casa com o ativo existente pelo nome e instituição, sem acento e caixa", () => {
    const r = lerPlanilhaAtivos("nome\tcategoria\tbanco\tsaldo\ncdb liquidez diaria\treserva\tBANCO INTER\t31000", [
      { id: "a1", nome: "CDB Liquidez Diária", instituicao: "Banco Inter", categoria: "Reserva" },
    ], hoje);
    expect(r.ok && r.linhas[0].ok && r.linhas[0].dados).toMatchObject({ ativo_id: "a1", valor: 31000, data_saldo: hoje });
  });

  it("aponta erros por linha", () => {
    const r = lerPlanilhaAtivos(
      "nome;categoria;valor;data;risco\n;Investimentos;abc;32/13/2026;muito\nEmpresa X;Equity;10;;\nCDB;Reserva;10;01/01/2027;\nCDB;Reserva;5;;",
      [],
      hoje,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [a, b, c, d] = r.linhas;
    expect(!a.ok && a.erros).toEqual([
      "Nome vazio.",
      'Valor inválido: "abc".',
      'Data inválida: "32/13/2026" (use 15/11/2026).',
      'Risco inválido: "muito" (use baixo, médio ou alto).',
    ]);
    expect(!b.ok && b.erros[0]).toMatch(/cadastre direto no Patrimônio/);
    expect(!c.ok && c.erros).toEqual(["A data do saldo não pode estar no futuro."]);
    expect(!d.ok && d.erros).toEqual(["Ativo repetido na planilha (mesmo nome e instituição)."]);
  });

  it("não atualiza Equity nem Consórcio pela planilha", () => {
    const r = lerPlanilhaAtivos("nome;categoria;valor\nCarta;Investimentos;10", [{ id: "c", nome: "Carta", instituicao: null, categoria: "Consórcio" }], hoje);
    expect(r.ok && !r.linhas[0].ok && r.linhas[0].erros[0]).toMatch(/Consórcio/);
  });

  it("exige as colunas obrigatórias", () => {
    expect(lerPlanilhaAtivos("nome;valor\nx;1", [], hoje)).toEqual({ ok: false, erro: 'Não encontrei a(s) coluna(s) "categoria" no cabeçalho.' });
  });
});

import { describe, expect, it } from "vitest";
import { dividir, lerMes, lerPlanilhaPrevisto, MODELO_CSV } from "./previsto";

const cadastros = {
  contas: [
    { id: "c1", nome: "CC - C6" },
    { id: "c2", nome: "Nubank" },
  ],
  categorias: [
    { id: "k1", nome: "Receita", classe_padrao: "Receita" as const },
    { id: "k2", nome: "Moradia", classe_padrao: "Despesa básica" as const },
    { id: "k3", nome: "Alimentação", classe_padrao: "Despesa básica" as const },
  ],
};

describe("lerMes", () => {
  it.each([
    ["2026-11", "2026-11"],
    ["2026-1", "2026-01"],
    ["11/2026", "2026-11"],
    ["11/26", "2026-11"],
    ["nov/26", "2026-11"],
    ["Novembro de 2026", "2026-11"],
    ["março/2027", "2027-03"],
    ["15/11/2026", "2026-11"],
    ["2026-11-15", "2026-11"],
  ])("%s → %s", (t, m) => expect(lerMes(t)).toBe(m));

  it.each(["13/2026", "2026-13", "", "novembro", "xyz/26"])("rejeita %s", (t) => expect(lerMes(t)).toBeNull());
});

describe("dividir", () => {
  it("detecta tabulação (colado do Excel)", () => {
    expect(dividir("mês\tvalor\n2026-11\t1.234,56")).toEqual([["mês", "valor"], ["2026-11", "1.234,56"]]);
  });

  it("CSV com ponto e vírgula e aspas", () => {
    expect(dividir('a;b\n"x; y";"diz ""oi"""\n')).toEqual([["a", "b"], ["x; y", 'diz "oi"']]);
  });

  it("CSV com vírgula, BOM e quebras de linha do Windows", () => {
    expect(dividir("﻿a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("ignora linhas em branco", () => {
    expect(dividir("a;b\n\n1;2\n;\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("lerPlanilhaPrevisto", () => {
  it("lê o modelo inteiro sem erros", () => {
    const r = lerPlanilhaPrevisto(MODELO_CSV, cadastros);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas.every((l) => l.ok)).toBe(true);
    const [salario, aluguel, mercado, aporte] = r.linhas.map((l) => (l.ok ? l.dados : null));
    expect(salario).toMatchObject({ mes_competencia: "2026-12", valor: 12000, categoria_id: "k1", classe: "Receita", conta_id: null });
    expect(aluguel).toMatchObject({ valor: 4200, conta_id: "c1", classe: "Despesa básica" });
    // Classe vazia usa a classe padrão da categoria.
    expect(mercado).toMatchObject({ categoria_id: "k3", classe: "Despesa básica", obs: "classe vazia = padrão da categoria" });
    expect(aporte).toMatchObject({ natureza: "aporte", categoria_id: null, classe: null });
  });

  it("aceita cabeçalho com sinônimos, sem acento e em outra ordem", () => {
    const r = lerPlanilhaPrevisto("Valor\tCompetência\tHistórico\tCategoria\n500\tnov/26\tLuz\tmoradia", cadastros);
    expect(r.ok && r.linhas[0]).toMatchObject({ ok: true, dados: { valor: 500, mes_competencia: "2026-11", categoria_id: "k2" } });
  });

  it("aponta erros por linha, com o número da linha da planilha", () => {
    const r = lerPlanilhaPrevisto(
      "mês;descrição;valor;conta;categoria\n" +
        "2026-11;Ok;100;;Moradia\n" +
        "13/2026;Mês ruim;100;;Moradia\n" +
        "2026-11;;abc;Itaú;Lazer\n" +
        "2026-11;Negativo;-50;;Moradia\n",
      cadastros,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas.map((l) => [l.linha, l.ok])).toEqual([[2, true], [3, false], [4, false], [5, false]]);
    const l4 = r.linhas[2];
    expect(!l4.ok && l4.erros).toEqual([
      "Descrição vazia.",
      'Valor inválido: "abc".',
      'Conta "Itaú" não cadastrada.',
      'Categoria "Lazer" não cadastrada.',
    ]);
  });

  it("exige as colunas mês, descrição e valor", () => {
    const r = lerPlanilhaPrevisto("descrição;categoria\nx;Moradia", cadastros);
    expect(r).toEqual({ ok: false, erro: 'Não encontrei a(s) coluna(s) "mês", "valor" no cabeçalho.' });
  });

  it("lista colunas que não reconheceu", () => {
    const r = lerPlanilhaPrevisto("mês;descrição;valor;categoria;responsável\n2026-11;x;1;Moradia;Ana", cadastros);
    expect(r.ok && r.ignoradas).toEqual(["responsável"]);
  });

  it("respeita o limite de linhas", () => {
    const corpo = Array.from({ length: 3 }, () => "2026-11;x;1;;Moradia").join("\n");
    expect(lerPlanilhaPrevisto(`mês;descrição;valor;conta;categoria\n${corpo}`, cadastros, 2)).toMatchObject({ ok: false });
  });

  it("transferência dispensa categoria", () => {
    const r = lerPlanilhaPrevisto("mês;descrição;valor;natureza\n2026-11;Pagamento fatura;3000;Transferência", cadastros);
    expect(r.ok && r.linhas[0]).toMatchObject({ ok: true, dados: { natureza: "transferencia", categoria_id: null } });
  });
});

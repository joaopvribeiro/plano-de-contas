import { describe, expect, it } from "vitest";
import { conferirTotal, editarLinha, estornoPara, montarRevisao, parcelasFuturas, pendenciaDaLinha, type ContextoRevisao } from "./revisao";
import type { DocumentoLido, ItemLido } from "./tipos";

const cats = [
  { id: "c-rec", nome: "Receita", classe_padrao: "Receita" as const, arquivada: false },
  { id: "c-ali", nome: "Alimentação", classe_padrao: "Despesa básica" as const, arquivada: false },
  { id: "c-pet", nome: "Pets", classe_padrao: "Padrão de vida" as const, arquivada: false },
  { id: "c-mor", nome: "Moradia", classe_padrao: "Despesa básica" as const, arquivada: false },
  { id: "c-old", nome: "Antiga", classe_padrao: "Padrão de vida" as const, arquivada: true },
];
const regras = [
  { padrao: "PETZ", natureza: "fluxo" as const, categoria_id: "c-pet", classe: null, assinatura: false },
  { padrao: "NETFLIX", natureza: "fluxo" as const, categoria_id: "c-pet", classe: "Padrão de vida" as const, assinatura: true },
  { padrao: "APLICACAO", natureza: "aporte" as const, categoria_id: null, classe: null, assinatura: false },
];
const cartao = { id: "k", tipo: "cartao_credito" as const, dia_fechamento: 28 };
const conta = { id: "cc", tipo: "conta_corrente" as const, dia_fechamento: null };

const item = (p: Partial<ItemLido>): ItemLido => ({ data: "2026-10-10", descricao: "X", valor: 10, sentido: "saida", parcela: null, ...p });
const doc = (itens: ItemLido[], p: Partial<DocumentoLido> = {}): DocumentoLido => ({
  tipo: "fatura_cartao", banco: null, fechamento: "2026-10-28", vencimento: "2026-11-05", total_fatura: null,
  saldo_inicial: null, saldo_final: null, itens, avisos: [], ...p,
});
const ctx = (p: Partial<ContextoRevisao> = {}): ContextoRevisao => ({ conta: cartao, categorias: cats, regras, ...p });

describe("montarRevisao", () => {
  it("regra vence a IA; IA vale quando não há regra; categoria fora da família é ignorada", () => {
    const [petz, ia, desconhecida] = montarRevisao(
      doc([
        item({ descricao: "PETZ PINHEIROS", natureza_sugerida: "fluxo", categoria_sugerida: "Alimentação" }),
        item({ descricao: "RESTAURANTE", natureza_sugerida: "fluxo", categoria_sugerida: "Alimentação" }),
        item({ descricao: "LOJA", natureza_sugerida: "fluxo", categoria_sugerida: "Antiga" }),
      ]),
      ctx(),
    );
    expect([petz.categoria_id, petz.classe, petz.sugestao, petz.regra]).toEqual(["c-pet", "Padrão de vida", "regra", "PETZ"]);
    expect([ia.categoria_id, ia.classe, ia.sugestao]).toEqual(["c-ali", "Despesa básica", "ia"]);
    expect([desconhecida.categoria_id, desconhecida.sugestao, pendenciaDaLinha(desconhecida)]).toEqual([null, null, "Escolha a categoria"]);
  });

  it("assinatura e classe vêm da regra", () => {
    const [l] = montarRevisao(doc([item({ descricao: "NETFLIX.COM" })]), ctx());
    expect([l.assinatura, l.classe]).toEqual([true, "Padrão de vida"]);
  });

  it("cartão: tudo no mês da fatura (fechamento), ou no mês escolhido", () => {
    const d = doc([item({ data: "2026-09-29" }), item({ data: "2026-10-20" })]);
    expect(montarRevisao(d, ctx()).map((l) => l.mes_competencia)).toEqual(["2026-10", "2026-10"]);
    expect(montarRevisao(d, ctx({ mes_fatura: "2026-11" })).map((l) => l.mes_competencia)).toEqual(["2026-11", "2026-11"]);
  });

  it("cartão sem fechamento lido: regra do dia de fechamento do cartão", () => {
    const d = doc([item({ data: "2026-10-28" }), item({ data: "2026-10-29" })], { fechamento: null });
    expect(montarRevisao(d, ctx()).map((l) => l.mes_competencia)).toEqual(["2026-10", "2026-11"]);
  });

  it("conta: mês da data; entrada sem sugestão vira Receita", () => {
    const [sal, ali] = montarRevisao(
      doc([item({ data: "2026-11-01", sentido: "entrada", descricao: "TED RECEBIDA" }), item({ data: "2026-10-31", descricao: "MERCADO" })], { tipo: "extrato_conta" }),
      ctx({ conta }),
    );
    expect([sal.mes_competencia, sal.categoria_id, sal.classe, sal.estorno]).toEqual(["2026-11", "c-rec", "Receita", false]);
    expect(ali.mes_competencia).toBe("2026-10");
  });

  it("estorno no cartão: entrada numa categoria de despesa", () => {
    const [l] = montarRevisao(doc([item({ sentido: "entrada", descricao: "ESTORNO", natureza_sugerida: "fluxo", categoria_sugerida: "Alimentação" })]), ctx());
    expect([l.classe, l.estorno]).toEqual(["Despesa básica", true]);
  });

  it("pagamento recebido no cartão vira transferência e vai para o fim", () => {
    const linhas = montarRevisao(doc([item({ sentido: "entrada", descricao: "PAGAMENTO RECEBIDO" }), item({ descricao: "PETZ" })]), ctx());
    expect(linhas.map((l) => [l.descricao, l.natureza])).toEqual([
      ["PETZ", "fluxo"],
      ["PAGAMENTO RECEBIDO", "transferencia"],
    ]);
    expect(linhas[1].idx).toBe(0);
  });

  it("regra de aporte: sem categoria nem classe", () => {
    const [l] = montarRevisao(doc([item({ descricao: "APLICACAO CDB" })], { tipo: "extrato_conta" }), ctx({ conta }));
    expect([l.natureza, l.categoria_id, l.classe, pendenciaDaLinha(l)]).toEqual(["aporte", null, null, null]);
  });

  it("duplicada vem desmarcada", () => {
    const dup = { lancamento_id: "l1", descricao: "PETZ", data: "2026-10-10", valor: 10 };
    const [l] = montarRevisao(doc([item({ descricao: "PETZ" })]), ctx({ duplicadas: new Map([[0, dup]]) }));
    expect([l.incluir, l.duplicada]).toEqual([false, dup]);
  });

  it("parcela: liga ao previsto aberto da mesma compra; senão oferece criar as futuras", () => {
    const abertas = [
      { id: "p3", descricao: "Notebook loja online", valor: 480, parcela: "3/10", grupo_parcela: "g", mes_competencia: "2026-11" },
    ];
    const [ligada, nova, ultima] = montarRevisao(
      doc([
        item({ descricao: "NOTEBOOK LOJA", valor: 480.4, parcela: "3/10" }),
        item({ descricao: "MOVEIS", valor: 300, parcela: "1/3" }),
        item({ descricao: "TV", valor: 200, parcela: "3/3" }),
      ]),
      ctx({ parcelas_abertas: abertas }),
    );
    expect([ligada.vinculo, ligada.criar_futuras]).toEqual([{ previsto_id: "p3", grupo_parcela: "g", mes_competencia: "2026-11" }, false]);
    expect(ligada.categoria_id).toBeNull(); // previsto sem categoria: não herda nada
    expect([nova.vinculo, nova.criar_futuras]).toEqual([null, true]);
    expect(ultima.criar_futuras).toBe(false);
  });

  it("parcela ligada herda a categoria do previsto, salvo regra", () => {
    const abertas = [
      { id: "p3", descricao: "Notebook", valor: 480, parcela: "3/10", grupo_parcela: "g", mes_competencia: "2026-11", categoria_id: "c-mor", classe: "Sonhos" as const },
      { id: "q3", descricao: "Petz", valor: 90, parcela: "3/10", grupo_parcela: "h", mes_competencia: "2026-11", categoria_id: "c-mor", classe: "Sonhos" as const },
    ];
    const [note, petz] = montarRevisao(
      doc([
        item({ descricao: "NOTEBOOK", valor: 480, parcela: "3/10", natureza_sugerida: "fluxo", categoria_sugerida: "Alimentação" }),
        item({ descricao: "PETZ", valor: 90, parcela: "3/10" }),
      ]),
      ctx({ parcelas_abertas: abertas }),
    );
    expect([note.categoria_id, note.classe]).toEqual(["c-mor", "Sonhos"]);
    expect([petz.categoria_id, petz.sugestao]).toEqual(["c-pet", "regra"]);
  });

  it("não liga parcela de outra compra nem usa o mesmo previsto duas vezes", () => {
    const abertas = [{ id: "p", descricao: "Geladeira", valor: 480, parcela: "3/10", grupo_parcela: "g", mes_competencia: "2026-11" }];
    const linhas = montarRevisao(doc([item({ descricao: "NOTEBOOK", valor: 480, parcela: "3/10" })]), ctx({ parcelas_abertas: abertas }));
    expect(linhas[0].vinculo).toBeNull();
    const duas = montarRevisao(
      doc([item({ descricao: "GELADEIRA", valor: 480, parcela: "3/10" }), item({ descricao: "GELADEIRA", valor: 480, parcela: "3/10" })]),
      ctx({ parcelas_abertas: abertas }),
    );
    expect(duas.map((l) => l.vinculo?.previsto_id ?? null)).toEqual(["p", null]);
  });
});

describe("edição e conferência", () => {
  it("trocar a categoria ajusta classe e estorno; trocar para transferência limpa a categoria", () => {
    const [l] = montarRevisao(doc([item({ sentido: "entrada", descricao: "REEMBOLSO" })], { tipo: "extrato_conta" }), ctx({ conta }));
    expect([l.classe, l.estorno]).toEqual(["Receita", false]);
    const e = editarLinha(l, { categoria_id: "c-ali" }, cats);
    expect([e.classe, e.estorno, e.sugestao]).toEqual(["Despesa básica", true, "manual"]);
    const t = editarLinha(e, { natureza: "transferencia" }, cats);
    expect([t.categoria_id, t.classe, t.estorno]).toEqual([null, null, false]);
  });

  it("estornoPara", () => {
    expect([estornoPara("Receita", "saida"), estornoPara("Receita", "entrada"), estornoPara("Sonhos", "entrada"), estornoPara(null, "entrada")]).toEqual([
      true, false, true, false,
    ]);
  });

  it("confere a fatura: compras − estornos, sem pagamentos", () => {
    const d = doc([item({ valor: 100 }), item({ valor: 30, sentido: "entrada", descricao: "ESTORNO" }), item({ valor: 500, sentido: "entrada", descricao: "PAGAMENTO" })], {
      total_fatura: 70,
    });
    expect(conferirTotal(d, montarRevisao(d, ctx()))).toEqual({ rotulo: "Total da fatura", esperado: 70, lido: 70, diferenca: 0, confere: true });
    const falta = { ...d, total_fatura: 90 };
    expect(conferirTotal(falta, montarRevisao(falta, ctx()))?.diferenca).toBe(20);
  });

  it("confere o extrato pela variação do saldo; sem totais, não confere", () => {
    const d = doc([item({ valor: 1000, sentido: "entrada" }), item({ valor: 250 })], { tipo: "extrato_conta", saldo_inicial: 100, saldo_final: 850 });
    expect(conferirTotal(d, montarRevisao(d, ctx({ conta })))?.confere).toBe(true);
    expect(conferirTotal(doc([item({})], { total_fatura: null }), [])).toBeNull();
  });

  it("parcelas futuras a partir do mês seguinte, com a descrição sem a parcela", () => {
    expect(parcelasFuturas({ parcela: "2/4", mes_competencia: "2026-12", descricao: "LOJA PARC 02/04", valor: 50 })).toEqual([
      { parcela: "3/4", mes_competencia: "2027-01", descricao: "LOJA", valor: 50 },
      { parcela: "4/4", mes_competencia: "2027-02", descricao: "LOJA", valor: 50 },
    ]);
  });
});

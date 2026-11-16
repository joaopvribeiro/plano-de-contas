/**
 * Etapa 4: consentimento de IA, uso/limite e busca de duplicadas.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { como, superuser } from "./db";
import { montarCenario, type Cenario } from "./fixtures";

let s: Cenario;

beforeAll(async () => {
  s = await montarCenario();
});

describe("consentimento de IA", () => {
  it("sem consentimento, a família não tem IA liberada", async () => {
    const r = await como(s.membroA, async (c) => (await c.query("select public.familia_tem_consentimento_ia($1) ok", [s.A.id])).rows[0].ok);
    expect(r).toEqual({ ok: true, valor: false });
  });

  it("membro registra o consentimento e a família passa a ter IA", async () => {
    const r = await como(s.membroA, async (c) => {
      await c.query("insert into public.consentimentos (user_id, familia_id, tipo, versao) values (auth.uid(), $1, 'ia', 'ia-v1')", [s.A.id]);
      return (await c.query("select public.familia_tem_consentimento_ia($1) ok", [s.A.id])).rows[0].ok;
    });
    expect(r).toEqual({ ok: true, valor: true });
  });

  it("ninguém registra consentimento em nome de outra família", async () => {
    const r = await como(s.membroA, (c) =>
      c.query("insert into public.consentimentos (user_id, familia_id, tipo, versao) values (auth.uid(), $1, 'ia', 'ia-v1')", [s.B.id]),
    );
    expect(r.ok).toBe(false);
  });

  it("consulta de outra família responde falso", async () => {
    await superuser((c) =>
      c.query("insert into public.consentimentos (user_id, familia_id, tipo, versao) values ($1, $2, 'ia', 'ia-v1')", [s.membroB.id, s.B.id]),
    );
    const r = await como(s.membroA, async (c) => (await c.query("select public.familia_tem_consentimento_ia($1) ok", [s.B.id])).rows[0].ok);
    expect(r).toEqual({ ok: true, valor: false });
  });
});

describe("uso de IA", () => {
  it("conta os usos do mês e devolve o limite", async () => {
    const r = await como(s.membroA, async (c) => {
      await c.query("select public.registrar_uso_ia($1, 'extrato', 'claude-haiku-5-5', 1000, 200)", [s.A.id]);
      await c.query("select public.registrar_uso_ia($1, 'extrato', 'claude-haiku-5-5', 1000, 200)", [s.A.id]);
      return (await c.query("select * from public.uso_ia_no_mes($1, 'extrato')", [s.A.id])).rows[0];
    });
    // O cenário já tem 1 uso de extrato (fixture) + 2 registrados agora.
    expect(r).toEqual({ ok: true, valor: { usados: 3, limite: 20 } });
  });

  it("não registra uso em outra família nem lê o uso dela", async () => {
    const reg = await como(s.membroA, (c) => c.query("select public.registrar_uso_ia($1, 'extrato', 'x', 1, 1)", [s.B.id]));
    expect(reg.ok).toBe(false);
    const ler = await como(s.membroA, async (c) => (await c.query("select * from public.uso_ia_no_mes($1, 'extrato')", [s.B.id])).rowCount);
    expect(ler).toEqual({ ok: true, valor: 0 });
  });
});

describe("possíveis duplicadas", () => {
  const itens = (descricao: string, data: string, valor: number) => JSON.stringify([{ idx: 7, data, valor, descricao }]);

  it("acha o lançamento da mesma conta, valor e data próxima com descrição parecida", async () => {
    // Fixture: "Mercado", R$ 250, conta Cartão, sem data. Damos uma data a ele.
    await superuser((c) => c.query("update public.lancamentos set data = '2026-10-10' where id = $1", [s.A.lancamentoId]));
    const r = await como(s.membroA, async (c) =>
      (await c.query("select idx, lancamento_id from public.possiveis_duplicadas($1, $2, $3::jsonb)", [s.A.id, s.A.contaId, itens("MERCADO", "2026-10-12", 250)])).rows,
    );
    expect(r).toEqual({ ok: true, valor: [{ idx: 7, lancamento_id: s.A.lancamentoId }] });
  });

  it("ignora valor diferente, data a mais de 3 dias, outra conta ou descrição diferente", async () => {
    const casos = [
      itens("MERCADO", "2026-10-12", 251),
      itens("MERCADO", "2026-10-14", 250),
      itens("POSTO SHELL", "2026-10-10", 250),
    ];
    for (const caso of casos) {
      const r = await como(s.membroA, async (c) =>
        (await c.query("select 1 from public.possiveis_duplicadas($1, $2, $3::jsonb)", [s.A.id, s.A.contaId, caso])).rowCount,
      );
      expect(r, caso).toEqual({ ok: true, valor: 0 });
    }
    const outraConta = await como(s.membroA, async (c) =>
      (await c.query("select 1 from public.possiveis_duplicadas($1, null, $2::jsonb)", [s.A.id, itens("MERCADO", "2026-10-10", 250)])).rowCount,
    );
    expect(outraConta).toEqual({ ok: true, valor: 0 });
  });

  it("não enxerga lançamentos de outra família", async () => {
    const r = await como(s.membroA, async (c) =>
      (await c.query("select 1 from public.possiveis_duplicadas($1, $2, $3::jsonb)", [s.B.id, s.B.contaId, itens("MERCADO", "2026-10-10", 250)])).rowCount,
    );
    expect(r).toEqual({ ok: true, valor: 0 });
  });
});

describe("confirmar importação", () => {
  async function novaImportacao(familia: string, conta: string) {
    return superuser(async (c) => {
      const { rows } = await c.query(
        "insert into public.importacoes (familia_id, conta_id, status, resposta_ia) values ($1, $2, 'revisao', '{}') returning id",
        [familia, conta],
      );
      return rows[0].id as string;
    });
  }
  const realizado = (id: string, extra: Record<string, unknown> = {}) => ({
    id, tipo: "Realizado", natureza: "fluxo", mes_competencia: "2026-10", data: "2026-10-05", descricao: "PETZ",
    valor: 120.5, estorno: false, categoria_id: null, classe: "Padrão de vida", parcela: null, grupo_parcela: null,
    assinatura: false, origem: "ia", ...extra,
  });

  it("membro grava realizados e parcelas futuras, liga o previsto e cria a regra numa transação só", async () => {
    const imp = await novaImportacao(s.A.id, s.A.contaId);
    const grupo = "00000000-0000-4000-8000-0000000000aa";
    const previsto = await superuser(async (c) => {
      const { rows } = await c.query(
        `insert into public.lancamentos (familia_id, tipo, mes_competencia, descricao, valor, conta_id, classe, parcela, grupo_parcela, origem)
         values ($1, 'Previsto', '2026-10', 'Notebook', 480, $2, 'Padrão de vida', '3/10', $3, 'ia-parcela') returning id`,
        [s.A.id, s.A.contaId, grupo],
      );
      return rows[0].id as string;
    });
    const r1 = "00000000-0000-4000-8000-0000000000b1";
    const r2 = "00000000-0000-4000-8000-0000000000b2";
    const f1 = "00000000-0000-4000-8000-0000000000b3";
    // como() sempre desfaz a transação: a conferência roda dentro dela, vista pelo próprio membro.
    const r = await como(s.membroA, async (c) => {
      const n = await c.query("select public.confirmar_importacao($1, $2::jsonb, $3::jsonb, $4::jsonb) n", [
        imp,
        JSON.stringify([
          realizado(r1),
          realizado(r2, { descricao: "NOTEBOOK", valor: 480, parcela: "3/10", grupo_parcela: grupo }),
          realizado(f1, { tipo: "Previsto", origem: "ia-parcela", mes_competencia: "2026-11", parcela: "2/2", grupo_parcela: "00000000-0000-4000-8000-0000000000cc" }),
        ]),
        JSON.stringify([{ previsto_id: previsto, realizado_id: r2, grupo_parcela: grupo }]),
        JSON.stringify([{ padrao: "LOJA NOVA", natureza: "fluxo", categoria_id: null, classe: "Padrão de vida" }]),
      ]);
      return {
        n: n.rows[0].n,
        vinculo: (await c.query("select realizado_id from public.lancamentos where id = $1", [previsto])).rows[0].realizado_id,
        conta: (await c.query("select count(*)::int n from public.lancamentos where importacao_id = $1 and conta_id = $2", [imp, s.A.contaId])).rows[0].n,
        status: (await c.query("select status from public.importacoes where id = $1", [imp])).rows[0].status,
        regra: (await c.query("select count(*)::int n from public.regras where familia_id = $1 and padrao = 'LOJA NOVA'", [s.A.id])).rows[0].n,
      };
    });
    expect(r).toEqual({ ok: true, valor: { n: 3, vinculo: r2, conta: 3, status: "confirmada", regra: 1 } });
  });

  it("não confirma duas vezes", async () => {
    const imp = await novaImportacao(s.A.id, s.A.contaId);
    const lote = (id: string) => JSON.stringify([realizado(id)]);
    const r = await como(s.membroA, async (c) => {
      await c.query("select public.confirmar_importacao($1, $2::jsonb, '[]', '[]')", [imp, lote("00000000-0000-4000-8000-0000000000d1")]);
      await c.query("select public.confirmar_importacao($1, $2::jsonb, '[]', '[]')", [imp, lote("00000000-0000-4000-8000-0000000000d2")]);
    });
    expect(r.ok).toBe(false);
  });

  it("a função só grava origem de importação; previsto comum do membro é barrado pela RLS", async () => {
    const imp = await novaImportacao(s.A.id, s.A.contaId);
    const filtrado = await como(s.membroA, async (c) => {
      await c.query("select public.confirmar_importacao($1, $2::jsonb, '[]', '[]')", [
        imp,
        JSON.stringify([realizado("00000000-0000-4000-8000-0000000000e1"), realizado("00000000-0000-4000-8000-0000000000e2", { tipo: "Previsto", origem: "planilha" })]),
      ]);
      return (await c.query("select count(*)::int n from public.lancamentos where importacao_id = $1", [imp])).rows[0].n;
    });
    expect(filtrado).toEqual({ ok: true, valor: 1 });
    // Previsto com origem 'ia' (não 'ia-parcela'): a RLS barra e nada fica gravado.
    const barrado = await como(s.membroA, (c) =>
      c.query("select public.confirmar_importacao($1, $2::jsonb, '[]', '[]')", [
        imp,
        JSON.stringify([realizado("00000000-0000-4000-8000-0000000000e3"), realizado("00000000-0000-4000-8000-0000000000e4", { tipo: "Previsto" })]),
      ]),
    );
    expect(barrado.ok).toBe(false);
  });

  it("não confirma importação de outra família", async () => {
    const imp = await novaImportacao(s.B.id, s.B.contaId);
    const r = await como(s.membroA, (c) =>
      c.query("select public.confirmar_importacao($1, $2::jsonb, '[]', '[]')", [imp, JSON.stringify([realizado("00000000-0000-4000-8000-0000000000f1")])]),
    );
    expect(r.ok).toBe(false);
    const status = await superuser(async (c) => (await c.query("select status from public.importacoes where id = $1", [imp])).rows[0].status);
    expect(status).toBe("revisao");
  });
});

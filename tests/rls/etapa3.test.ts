/**
 * Etapa 3: orçamento previsto só do consultor e biblioteca de regras padrão.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { como, contarComo, superuser } from "./db";
import { montarCenario, type Cenario } from "./fixtures";

let s: Cenario;
let previstoA: string;

beforeAll(async () => {
  s = await montarCenario();
  previstoA = await superuser(async (c) =>
    (
      await c.query(
        "insert into public.lancamentos (familia_id, tipo, mes_competencia, descricao, valor, classe, origem) values ($1, 'Previsto', '2026-11', 'Aluguel', 3000, 'Despesa básica', 'planilha') returning id",
        [s.A.id],
      )
    ).rows[0].id as string,
  );
});

const inserirPrevisto = (origem: string) =>
  `insert into public.lancamentos (familia_id, tipo, mes_competencia, descricao, valor, classe, origem)
   values ($1, 'Previsto', '2026-12', 'Teste', 10, 'Sonhos', '${origem}')`;

describe("orçamento previsto", () => {
  it("membro não cria previsto manual nem de planilha", async () => {
    for (const origem of ["manual", "planilha"]) {
      const r = await como(s.membroA, (c) => c.query(inserirPrevisto(origem), [s.A.id]));
      expect(r.ok, origem).toBe(false);
    }
  });

  it("membro cria parcelas futuras previstas (ia-parcela)", async () => {
    const r = await como(s.membroA, (c) => c.query(inserirPrevisto("ia-parcela"), [s.A.id]));
    expect(r.ok).toBe(true);
  });

  it("membro não altera nem exclui o previsto do consultor", async () => {
    const up = await como(s.membroA, async (c) =>
      (await c.query("update public.lancamentos set valor = 1 where id = $1", [previstoA])).rowCount,
    );
    expect(up).toEqual({ ok: true, valor: 0 });
    const del = await como(s.membroA, async (c) =>
      (await c.query("delete from public.lancamentos where id = $1", [previstoA])).rowCount,
    );
    expect(del).toEqual({ ok: true, valor: 0 });
  });

  it("membro vê o previsto", async () => {
    expect(await contarComo(s.membroA, "select 1 from public.lancamentos where id = $1", [previstoA])).toBe(1);
  });

  it("membro não transforma um realizado seu em previsto", async () => {
    const r = await como(s.membroA, (c) =>
      c.query("update public.lancamentos set tipo = 'Previsto' where id = $1", [s.A.lancamentoId]),
    );
    expect(r.ok).toBe(false);
  });

  it("membro continua criando e editando realizados", async () => {
    const r = await como(s.membroA, async (c) => {
      await c.query(
        "insert into public.lancamentos (familia_id, tipo, mes_competencia, data, descricao, valor, classe) values ($1, 'Realizado', '2026-11', '2026-11-10', 'Feira', 80, 'Despesa básica')",
        [s.A.id],
      );
      return (await c.query("update public.lancamentos set valor = 260 where id = $1", [s.A.lancamentoId])).rowCount;
    });
    expect(r).toEqual({ ok: true, valor: 1 });
  });

  it("consultor da família cria, altera e exclui previsto", async () => {
    const r = await como(s.consultorA, async (c) => {
      await c.query(inserirPrevisto("planilha"), [s.A.id]);
      const up = await c.query("update public.lancamentos set valor = 3100 where id = $1", [previstoA]);
      const del = await c.query("delete from public.lancamentos where id = $1", [previstoA]);
      return [up.rowCount, del.rowCount];
    });
    expect(r).toEqual({ ok: true, valor: [1, 1] });
  });

  it("consultor de outra família não cria previsto nela", async () => {
    const r = await como(s.consultorA, (c) => c.query(inserirPrevisto("planilha"), [s.B.id]));
    expect(r.ok).toBe(false);
  });
});

describe("regras padrão", () => {
  it("família nova já nasce com as regras padrão", async () => {
    const n = await superuser(async (c) =>
      (await c.query("select count(*)::int n from public.regras where familia_id = $1", [s.A.id])).rows[0].n,
    );
    expect(n).toBeGreaterThanOrEqual(30);
  });

  it("membro não lê a biblioteca; consultor lê", async () => {
    const r = await como(s.membroA, (c) => c.query("select 1 from public.regras_modelo"));
    expect(r.ok && r.valor.rowCount).toBe(0);
    expect(await contarComo(s.consultorA, "select 1 from public.regras_modelo")).toBeGreaterThan(0);
  });

  it("só admin altera a biblioteca", async () => {
    const naoAdmin = await como(s.consultorA, (c) =>
      c.query("insert into public.regras_modelo (padrao, natureza) values ('XPTO', 'transferencia')"),
    );
    expect(naoAdmin.ok).toBe(false);
    const admin = await como(s.admin, (c) =>
      c.query("insert into public.regras_modelo (padrao, natureza) values ('XPTO', 'transferencia')"),
    );
    expect(admin.ok).toBe(true);
  });

  it("aplicar regras padrão: só o consultor da família, sem duplicar", async () => {
    const membro = await como(s.membroA, (c) => c.query("select public.aplicar_regras_modelo($1)", [s.A.id]));
    expect(membro.ok).toBe(false);
    const outro = await como(s.consultorSemVinculo, (c) => c.query("select public.aplicar_regras_modelo($1)", [s.A.id]));
    expect(outro.ok).toBe(false);
    const ok = await como(s.consultorA, async (c) => (await c.query("select public.aplicar_regras_modelo($1) n", [s.A.id])).rows[0].n);
    // Todas já existem desde a criação: nada novo é inserido.
    expect(ok).toEqual({ ok: true, valor: 0 });
  });

  it("aplicar recria uma regra padrão apagada, sem mexer nas outras", async () => {
    const r = await como(s.consultorA, async (c) => {
      await c.query("delete from public.regras where familia_id = $1 and padrao = 'IFOOD'", [s.A.id]);
      await c.query("update public.regras set assinatura = true where familia_id = $1 and padrao = 'UBER'", [s.A.id]);
      const n = (await c.query("select public.aplicar_regras_modelo($1) n", [s.A.id])).rows[0].n;
      const uber = (await c.query("select assinatura from public.regras where familia_id = $1 and padrao = 'UBER'", [s.A.id])).rows[0];
      return { n, uberAssinatura: uber.assinatura };
    });
    expect(r).toEqual({ ok: true, valor: { n: 1, uberAssinatura: true } });
  });
});

describe("minhas_familias", () => {
  it("indica quem é consultor da família", async () => {
    const membro = await como(s.membroA, async (c) => (await c.query("select papel, consultor from public.minhas_familias()")).rows);
    expect(membro).toEqual({ ok: true, valor: [{ papel: "membro", consultor: false }] });
    const consultor = await como(s.consultorA, async (c) =>
      (await c.query("select papel, consultor from public.minhas_familias() where id = $1", [s.A.id])).rows,
    );
    expect(consultor).toEqual({ ok: true, valor: [{ papel: "consultor", consultor: true }] });
  });
});

describe("resumo_dfc", () => {
  it("soma por mês e classe e respeita a RLS", async () => {
    const r = await como(s.membroA, async (c) =>
      (await c.query("select * from public.resumo_dfc($1, '2026-01', '2027-12') where tipo = 'Realizado'", [s.A.id])).rows,
    );
    expect(r.ok && r.valor).toEqual([
      { mes_competencia: "2026-10", tipo: "Realizado", natureza: "fluxo", classe: "Despesa básica", estorno: false, valor: "250.00" },
    ]);
    const outra = await como(s.membroA, async (c) => (await c.query("select * from public.resumo_dfc($1, '2026-01', '2027-12')", [s.B.id])).rowCount);
    expect(outra).toEqual({ ok: true, valor: 0 });
  });
});

/**
 * Etapa 5: histórico pela data do saldo, cota de IA compartilhada e confirmação do relatório.
 * como() sempre desfaz a transação: as conferências rodam dentro dela.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { como, superuser } from "./db";
import { montarCenario, type Cenario } from "./fixtures";

let s: Cenario;
beforeAll(async () => {
  s = await montarCenario();
});

describe("histórico do ativo", () => {
  it("grava o ponto na data do saldo e substitui o ponto do mesmo dia", async () => {
    const r = await como(s.membroA, async (c) => {
      await c.query("update public.ativos set valor = 1100, data_saldo = '2026-10-31' where id = $1", [s.A.ativoId]);
      await c.query("update public.ativos set valor = 1150 where id = $1", [s.A.ativoId]);
      // Mesmo saldo com data nova também é um ponto.
      await c.query("update public.ativos set data_saldo = '2026-11-30' where id = $1", [s.A.ativoId]);
      return (await c.query("select valor::float, data::text from public.historico_ativos where ativo_id = $1 and data in ('2026-10-31', '2026-11-30') order by data", [s.A.ativoId])).rows;
    });
    expect(r).toEqual({
      ok: true,
      valor: [
        { valor: 1150, data: "2026-10-31" },
        { valor: 1150, data: "2026-11-30" },
      ],
    });
  });

  it("dívida também usa a data do saldo", async () => {
    const r = await como(s.membroA, async (c) => {
      await c.query("update public.passivos set saldo_devedor = 500, data_saldo = '2026-10-31' where id = $1", [s.A.passivoId]);
      return (await c.query("select saldo_devedor::float v from public.historico_passivos where passivo_id = $1 and data = '2026-10-31'", [s.A.passivoId])).rows;
    });
    expect(r).toEqual({ ok: true, valor: [{ v: 500 }] });
  });
});

describe("cota de IA", () => {
  it("extratos e relatórios dividem a mesma cota", async () => {
    const r = await como(s.membroA, async (c) => {
      const antes = (await c.query("select usados from public.uso_ia_no_mes($1, 'extrato')", [s.A.id])).rows[0].usados;
      await c.query("select public.registrar_uso_ia($1, 'relatorio', 'x', 1, 1)", [s.A.id]);
      const extrato = (await c.query("select usados from public.uso_ia_no_mes($1, 'extrato')", [s.A.id])).rows[0].usados;
      const relatorio = (await c.query("select usados, limite from public.uso_ia_no_mes($1, 'relatorio')", [s.A.id])).rows[0];
      return { cresceu: extrato - antes, relatorio };
    });
    expect(r).toEqual({ ok: true, valor: { cresceu: 1, relatorio: { usados: expect.any(Number), limite: 20 } } });
  });
});

describe("confirmar relatório", () => {
  async function relatorio(familia: string) {
    return superuser(async (c) => {
      const { rows } = await c.query("insert into public.importacoes (familia_id, tipo, status, resposta_ia) values ($1, 'relatorio', 'revisao', '{}') returning id", [familia]);
      return rows[0].id as string;
    });
  }

  it("atualiza, cria e zera posições com a data de referência, numa transação só", async () => {
    const imp = await relatorio(s.A.id);
    const r = await como(s.membroA, async (c) => {
      const extra = (await c.query("insert into public.ativos (familia_id, nome, categoria, instituicao, valor) values ($1, 'Fundo vendido', 'Investimentos', 'XP', 300) returning id", [s.A.id])).rows[0].id;
      const n = (
        await c.query("select public.confirmar_relatorio($1, '2026-11-04', $2::jsonb, $3::jsonb, $4::jsonb) n", [
          imp,
          JSON.stringify([{ id: s.A.ativoId, valor: 2000, valor_liquido: 1980, categoria: "Reserva", chave_relatorio: "XP|CDB" }]),
          JSON.stringify([{ nome: "Tesouro IPCA+ 2029", categoria: "Investimentos", instituicao: "XP", produto: "IPCA+", valor: 22232.82, liquidez: "D+1", risco: "médio", chave_relatorio: "XP|TESOURO IPCA 2029" }]),
          JSON.stringify([extra]),
        ])
      ).rows[0].n;
      const ativos = (await c.query("select nome, valor::float, data_saldo::text, origem from public.ativos where familia_id = $1 and data_saldo = '2026-11-04' order by nome", [s.A.id])).rows;
      const hist = (await c.query("select count(*)::int n from public.historico_ativos where familia_id = $1 and data = '2026-11-04'", [s.A.id])).rows[0].n;
      const status = (await c.query("select status from public.importacoes where id = $1", [imp])).rows[0].status;
      return { n, ativos, hist, status };
    });
    expect(r).toEqual({
      ok: true,
      valor: {
        n: 3,
        ativos: [
          { nome: "CDB", valor: 2000, data_saldo: "2026-11-04", origem: "relatorio" },
          { nome: "Fundo vendido", valor: 0, data_saldo: "2026-11-04", origem: "manual" },
          { nome: "Tesouro IPCA+ 2029", valor: 22232.82, data_saldo: "2026-11-04", origem: "relatorio" },
        ],
        hist: 3,
        status: "confirmada",
      },
    });
  });

  it("não mexe em ativo de outra família nem confirma relatório alheio", async () => {
    const meu = await relatorio(s.A.id);
    const r = await como(s.membroA, async (c) => {
      await c.query("select public.confirmar_relatorio($1, '2026-11-04', $2::jsonb, '[]', $3::jsonb)", [
        meu,
        JSON.stringify([{ id: s.B.ativoId, valor: 1 }]),
        JSON.stringify([s.B.ativoId]),
      ]);
      return true;
    });
    expect(r.ok).toBe(true);
    const valorB = await superuser(async (c) => (await c.query("select valor::float v from public.ativos where id = $1", [s.B.ativoId])).rows[0].v);
    expect(valorB).toBe(1000);

    const alheio = await relatorio(s.B.id);
    const r2 = await como(s.membroA, (c) => c.query("select public.confirmar_relatorio($1, '2026-11-04', '[]', '[]', '[]')", [alheio]));
    expect(r2.ok).toBe(false);
  });

  it("extrato não é confirmado como relatório", async () => {
    const imp = await superuser(async (c) => (await c.query("insert into public.importacoes (familia_id, status, resposta_ia) values ($1, 'revisao', '{}') returning id", [s.A.id])).rows[0].id);
    const r = await como(s.membroA, (c) => c.query("select public.confirmar_relatorio($1, '2026-11-04', '[]', '[]', '[]')", [imp]));
    expect(r.ok).toBe(false);
  });
});

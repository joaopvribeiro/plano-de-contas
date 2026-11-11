/**
 * Isolamento entre famílias (RLS).
 *
 * Prova que um membro da família A não lê, não insere, não altera e não apaga
 * nada da família B — em todas as tabelas com familia_id e no Storage —, e que
 * os papéis de consultor e admin enxergam exatamente o que devem.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { como, contarComo, superuser } from "./db";
import { insercoes, montarCenario, TABELAS_COM_FAMILIA, type Cenario } from "./fixtures";

let s: Cenario;

beforeAll(async () => {
  s = await montarCenario();
});

describe("cobertura", () => {
  it("toda tabela do esquema public tem RLS ligada", async () => {
    const semRls = await superuser(async (c) =>
      (await c.query("select tablename from pg_tables where schemaname = 'public' and not rowsecurity")).rows,
    );
    expect(semRls).toEqual([]);
  });

  it("a lista de tabelas testadas cobre todas as tabelas com familia_id", async () => {
    const reais = await superuser(async (c) =>
      (
        await c.query(
          `select c.table_name from information_schema.columns c
           join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'familia_id' and t.table_type = 'BASE TABLE'
           order by 1`,
        )
      ).rows.map((r) => r.table_name),
    );
    expect(reais).toEqual([...TABELAS_COM_FAMILIA].sort());
  });
});

describe("membro da família A diante dos dados da família B", () => {
  for (const tabela of TABELAS_COM_FAMILIA) {
    describe(tabela, () => {
      it("não lê nenhuma linha de B", async () => {
        const n = await contarComo(s.membroA, `select 1 from public.${tabela} where familia_id = $1`, [s.B.id]);
        expect(n).toBe(0);
      });

      it("não vê linhas de nenhuma outra família, mesmo sem filtro", async () => {
        const n = await contarComo(s.membroA, `select 1 from public.${tabela} where familia_id <> $1`, [s.A.id]);
        expect(n).toBe(0);
      });

      it("não insere linha em B", async () => {
        const ins = insercoes(s.B)[tabela];
        const r = await como(s.membroA, (c) => c.query(ins.sql, ins.params));
        expect(r.ok, `inserção em ${tabela} de B deveria falhar`).toBe(false);
        if (!r.ok) expect(r.codigo).toBe("42501");
      });

      it("não altera linhas de B", async () => {
        const r = await como(s.membroA, async (c) =>
          (await c.query(`update public.${tabela} set familia_id = familia_id where familia_id = $1`, [s.B.id])).rowCount,
        );
        // Ou a política bloqueia (sem privilégio), ou nenhuma linha é visível para alterar.
        if (r.ok) expect(r.valor).toBe(0);
        else expect(r.codigo).toBe("42501");
      });

      it("não apaga linhas de B", async () => {
        const antes = await superuser(async (c) =>
          (await c.query(`select count(*)::int n from public.${tabela} where familia_id = $1`, [s.B.id])).rows[0].n,
        );
        const r = await como(s.membroA, async (c) =>
          (await c.query(`delete from public.${tabela} where familia_id = $1`, [s.B.id])).rowCount,
        );
        if (r.ok) expect(r.valor).toBe(0);
        else expect(r.codigo).toBe("42501");
        // A transação de `como` sempre faz rollback; conferimos que B continua com tudo.
        const depois = await superuser(async (c) =>
          (await c.query(`select count(*)::int n from public.${tabela} where familia_id = $1`, [s.B.id])).rows[0].n,
        );
        expect(depois).toBe(antes);
      });
    });
  }

  it("não move um lançamento seu para a família B", async () => {
    const r = await como(s.membroA, (c) =>
      c.query("update public.lancamentos set familia_id = $1 where id = $2", [s.B.id, s.A.lancamentoId]),
    );
    expect(r.ok).toBe(false);
  });

  it("não usa categoria ou conta de B em um lançamento de A", async () => {
    const r = await como(s.membroA, (c) =>
      c.query(
        `insert into public.lancamentos (familia_id, tipo, mes_competencia, descricao, valor, categoria_id, classe)
         values ($1, 'Previsto', '2026-11', 'x', 1, $2, 'Despesa básica')`,
        [s.A.id, s.B.categoriaId],
      ),
    );
    expect(r.ok).toBe(false);
    const r2 = await como(s.membroA, (c) =>
      c.query(
        `insert into public.lancamentos (familia_id, tipo, mes_competencia, descricao, valor, conta_id, classe)
         values ($1, 'Previsto', '2026-11', 'x', 1, $2, 'Despesa básica')`,
        [s.A.id, s.B.contaId],
      ),
    );
    expect(r2.ok).toBe(false);
  });

  it("não lê a família B nem a altera", async () => {
    expect(await contarComo(s.membroA, "select 1 from public.familias where id = $1", [s.B.id])).toBe(0);
    const r = await como(s.membroA, async (c) =>
      (await c.query("update public.familias set nome = 'x' where id = $1", [s.B.id])).rowCount,
    );
    expect(r.ok && r.valor).toBe(0);
  });

  it("não lê nem envia arquivos no Storage de B", async () => {
    expect(await contarComo(s.membroA, "select 1 from storage.objects where name = $1", [s.B.objeto])).toBe(0);
    const r = await como(s.membroA, (c) =>
      c.query("insert into storage.objects (bucket_id, name) values ('familias', $1)", [`${s.B.id}/extratos/intruso.pdf`]),
    );
    expect(r.ok).toBe(false);
    const apagou = await como(s.membroA, async (c) =>
      (await c.query("delete from storage.objects where name = $1", [s.B.objeto])).rowCount,
    );
    expect(apagou.ok && apagou.valor).toBe(0);
  });

  it("não envia arquivo com caminho inválido (sem família)", async () => {
    const r = await como(s.membroA, (c) =>
      c.query("insert into storage.objects (bucket_id, name) values ('familias', 'sem-familia/x.pdf')"),
    );
    expect(r.ok).toBe(false);
  });
});

describe("membro da família A nos próprios dados", () => {
  it("lê os lançamentos e os arquivos da própria família", async () => {
    expect(await contarComo(s.membroA, "select 1 from public.lancamentos where familia_id = $1", [s.A.id])).toBeGreaterThan(0);
    expect(await contarComo(s.membroA, "select 1 from storage.objects where name = $1", [s.A.objeto])).toBe(1);
  });

  it("cria, altera e apaga um lançamento na própria família", async () => {
    const r = await como(s.membroA, async (c) => {
      const ins = await c.query(
        "insert into public.lancamentos (familia_id, tipo, mes_competencia, descricao, valor, classe) values ($1, 'Previsto', '2026-12', 'Teste', 99, 'Sonhos') returning id",
        [s.A.id],
      );
      const id = ins.rows[0].id;
      const up = await c.query("update public.lancamentos set valor = 100 where id = $1", [id]);
      const del = await c.query("delete from public.lancamentos where id = $1", [id]);
      return [up.rowCount, del.rowCount];
    });
    expect(r).toEqual({ ok: true, valor: [1, 1] });
  });

  it("não altera configurações reservadas ao consultor", async () => {
    for (const sql of [
      "update public.limites_ia set extrato_mes = 999 where familia_id = $1",
      "update public.metas_classe set percentual_max_receita = 99 where familia_id = $1",
      "update public.objetivos_config set reserva_meses = 1 where familia_id = $1",
    ]) {
      const r = await como(s.membroA, async (c) => (await c.query(sql, [s.A.id])).rowCount);
      expect(r.ok && r.valor, sql).toBe(0);
    }
  });

  it("não lê os convites (o token é segredo)", async () => {
    expect(await contarComo(s.membroA, "select 1 from public.convites")).toBe(0);
  });

  it("não se promove a consultor nem a admin", async () => {
    const r = await como(s.membroA, (c) =>
      c.query("insert into public.consultores (user_id, nome, admin) values (auth.uid(), 'Eu', true)"),
    );
    expect(r.ok).toBe(false);
  });

  it("não cria famílias", async () => {
    const r = await como(s.membroA, (c) =>
      c.query("insert into public.familias (nome, inicio_planejamento) values ('Nova', '2026-11')"),
    );
    expect(r.ok).toBe(false);
    const r2 = await como(s.membroA, (c) => c.query("select public.criar_familia('Nova', '2026-11')"));
    expect(r2.ok).toBe(false);
  });

  it("não escreve auditoria nem uso de IA da própria família", async () => {
    for (const t of ["auditoria", "uso_ia"] as const) {
      const ins = insercoes(s.A)[t];
      const r = await como(s.membroA, (c) => c.query(ins.sql, ins.params));
      expect(r.ok, t).toBe(false);
    }
  });
});

describe("consultores e admin", () => {
  it("consultor atribuído vê a família A e não vê a B", async () => {
    expect(await contarComo(s.consultorA, "select 1 from public.familias where id = $1", [s.A.id])).toBe(1);
    expect(await contarComo(s.consultorA, "select 1 from public.familias where id = $1", [s.B.id])).toBe(0);
    expect(await contarComo(s.consultorA, "select 1 from public.lancamentos where familia_id = $1", [s.B.id])).toBe(0);
  });

  it("consultor atribuído altera configurações da família A", async () => {
    const r = await como(s.consultorA, async (c) =>
      (await c.query("update public.limites_ia set extrato_mes = 30 where familia_id = $1", [s.A.id])).rowCount,
    );
    expect(r).toEqual({ ok: true, valor: 1 });
  });

  it("consultor sem vínculo não vê nenhuma família", async () => {
    expect(await contarComo(s.consultorSemVinculo, "select 1 from public.familias")).toBe(0);
    expect(await contarComo(s.consultorSemVinculo, "select 1 from public.lancamentos")).toBe(0);
  });

  it("consultor não se atribui a uma família sozinho", async () => {
    const ins = insercoes(s.B).familia_consultores;
    const r = await como(s.consultorSemVinculo, (c) => c.query(ins.sql, ins.params));
    expect(r.ok).toBe(false);
  });

  it("consultor que cria uma família fica vinculado a ela automaticamente", async () => {
    const r = await como(s.consultorSemVinculo, async (c) => {
      const f = await c.query("select public.criar_familia('Nova família', '2026-11') as id");
      const id = f.rows[0].id;
      const cats = await c.query("select 1 from public.categorias where familia_id = $1", [id]);
      return { vista: (await c.query("select 1 from public.familias where id = $1", [id])).rowCount, cats: cats.rowCount };
    });
    expect(r).toEqual({ ok: true, valor: { vista: 1, cats: 15 } });
  });

  it("admin vê todas as famílias", async () => {
    const n = await contarComo(s.admin, "select 1 from public.familias where id = any($1)", [[s.A.id, s.B.id]]);
    expect(n).toBe(2);
  });
});

describe("anônimo", () => {
  it("não acessa nenhuma tabela", async () => {
    for (const t of ["familias", "lancamentos", "ativos", "apolices"]) {
      const r = await como("anon", (c) => c.query(`select 1 from public.${t}`));
      expect(r.ok, t).toBe(false);
    }
  });
});

describe("convites", () => {
  async function criarConvite(email: string) {
    return superuser(async (c) =>
      (await c.query("insert into public.convites (familia_id, email, nome) values ($1, $2, 'Convidado') returning token", [s.B.id, email]))
        .rows[0].token as string,
    );
  }

  it("só o e-mail convidado consegue aceitar", async () => {
    const token = await criarConvite(s.convidadoB.email);
    const errado = await como(s.membroA, (c) => c.query("select public.aceitar_convite($1)", [token]));
    expect(errado.ok).toBe(false);
  });

  it("o convidado entra na família e passa a ver os dados dela", async () => {
    const token = await criarConvite(s.convidadoB.email);
    const r = await como(s.convidadoB, async (c) => {
      await c.query("select public.aceitar_convite($1)", [token]);
      return (await c.query("select 1 from public.lancamentos where familia_id = $1", [s.B.id])).rowCount;
    });
    expect(r.ok && r.valor).toBeGreaterThan(0);
  });

  it("convite expirado é recusado", async () => {
    const token = await criarConvite(s.convidadoB.email);
    await superuser((c) => c.query("update public.convites set expira_em = now() - interval '1 day' where token = $1", [token]));
    const r = await como(s.convidadoB, (c) => c.query("select public.aceitar_convite($1)", [token]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensagem).toMatch(/expirou/);
  });
});

describe("auditoria", () => {
  it("registra a alteração de um lançamento sem gravar textos", async () => {
    const linha = await superuser(async (c) => {
      await c.query("update public.lancamentos set valor = 260, descricao = 'Mercado secreto' where id = $1", [s.A.lancamentoId]);
      return (
        await c.query(
          "select campos_alterados, valores_numericos from public.auditoria where tabela = 'lancamentos' and registro_id = $1 and acao = 'UPDATE' order by id desc limit 1",
          [s.A.lancamentoId],
        )
      ).rows[0];
    });
    expect(linha.campos_alterados).toEqual(["descricao", "valor"]);
    expect(JSON.stringify(linha.valores_numericos)).not.toContain("secreto");
    expect(linha.valores_numericos.valor).toEqual({ antes: 250, depois: 260 });
  });
});

describe("página pública do convite", () => {
  it("quem tem o token vê só o e-mail e o nome da família; token errado não vê nada", async () => {
    const token = await superuser(async (c) =>
      (await c.query("insert into public.convites (familia_id, email) values ($1, 'publico@teste.local') returning token", [s.A.id]))
        .rows[0].token as string,
    );
    const certo = await como("anon", async (c) => (await c.query("select * from public.convite_publico($1)", [token])).rows);
    expect(certo).toEqual({ ok: true, valor: [{ email: "publico@teste.local", familia_nome: "Família A", valido: true }] });

    const errado = await como("anon", async (c) =>
      (await c.query("select * from public.convite_publico($1)", ["00000000-0000-4000-8000-000000000000"])).rowCount,
    );
    expect(errado).toEqual({ ok: true, valor: 0 });
  });

  it("anônimo não aceita convite", async () => {
    const r = await como("anon", (c) => c.query("select public.aceitar_convite($1)", ["00000000-0000-4000-8000-000000000000"]));
    expect(r.ok).toBe(false);
  });
});

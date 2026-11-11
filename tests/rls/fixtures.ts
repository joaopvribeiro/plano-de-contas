/**
 * Monta duas famílias completas (A e B), com um registro em cada tabela,
 * e os usuários de cada papel.
 */
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { superuser, type Usuario } from "./db";

export type Familia = {
  id: string;
  contaId: string;
  categoriaId: string;
  ativoId: string;
  passivoId: string;
  lancamentoId: string;
  objeto: string;
};

export type Cenario = {
  A: Familia;
  B: Familia;
  membroA: Usuario;
  membroB: Usuario;
  consultorA: Usuario;
  consultorSemVinculo: Usuario;
  admin: Usuario;
  convidadoB: Usuario;
};

async function criarUsuario(c: Client, rotulo: string): Promise<Usuario> {
  const id = randomUUID();
  const email = `${rotulo}.${id.slice(0, 8)}@teste.local`;
  await c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  return { id, email };
}

async function criarFamilia(c: Client, nome: string): Promise<Familia> {
  const { rows } = await c.query(
    "insert into public.familias (nome, inicio_planejamento) values ($1, '2026-08') returning id",
    [nome],
  );
  const id: string = rows[0].id;
  const q = async (sql: string, p: unknown[]) => (await c.query(sql, p)).rows[0].id as string;

  const contaId = await q(
    "insert into public.contas (familia_id, nome, tipo, dia_fechamento, dia_vencimento) values ($1, 'Cartão', 'cartao_credito', 28, 5) returning id",
    [id],
  );
  const categoriaId = await q(
    "select id from public.categorias where familia_id = $1 and nome = 'Alimentação'",
    [id],
  );
  const ativoId = await q(
    "insert into public.ativos (familia_id, nome, categoria, valor) values ($1, 'CDB', 'Reserva', 1000) returning id",
    [id],
  );
  const passivoId = await q(
    "insert into public.passivos (familia_id, nome, tipo, saldo_devedor) values ($1, 'Empréstimo', 'emprestimo', 5000) returning id",
    [id],
  );
  const lancamentoId = await q(
    `insert into public.lancamentos (familia_id, tipo, mes_competencia, descricao, valor, conta_id, categoria_id, classe)
     values ($1, 'Realizado', '2026-10', 'Mercado', 250, $2, $3, 'Despesa básica') returning id`,
    [id, contaId, categoriaId],
  );
  await c.query("insert into public.regras (familia_id, padrao, categoria_id, classe) values ($1, 'MERCADO', $2, 'Despesa básica')", [id, categoriaId]);
  await c.query("insert into public.importacoes (familia_id, status, resposta_ia) values ($1, 'revisao', '{\"x\":1}')", [id]);
  await c.query("insert into public.insights (familia_id, mes, texto) values ($1, '2026-10', 'Gastos ok')", [id]);
  await c.query("insert into public.projetos (familia_id, nome, valor_alvo, prazo_mes) values ($1, 'Viagem', 10000, '2027-07')", [id]);
  await c.query("insert into public.apolices (familia_id, tipo, seguradora, premio) values ($1, 'vida', 'Seguradora', 100)", [id]);
  await c.query("insert into public.uso_ia (familia_id, recurso, modelo) values ($1, 'extrato', 'modelo-teste')", [id]);
  await c.query("insert into public.convites (familia_id, email) values ($1, $2)", [id, `convite.${id.slice(0, 8)}@teste.local`]);

  const objeto = `${id}/extratos/fatura.pdf`;
  await c.query("insert into storage.objects (bucket_id, name) values ('familias', $1)", [objeto]);

  return { id, contaId, categoriaId, ativoId, passivoId, lancamentoId, objeto };
}

export async function montarCenario(): Promise<Cenario> {
  return superuser(async (c) => {
    const membroA = await criarUsuario(c, "membro-a");
    const membroB = await criarUsuario(c, "membro-b");
    const consultorA = await criarUsuario(c, "consultor-a");
    const consultorSemVinculo = await criarUsuario(c, "consultor-x");
    const admin = await criarUsuario(c, "admin");
    const convidadoB = await criarUsuario(c, "convidado-b");

    const A = await criarFamilia(c, "Família A");
    const B = await criarFamilia(c, "Família B");

    await c.query("insert into public.consultores (user_id, nome, admin) values ($1, 'Consultor A', false), ($2, 'Consultor X', false), ($3, 'Admin', true)", [
      consultorA.id, consultorSemVinculo.id, admin.id,
    ]);
    await c.query("insert into public.familia_consultores (familia_id, consultor_id, principal) values ($1, $2, true)", [A.id, consultorA.id]);
    await c.query("insert into public.membros (user_id, familia_id, nome) values ($1, $2, 'Membro A'), ($3, $4, 'Membro B')", [
      membroA.id, A.id, membroB.id, B.id,
    ]);

    return { A, B, membroA, membroB, consultorA, consultorSemVinculo, admin, convidadoB };
  });
}

/** Tabelas com familia_id e um INSERT válido (para a família informada) usado nos testes. */
export function insercoes(f: Familia): Record<string, { sql: string; params: unknown[] }> {
  return {
    contas: { sql: "insert into public.contas (familia_id, nome, tipo) values ($1, 'Intrusa', 'dinheiro')", params: [f.id] },
    categorias: { sql: "insert into public.categorias (familia_id, nome, classe_padrao) values ($1, 'Intrusa', 'Sonhos')", params: [f.id] },
    lancamentos: {
      sql: "insert into public.lancamentos (familia_id, tipo, mes_competencia, descricao, valor, classe) values ($1, 'Previsto', '2026-11', 'Intruso', 10, 'Sonhos')",
      params: [f.id],
    },
    regras: { sql: "insert into public.regras (familia_id, padrao, natureza) values ($1, 'INTRUSA', 'transferencia')", params: [f.id] },
    importacoes: { sql: "insert into public.importacoes (familia_id) values ($1)", params: [f.id] },
    insights: { sql: "insert into public.insights (familia_id, mes, texto) values ($1, '2026-11', 'x')", params: [f.id] },
    ativos: { sql: "insert into public.ativos (familia_id, nome, categoria, valor) values ($1, 'Intruso', 'Bem', 1)", params: [f.id] },
    historico_ativos: { sql: "insert into public.historico_ativos (familia_id, ativo_id, valor) values ($1, $2, 1)", params: [f.id, f.ativoId] },
    passivos: { sql: "insert into public.passivos (familia_id, nome, tipo) values ($1, 'Intruso', 'outro')", params: [f.id] },
    historico_passivos: { sql: "insert into public.historico_passivos (familia_id, passivo_id, saldo_devedor) values ($1, $2, 1)", params: [f.id, f.passivoId] },
    projetos: { sql: "insert into public.projetos (familia_id, nome, valor_alvo, prazo_mes) values ($1, 'Intruso', 1, '2027-01')", params: [f.id] },
    apolices: { sql: "insert into public.apolices (familia_id, tipo) values ($1, 'outro')", params: [f.id] },
    metas_classe: {
      sql: "insert into public.metas_classe (familia_id, classe, percentual_max_receita) values ($1, 'Sonhos', 1) on conflict (familia_id, classe) do update set percentual_max_receita = 1",
      params: [f.id],
    },
    objetivos_config: {
      sql: "insert into public.objetivos_config (familia_id) values ($1) on conflict (familia_id) do update set reserva_meses = 1",
      params: [f.id],
    },
    limites_ia: {
      sql: "insert into public.limites_ia (familia_id) values ($1) on conflict (familia_id) do update set extrato_mes = 999",
      params: [f.id],
    },
    uso_ia: { sql: "insert into public.uso_ia (familia_id, recurso, modelo) values ($1, 'insight', 'x')", params: [f.id] },
    auditoria: { sql: "insert into public.auditoria (familia_id, tabela, acao) values ($1, 'x', 'INSERT')", params: [f.id] },
    convites: { sql: "insert into public.convites (familia_id, email) values ($1, 'intruso@teste.local')", params: [f.id] },
    membros: { sql: "insert into public.membros (user_id, familia_id, nome) values (auth.uid(), $1, 'Intruso')", params: [f.id] },
    consentimentos: {
      sql: "insert into public.consentimentos (user_id, familia_id, tipo, versao) values (auth.uid(), $1, 'termos', 'v1')",
      params: [f.id],
    },
    familia_consultores: {
      sql: "insert into public.familia_consultores (familia_id, consultor_id) values ($1, auth.uid())",
      params: [f.id],
    },
  };
}

/** Todas as tabelas do esquema public que têm a coluna familia_id. */
export const TABELAS_COM_FAMILIA = [
  "apolices", "ativos", "auditoria", "categorias", "consentimentos", "contas", "convites",
  "familia_consultores", "historico_ativos", "historico_passivos", "importacoes", "insights",
  "lancamentos", "limites_ia", "membros", "metas_classe", "objetivos_config", "passivos",
  "projetos", "regras", "uso_ia",
] as const;

-- ============================================================================
-- Etapa 4 — Importação de extratos e faturas com IA
-- 1. Consentimento para os recursos de IA (por família).
-- 2. Uso e limite mensal de IA.
-- 3. Busca de possíveis lançamentos duplicados.
-- ============================================================================

-- 1. Consentimento -------------------------------------------------------------
-- A família tem consentimento quando alguém com acesso a ela (membro, ou o
-- consultor declarando que coletou a autorização) aceitou a versão vigente.
create or replace function public.familia_tem_consentimento_ia(p_familia uuid, p_versao text default 'ia-v1')
returns boolean language sql stable security definer set search_path = '' as $$
  select public.pode_acessar_familia(p_familia)
     and exists (
       select 1 from public.consentimentos c
       where c.familia_id = p_familia and c.tipo = 'ia' and c.versao = p_versao
     )
$$;
revoke execute on function public.familia_tem_consentimento_ia(uuid, text) from public, anon;
grant execute on function public.familia_tem_consentimento_ia(uuid, text) to authenticated;

-- 2. Uso de IA -------------------------------------------------------------------
-- Usos do mês corrente (fuso de São Paulo) e o limite configurado.
create or replace function public.uso_ia_no_mes(p_familia uuid, p_recurso text)
returns table (usados int, limite int)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::int from public.uso_ia u
      where u.familia_id = p_familia and u.recurso = p_recurso
        and u.criado_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')),
    (select case p_recurso
              when 'extrato' then l.extrato_mes
              when 'apolice' then l.apolice_mes
              when 'insight' then l.insight_mes
            end
       from public.limites_ia l where l.familia_id = p_familia)
  where public.pode_acessar_familia(p_familia)
$$;
revoke execute on function public.uso_ia_no_mes(uuid, text) from public, anon;
grant execute on function public.uso_ia_no_mes(uuid, text) to authenticated;

-- Registra uma chamada à IA. A tabela uso_ia não aceita escrita direta.
create or replace function public.registrar_uso_ia(
  p_familia uuid, p_recurso text, p_modelo text, p_tokens_entrada int, p_tokens_saida int
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_acessar_familia(p_familia) then
    raise exception 'Sem acesso à família.' using errcode = '42501';
  end if;
  insert into public.uso_ia (familia_id, recurso, modelo, tokens_entrada, tokens_saida)
  values (p_familia, p_recurso, left(p_modelo, 80), greatest(coalesce(p_tokens_entrada, 0), 0), greatest(coalesce(p_tokens_saida, 0), 0));
end $$;
revoke execute on function public.registrar_uso_ia(uuid, text, text, int, int) from public, anon;
grant execute on function public.registrar_uso_ia(uuid, text, text, int, int) to authenticated;

-- 3. Possíveis duplicadas --------------------------------------------------------
-- Critério (DECISOES.md, item 13): lançamento realizado já existente na mesma
-- conta, valor igual (± R$ 0,01), data a até 3 dias e descrição parecida
-- (similaridade de trigramas >= 0,6). Roda com a RLS de quem chama.
-- p_itens: [{"idx": 0, "data": "2026-10-05", "valor": 120.5, "descricao": "PETZ"}]
create or replace function public.possiveis_duplicadas(p_familia uuid, p_conta uuid, p_itens jsonb)
returns table (idx int, lancamento_id uuid, descricao text, data date, valor numeric)
language sql stable security invoker set search_path = '' as $$
  select distinct on (i.idx) i.idx, l.id, l.descricao, l.data, l.valor
  from jsonb_to_recordset(p_itens) as i(idx int, data date, valor numeric, descricao text)
  join public.lancamentos l
    on l.familia_id = p_familia
   and l.tipo = 'Realizado'
   and l.conta_id is not distinct from p_conta
   and abs(l.valor - i.valor) <= 0.01
   and l.data between i.data - 3 and i.data + 3
   and extensions.similarity(upper(l.descricao), upper(i.descricao)) >= 0.6
  order by i.idx, extensions.similarity(upper(l.descricao), upper(i.descricao)) desc
$$;
revoke execute on function public.possiveis_duplicadas(uuid, uuid, jsonb) from public, anon;
grant execute on function public.possiveis_duplicadas(uuid, uuid, jsonb) to authenticated;

-- Importações: arquivos ficam no Storage em <familia>/extratos/<importacao>/...
-- Índice para listar o histórico da família.
create index if not exists importacoes_familia_idx on public.importacoes (familia_id, criado_em desc);

-- Conta (ou cartão) do documento importado. Escolhida antes da leitura.
alter table public.importacoes add column conta_id uuid;
alter table public.importacoes
  add constraint importacoes_conta_fk foreign key (familia_id, conta_id) references public.contas (familia_id, id);
-- Nome do arquivo original (sem o caminho do Storage), para o histórico.
alter table public.importacoes add column nomes_arquivos text[] not null default '{}';

-- Confirmação da importação numa transação só: grava os realizados (e as
-- parcelas futuras), liga as parcelas previstas que foram realizadas, cria as
-- regras pedidas na revisão e marca a importação como confirmada.
-- security invoker: a RLS de lançamentos e regras vale para quem chama.
create or replace function public.confirmar_importacao(
  p_importacao uuid, p_lancamentos jsonb, p_vinculos jsonb, p_regras jsonb
)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  v_familia uuid;
  v_conta uuid;
  v_n int;
begin
  select i.familia_id, i.conta_id into v_familia, v_conta
  from public.importacoes i
  where i.id = p_importacao and i.status = 'revisao'
  for update;
  if v_familia is null then
    raise exception 'Importação não encontrada ou já confirmada.' using errcode = 'P0002';
  end if;

  insert into public.lancamentos (
    id, familia_id, tipo, natureza, mes_competencia, data, descricao, valor, estorno, conta_id,
    categoria_id, classe, parcela, grupo_parcela, assinatura, origem, importacao_id, criado_por
  )
  select r.id, v_familia, r.tipo, r.natureza, r.mes_competencia, r.data, r.descricao, r.valor, r.estorno, v_conta,
         r.categoria_id, r.classe, r.parcela, r.grupo_parcela, coalesce(r.assinatura, false), r.origem, p_importacao, auth.uid()
  from jsonb_to_recordset(p_lancamentos) as r(
    id uuid, tipo text, natureza text, mes_competencia text, data date, descricao text, valor numeric, estorno boolean,
    categoria_id uuid, classe text, parcela text, grupo_parcela uuid, assinatura boolean, origem text
  )
  where r.origem in ('ia', 'ia-parcela');
  get diagnostics v_n = row_count;

  update public.lancamentos l
     set realizado_id = v.realizado_id, grupo_parcela = coalesce(l.grupo_parcela, v.grupo_parcela)
  from jsonb_to_recordset(p_vinculos) as v(previsto_id uuid, realizado_id uuid, grupo_parcela uuid)
  where l.id = v.previsto_id and l.familia_id = v_familia and l.tipo = 'Previsto' and l.realizado_id is null;

  insert into public.regras (familia_id, padrao, natureza, categoria_id, classe, assinatura)
  select v_familia, r.padrao, r.natureza, r.categoria_id, r.classe, false
  from jsonb_to_recordset(p_regras) as r(padrao text, natureza text, categoria_id uuid, classe text)
  on conflict (familia_id, padrao) do nothing;

  update public.importacoes set status = 'confirmada' where id = p_importacao;
  return v_n;
end $$;
revoke execute on function public.confirmar_importacao(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.confirmar_importacao(uuid, jsonb, jsonb, jsonb) to authenticated;
